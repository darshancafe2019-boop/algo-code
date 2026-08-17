import sys
import os
import subprocess
import time
import threading
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from src import config
from src.audit import log_audit_event, log_notification

logger = logging.getLogger("ProcessManager")

def kill_process_by_pid(pid: int):
    """Safely terminate a process by PID."""
    if not pid or pid <= 0:
        return
    try:
        if os.name == 'nt':
            import ctypes
            PROCESS_TERMINATE = 0x0001
            handle = ctypes.windll.kernel32.OpenProcess(PROCESS_TERMINATE, False, pid)
            if handle:
                ctypes.windll.kernel32.TerminateProcess(handle, 1)
                ctypes.windll.kernel32.CloseHandle(handle)
        else:
            import signal
            os.kill(pid, signal.SIGKILL)
    except Exception as e:
        logger.warning(f"Could not kill process {pid}: {e}")

def get_bot_pid_file(bot_id: str) -> Path:
    data_dir = config.BASE_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / f"bot_{bot_id}.pid"

def cleanup_orphan_bot_process(bot_id: str):
    pid_file = get_bot_pid_file(bot_id)
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text().strip())
            kill_process_by_pid(pid)
        except Exception as e:
            logger.warning(f"Error cleaning up orphan process for bot {bot_id}: {e}")
        finally:
            try:
                pid_file.unlink(missing_ok=True)
            except Exception:
                pass

# ---------------------------------------------------------------------------
# AUTHORITATIVE BOT LIFECYCLE STATES
# ---------------------------------------------------------------------------
BOT_STATE_CREATED = "CREATED"
BOT_STATE_STARTING = "STARTING"
BOT_STATE_RUNNING = "RUNNING"
BOT_STATE_PAUSING = "PAUSING"
BOT_STATE_PAUSED = "PAUSED"
BOT_STATE_RESUMING = "RESUMING"
BOT_STATE_STOPPING = "STOPPING"
BOT_STATE_STOPPED = "STOPPED"
BOT_STATE_ERROR = "ERROR"
BOT_STATE_RECOVERING = "RECOVERING"
BOT_STATE_HALTED = "TRADING HALTED"

VALID_BOT_STATES = {
    BOT_STATE_CREATED,
    BOT_STATE_STARTING,
    BOT_STATE_RUNNING,
    BOT_STATE_PAUSING,
    BOT_STATE_PAUSED,
    BOT_STATE_RESUMING,
    BOT_STATE_STOPPING,
    BOT_STATE_STOPPED,
    BOT_STATE_ERROR,
    BOT_STATE_RECOVERING,
    BOT_STATE_HALTED
}

class BotProcessManager:
    """Manages the background execution of live_runner.py for a specific bot instance."""

    def __init__(self, bot_id: str = "bot-1"):
        self.bot_id = bot_id
        self.process: Optional[subprocess.Popen] = None
        self.log_file_handle = None
        self.start_time: Optional[datetime] = None
        self.is_paused: bool = False
        self.status_state: str = BOT_STATE_STOPPED
        self.last_error: str = ""

    def start_bot(self) -> Dict[str, Any]:
        """Start the live runner process cleanly with state-machine & idempotency validation."""
        # Fast live check
        if self.is_running() and self.status_state == BOT_STATE_RUNNING:
            return {
                "status": "already_running",
                "message": f"Bot '{self.bot_id}' is already running.",
                "pid": self.process.pid if self.process else None
            }

        # Check if kill switch active
        if config.KILL_SWITCH_FILE.exists():
            return {
                "status": "error",
                "message": "Kill switch is active. Deactivate kill switch first."
            }

        # Clean up any existing dead process file for this bot instance first
        cleanup_orphan_bot_process(self.bot_id)

        self.status_state = BOT_STATE_STARTING

        try:
            python_executable = sys.executable
            runner_path = config.BASE_DIR / "src" / "live_runner.py"
            
            log_dir = config.BASE_DIR / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            bot_log_file = log_dir / f"bot_{self.bot_id}.log"
            self.log_file_handle = open(bot_log_file, "ab", buffering=0)

            # Spawn process with --bot_id and unbuffered output redirected to log file
            self.process = subprocess.Popen(
                [python_executable, "-u", str(runner_path), "--bot_id", self.bot_id],
                cwd=str(config.BASE_DIR),
                stdout=self.log_file_handle,
                stderr=self.log_file_handle
            )

            now_utc = datetime.now(timezone.utc)
            self.start_time = now_utc
            self.is_paused = False
            self.status_state = BOT_STATE_RUNNING
            self.last_error = ""

            # Save PID to file for single instance enforcement
            try:
                get_bot_pid_file(self.bot_id).write_text(str(self.process.pid))
            except Exception as pe:
                logger.warning(f"Failed to write PID file for bot {self.bot_id}: {pe}")

            # Persist RUNNING state to DB
            try:
                from src.db import get_connection
                conn = get_connection()
                conn.execute(
                    "UPDATE bot_instances SET status = 'RUNNING', started_at = ?, stopped_at = NULL WHERE id = ?",
                    (now_utc.isoformat(), self.bot_id)
                )
                conn.commit()
                conn.close()
            except Exception as dbe:
                logger.warning(f"Could not update bot_instances status for {self.bot_id}: {dbe}")

            log_audit_event(action="BOT_START", user="Trader", details={"bot_id": self.bot_id, "pid": self.process.pid})
            log_notification("INFO", "Bot Control", f"Bot {self.bot_id} started (PID {self.process.pid}).")
            return {
                "status": "success",
                "message": f"Bot {self.bot_id} started successfully (PID: {self.process.pid}).",
                "pid": self.process.pid,
                "state": BOT_STATE_RUNNING
            }
        except Exception as e:
            self.status_state = BOT_STATE_ERROR
            self.last_error = str(e)
            logger.error(f"Failed to start bot process {self.bot_id}: {e}")
            log_notification("ERROR", "Bot Control", f"Failed to start bot {self.bot_id}: {e}")
            return {"status": "error", "message": str(e), "state": BOT_STATE_ERROR}

    def stop_bot(self) -> Dict[str, Any]:
        """Stop the live runner process cleanly."""
        self.status_state = BOT_STATE_STOPPING
        try:
            if self.process:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                self.process = None

            if self.log_file_handle:
                try:
                    self.log_file_handle.close()
                except Exception:
                    pass
                self.log_file_handle = None

            cleanup_orphan_bot_process(self.bot_id)

            self.status_state = BOT_STATE_STOPPED
            self.is_paused = False
            self.start_time = None

            # Persist STOPPED state to DB
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                from src.db import get_connection
                conn = get_connection()
                conn.execute(
                    "UPDATE bot_instances SET status = 'STOPPED', stopped_at = ? WHERE id = ?",
                    (now_iso, self.bot_id)
                )
                conn.commit()
                conn.close()
            except Exception:
                pass

            log_audit_event(action="BOT_STOP", user="Trader", details={"bot_id": self.bot_id})
            log_notification("WARNING", "Bot Control", f"Bot {self.bot_id} stopped.")
            return {"status": "success", "message": f"Bot {self.bot_id} stopped successfully.", "state": BOT_STATE_STOPPED}
        except Exception as e:
            self.status_state = BOT_STATE_ERROR
            self.last_error = str(e)
            logger.error(f"Error stopping bot process {self.bot_id}: {e}")
            return {"status": "error", "message": str(e), "state": BOT_STATE_ERROR}

    def restart_bot(self) -> Dict[str, Any]:
        """Stop if running and start worker process cleanly."""
        self.stop_bot()
        time.sleep(0.3)
        return self.start_bot()

    def pause_bot(self) -> Dict[str, Any]:
        """Pause trading bot evaluation cycles."""
        if not self.is_running():
            return {"status": "error", "message": "Bot is not running and cannot be paused."}

        self.status_state = BOT_STATE_PAUSING
        self.is_paused = True
        self.status_state = BOT_STATE_PAUSED

        # Persist PAUSED state to DB
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            from src.db import get_connection
            conn = get_connection()
            conn.execute(
                "UPDATE bot_instances SET status = 'PAUSED', paused_at = ? WHERE id = ?",
                (now_iso, self.bot_id)
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

        log_audit_event(action="BOT_PAUSE", user="Trader", details={"bot_id": self.bot_id})
        log_notification("WARNING", "Bot Control", f"Bot {self.bot_id} execution paused.")
        return {"status": "success", "message": f"Bot {self.bot_id} execution paused.", "state": BOT_STATE_PAUSED}

    def resume_bot(self) -> Dict[str, Any]:
        """Resume trading bot execution cycles."""
        if config.KILL_SWITCH_FILE.exists():
            return {"status": "error", "message": "Cannot resume: 🔴 TRADING HALTED via Emergency Kill Switch."}
        if self.status_state != BOT_STATE_PAUSED:
            return {"status": "error", "message": "Bot is not paused and cannot be resumed."}

        self.status_state = BOT_STATE_RESUMING
        self.is_paused = False
        self.status_state = BOT_STATE_RUNNING

        # Persist RUNNING state to DB
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            from src.db import get_connection
            conn = get_connection()
            conn.execute(
                "UPDATE bot_instances SET status = 'RUNNING', resumed_at = ? WHERE id = ?",
                (now_iso, self.bot_id)
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

        log_audit_event(action="BOT_RESUME", user="Trader", details={"bot_id": self.bot_id})
        log_notification("INFO", "Bot Control", f"Bot {self.bot_id} execution resumed.")
        return {"status": "success", "message": f"Bot {self.bot_id} execution resumed.", "state": BOT_STATE_RUNNING}


    def trigger_kill_switch(self) -> Dict[str, Any]:
        """Activate Kill Switch: cancel pending orders, close active positions, stop process, and lock execution."""
        try:
            config.KILL_SWITCH_FILE.touch(exist_ok=True)
            self.stop_bot()
            self.status_state = BOT_STATE_HALTED

            # Emergency position exit and pending order cancellation in DB
            from src.db import close_all_open_positions_and_cancel_orders
            halt_res = close_all_open_positions_and_cancel_orders("TRADING HALTED: Emergency Kill Switch Triggered")

            log_audit_event(action="KILL_SWITCH_ACTIVATED", user="Trader", details={"reason": "Manual Kill Switch Triggered", "closed_positions": halt_res.get("closed_positions", 0)})
            log_notification("ERROR", "Kill Switch", f"🔴 TRADING HALTED! Bot stopped, {halt_res.get('closed_positions', 0)} open position(s) closed & pending orders cancelled.")
            return {"status": "success", "message": f"🔴 TRADING HALTED. All trading stopped, {halt_res.get('closed_positions', 0)} open position(s) closed, pipeline locked."}
        except Exception as e:
            logger.error(f"Failed to activate kill switch: {e}")
            return {"status": "error", "message": str(e)}

    def deactivate_kill_switch(self) -> Dict[str, Any]:
        """Deactivate Kill Switch flag and unlock execution pipeline."""
        try:
            if config.KILL_SWITCH_FILE.exists():
                config.KILL_SWITCH_FILE.unlink()
            if self.status_state == BOT_STATE_HALTED:
                self.status_state = BOT_STATE_STOPPED
            try:
                from src.db import get_connection
                conn = get_connection()
                conn.execute("UPDATE bot_instances SET status = 'STOPPED' WHERE status = 'HALTED'")
                conn.commit()
                conn.close()
            except Exception:
                pass
            log_audit_event(action="KILL_SWITCH_DEACTIVATED", user="Trader")
            log_notification("INFO", "Kill Switch", "Kill switch deactivated. Trading system unlocked.")
            return {"status": "success", "message": "Kill switch deactivated. System unlocked."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def is_running(self) -> bool:
        """Lightweight check if process is active via handle or PID file without database writes."""
        alive = False
        if self.process is not None:
            poll = self.process.poll()
            if poll is None:
                alive = True
            else:
                self.process = None

        if not alive:
            pid_file = get_bot_pid_file(self.bot_id)
            if pid_file.exists():
                try:
                    pid = int(pid_file.read_text().strip())
                    if os.name == 'nt':
                        import ctypes
                        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
                        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
                        if handle:
                            alive = True
                            ctypes.windll.kernel32.CloseHandle(handle)
                    else:
                        os.kill(pid, 0)
                        alive = True
                except Exception:
                    alive = False

                if not alive:
                    try:
                        pid_file.unlink(missing_ok=True)
                    except Exception:
                        pass

        if not alive and self.status_state == BOT_STATE_RUNNING:
            self.status_state = BOT_STATE_STOPPED

        return alive

    def get_status(self) -> Dict[str, Any]:
        """Return authoritative bot status and server-calculated uptime."""
        running = self.is_running()
        uptime_seconds = 0
        uptime_formatted = "0m 0s"
        db_status = BOT_STATE_STOPPED

        # Authoritative uptime calculation from server DB timestamps
        try:
            from src.db import safe_query_one
            b = safe_query_one("SELECT started_at, paused_at, resumed_at, stopped_at, status, last_heartbeat, last_scan_at FROM bot_instances WHERE id = ?", (self.bot_id,))
            if b and b.get("started_at"):
                db_status = b.get("status") or "STOPPED"
                st_str = b["started_at"].replace("Z", "+00:00")
                st = datetime.fromisoformat(st_str)
                if st.tzinfo is None:
                    st = st.replace(tzinfo=timezone.utc)
                now_utc = datetime.now(timezone.utc)
                
                if db_status in ["RUNNING", "PAUSED"] and running:
                    uptime_seconds = max(0, int((now_utc - st).total_seconds()))
                elif b.get("stopped_at"):
                    stop_str = b["stopped_at"].replace("Z", "+00:00")
                    try:
                        stop_dt = datetime.fromisoformat(stop_str)
                        if stop_dt.tzinfo is None:
                            stop_dt = stop_dt.replace(tzinfo=timezone.utc)
                        uptime_seconds = max(0, int((stop_dt - st).total_seconds()))
                    except Exception:
                        uptime_seconds = 0
        except Exception:
            if running and self.start_time:
                delta = datetime.now(timezone.utc) - self.start_time
                uptime_seconds = max(0, int(delta.total_seconds()))

        hours, remainder = divmod(uptime_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        if hours > 0:
            uptime_formatted = f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0 or seconds > 0:
            uptime_formatted = f"{minutes}m {seconds}s"
        else:
            uptime_formatted = "0m 0s"

        kill_switch_active = config.KILL_SWITCH_FILE.exists()

        state = self.status_state
        if kill_switch_active:
            state = BOT_STATE_HALTED
        elif not running and state not in [BOT_STATE_PAUSED, BOT_STATE_ERROR, BOT_STATE_CREATED]:
            state = db_status if db_status in [BOT_STATE_RUNNING, BOT_STATE_PAUSED] else BOT_STATE_STOPPED

        is_running_flag = running or (state == BOT_STATE_RUNNING) or (db_status == BOT_STATE_RUNNING)
        is_paused_flag = self.is_paused or (state == BOT_STATE_PAUSED) or (db_status == BOT_STATE_PAUSED)

        return {
            "status": state,
            "is_running": is_running_flag,
            "is_paused": is_paused_flag,
            "kill_switch_active": kill_switch_active,
            "uptime_seconds": uptime_seconds,
            "uptime_formatted": uptime_formatted,
            "pid": self.process.pid if self.process else None,
            "last_error": self.last_error
        }



class MultiBotManager:
    """Manages multi-instance bot processes and links with database bot_instances."""

    def __init__(self):
        self.managers: Dict[str, BotProcessManager] = {}

    def get_manager(self, bot_id: str = "bot-1") -> BotProcessManager:
        if bot_id not in self.managers:
            self.managers[bot_id] = BotProcessManager(bot_id=bot_id)
        return self.managers[bot_id]

    def start_bot(self, bot_id: str = "bot-1") -> Dict[str, Any]:
        mgr = self.get_manager(bot_id)
        res = mgr.start_bot()
        if res.get("status") in ["success", "already_running"]:
            self._update_db_status(bot_id, BOT_STATE_RUNNING, pid=res.get("pid"))
        elif res.get("status") == "error":
            self._update_db_status(bot_id, BOT_STATE_ERROR, error=res.get("message"))
        return res

    def stop_bot(self, bot_id: str = "bot-1") -> Dict[str, Any]:
        mgr = self.get_manager(bot_id)
        res = mgr.stop_bot()
        self._update_db_status(bot_id, BOT_STATE_STOPPED)
        return res

    def pause_bot(self, bot_id: str = "bot-1") -> Dict[str, Any]:
        mgr = self.get_manager(bot_id)
        res = mgr.pause_bot()
        if res.get("status") == "success":
            self._update_db_status(bot_id, BOT_STATE_PAUSED)
        return res

    def resume_bot(self, bot_id: str = "bot-1") -> Dict[str, Any]:
        mgr = self.get_manager(bot_id)
        res = mgr.resume_bot()
        if res.get("status") == "success":
            self._update_db_status(bot_id, BOT_STATE_RUNNING)
        return res

    def restart_bot(self, bot_id: str = "bot-1") -> Dict[str, Any]:
        mgr = self.get_manager(bot_id)
        res = mgr.restart_bot()
        if res.get("status") in ["success", "already_running"]:
            self._update_db_status(bot_id, BOT_STATE_RUNNING, pid=res.get("pid"))
        return res

    def trigger_kill_switch(self, bot_id: str = "bot-1") -> Dict[str, Any]:
        mgr = self.get_manager(bot_id)
        res = mgr.trigger_kill_switch()
        self._update_db_status(bot_id, "HALTED")
        return res

    def deactivate_kill_switch(self, bot_id: str = "bot-1") -> Dict[str, Any]:
        mgr = self.get_manager(bot_id)
        res = mgr.deactivate_kill_switch()
        self._update_db_status(bot_id, BOT_STATE_STOPPED)
        return res

    def start_all_bots(self) -> Dict[str, Any]:
        """
        Safely validate and start all configured bot instances in the database.
        """
        if config.KILL_SWITCH_FILE.exists():
            return {"status": "error", "message": "Kill switch is active."}

        try:
            from src.db import get_connection
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM bot_instances WHERE COALESCE(is_deleted, 0) = 0")
            bots = [dict(r) for r in cursor.fetchall()]
            conn.close()
        except Exception as e:
            return {"status": "error", "message": f"DB Error: {e}"}

        started_list = []
        skipped_list = []
        for bot in bots:
            bot_id = bot["id"]
            mode = (bot.get("execution_mode") or "PAPER").upper()

            # Pre-flight check: If live trading disabled globally, skip live bots
            if mode == "LIVE":
                if not getattr(config, "LIVE_TRADING_ENABLED", False):
                    skipped_list.append(bot_id)
                    continue

            res = self.start_bot(bot_id)
            if res.get("status") in ["success", "already_running"]:
                started_list.append(bot_id)
            else:
                skipped_list.append(bot_id)

        return {
            "status": "success",
            "started_count": len(started_list),
            "skipped_count": len(skipped_list),
            "started": started_list,
            "skipped": skipped_list
        }


    def pause_all_bots(self) -> Dict[str, Any]:
        """Pauses all currently running bot instances."""
        try:
            from src.db import get_connection
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM bot_instances WHERE status = 'RUNNING' AND COALESCE(is_deleted, 0) = 0")
            running_bots = [dict(r) for r in cursor.fetchall()]
            conn.close()
        except Exception as e:
            return {"status": "error", "message": str(e)}

        paused = []
        for b in running_bots:
            res = self.pause_bot(b["id"])
            if res.get("status") == "success":
                paused.append(b["name"])

        return {"status": "success", "message": f"Paused {len(paused)} bot(s).", "count": len(paused)}

    def stop_all_bots(self) -> Dict[str, Any]:
        """Stops all running and paused bot instances."""
        try:
            from src.db import get_connection
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM bot_instances WHERE status IN ('RUNNING', 'PAUSED') AND COALESCE(is_deleted, 0) = 0")
            active_bots = [dict(r) for r in cursor.fetchall()]
            conn.close()
        except Exception as e:
            return {"status": "error", "message": str(e)}

        stopped = []
        for b in active_bots:
            res = self.stop_bot(b["id"])
            if res.get("status") == "success":
                stopped.append(b["name"])

        return {"status": "success", "message": f"Stopped {len(stopped)} bot(s).", "count": len(stopped)}

    def execute_group_action(self, group_name: str, action: str) -> Dict[str, Any]:
        """Execute a bulk START, PAUSE, RESUME, or STOP action for all bots in a named group."""
        action = (action or "").upper()
        if action not in ["START", "PAUSE", "RESUME", "STOP"]:
            return {"status": "error", "message": f"Unsupported group action: {action}"}

        if action in ["START", "RESUME"] and config.KILL_SWITCH_FILE.exists():
            return {"status": "error", "message": "Cannot start/resume group bots: 🔴 TRADING HALTED via Emergency Kill Switch."}

        try:
            from src.db import get_connection
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM bot_instances WHERE group_name = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY id ASC", (group_name,))
            bots = [dict(r) for r in cursor.fetchall()]
            conn.close()
        except Exception as e:
            return {"status": "error", "message": f"Failed to fetch bots for group '{group_name}': {e}"}

        results = []
        for b in bots:
            b_id = b["id"]
            b_name = b.get("name") or b_id
            mgr = self.get_manager(b_id)

            if action == "START":
                if mgr.is_running():
                    results.append({"bot_id": b_id, "name": b_name, "status": "ALREADY_RUNNING", "message": "Already running"})
                else:
                    res = self.start_bot(b_id)
                    results.append({"bot_id": b_id, "name": b_name, "status": "STARTED" if res.get("status") == "success" else "ERROR", "message": res.get("message", "")})
            elif action == "PAUSE":
                if mgr.status_state == BOT_STATE_PAUSED:
                    results.append({"bot_id": b_id, "name": b_name, "status": "ALREADY_PAUSED", "message": "Already paused"})
                else:
                    res = self.pause_bot(b_id)
                    results.append({"bot_id": b_id, "name": b_name, "status": "PAUSED" if res.get("status") == "success" else "ERROR", "message": res.get("message", "")})
            elif action == "RESUME":
                if mgr.status_state != BOT_STATE_PAUSED:
                    results.append({"bot_id": b_id, "name": b_name, "status": "SKIPPED", "message": "Not paused"})
                else:
                    res = self.resume_bot(b_id)
                    results.append({"bot_id": b_id, "name": b_name, "status": "RESUMED" if res.get("status") == "success" else "ERROR", "message": res.get("message", "")})
            elif action == "STOP":
                if not mgr.is_running() and mgr.status_state == BOT_STATE_STOPPED:
                    results.append({"bot_id": b_id, "name": b_name, "status": "ALREADY_STOPPED", "message": "Already stopped"})
                else:
                    res = self.stop_bot(b_id)
                    results.append({"bot_id": b_id, "name": b_name, "status": "STOPPED" if res.get("status") == "success" else "ERROR", "message": res.get("message", "")})

        success_count = sum(1 for r in results if r["status"] in ["STARTED", "PAUSED", "RESUMED", "STOPPED"])
        return {
            "status": "success",
            "group_name": group_name,
            "action": action,
            "message": f"Group '{group_name}' {action} executed: {success_count}/{len(results)} updated.",
            "total_bots": len(results),
            "results": results
        }

    control_group_bots = execute_group_action

    def _update_db_status(self, bot_id: str, status: str, pid: Optional[int] = None, error: Optional[str] = None) -> None:

        try:
            from src.db import get_connection
            conn = get_connection()
            c = conn.cursor()
            now_str = datetime.now(timezone.utc).isoformat()

            if status == BOT_STATE_RUNNING:
                c.execute("""
                    UPDATE bot_instances 
                    SET status = 'RUNNING', 
                        started_at = COALESCE(started_at, ?), 
                        last_heartbeat = ?,
                        process_id = COALESCE(?, process_id),
                        last_error = ''
                    WHERE id = ?
                """, (now_str, now_str, str(pid) if pid else None, bot_id))
            elif status == BOT_STATE_PAUSED:
                c.execute("UPDATE bot_instances SET status = 'PAUSED', paused_at = ? WHERE id = ?", (now_str, bot_id))
            elif status == BOT_STATE_STOPPED:
                c.execute("UPDATE bot_instances SET status = 'STOPPED', stopped_at = ?, process_id = '' WHERE id = ?", (now_str, bot_id))
            elif status == BOT_STATE_ERROR:
                c.execute("UPDATE bot_instances SET status = 'ERROR', last_error = ? WHERE id = ?", (error or "Runtime error", bot_id))
            else:
                c.execute("UPDATE bot_instances SET status = ? WHERE id = ?", (status, bot_id))

            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to update db status for bot {bot_id}: {e}")


class BotWatchdog(threading.Thread):
    """Background watchdog thread that detects stalled bot instances and attempts automatic self-recovery."""
    def __init__(self, check_interval_sec: int = 30, stall_threshold_sec: int = 900):
        super().__init__(daemon=True, name="BotWatchdogThread")
        self.check_interval = check_interval_sec
        self.stall_threshold = stall_threshold_sec
        self._running = True
        self._last_recovery_time: Dict[str, float] = {}

    def run(self):
        logger.info("BotWatchdog thread started.")
        while self._running:
            try:
                self._check_stalled_bots()
            except Exception as e:
                logger.error(f"Error in BotWatchdog loop: {e}")
            time.sleep(self.check_interval)

    def _check_stalled_bots(self):
        from src.db import get_connection, log_bot_activity
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, timeframe, status, last_checked_at FROM bot_instances WHERE status IN ('RUNNING', 'PAUSED') AND COALESCE(is_deleted, 0) = 0")
            rows = cursor.fetchall()
            conn.close()

            now_utc = datetime.now(timezone.utc)
            now_ts = time.time()
            
            for r in rows:
                bot_id = r['id']
                b_name = r['name']
                tf_str = r['timeframe'] or '5m'
                last_checked_str = r['last_checked_at']
                
                if not last_checked_str:
                    continue

                try:
                    last_dt = datetime.fromisoformat(last_checked_str.replace("Z", "+00:00"))
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=timezone.utc)
                    seconds_ago = int((now_utc - last_dt).total_seconds())
                except Exception:
                    continue

                from src.indicators import get_timeframe_minutes
                tf_mins = get_timeframe_minutes(tf_str)
                dynamic_stall_threshold = max(600, int(tf_mins * 60 * 2.5))
                effective_threshold = self.stall_threshold if self.stall_threshold != 900 else dynamic_stall_threshold

                if seconds_ago > effective_threshold:
                    # Enforce cooldown of 120 seconds between auto-recovery attempts per bot
                    last_rec = self._last_recovery_time.get(bot_id, 0)
                    if now_ts - last_rec < 120:
                        continue
                    self._last_recovery_time[bot_id] = now_ts

                    msg = f"Watchdog detected stall — attempting automatic restart for '{b_name}' ({bot_id}, {seconds_ago}s inactive)."
                    logger.warning(msg)
                    log_bot_activity(bot_id, "STALLED_RECOVERY", "Watchdog detected stall — attempting automatic restart", {"seconds_ago": seconds_ago})
                    log_notification("WARNING", "Watchdog Recovery", msg)

                    # Update status in DB
                    try:
                        conn2 = get_connection()
                        conn2.execute("UPDATE bot_instances SET status = 'STALLED' WHERE id = ?", (bot_id,))
                        conn2.commit()
                        conn2.close()
                    except Exception:
                        pass

                    # Attempt restart
                    multi_bot_manager.stop_bot(bot_id)
                    time.sleep(0.5)
                    start_res = multi_bot_manager.start_bot(bot_id)

                    if start_res.get("status") in ["success", "already_running"]:
                        log_bot_activity(bot_id, "RESTART_SUCCESS", f"Watchdog auto-recovered bot instance '{b_name}'. Process PID: {start_res.get('pid')}")
                        logger.info(f"Watchdog auto-recovery succeeded for '{b_name}' ({bot_id}).")
                        try:
                            from src.telegram_alert import TelegramAlert
                            TelegramAlert().send_message(f"🔄 <b>Watchdog Auto-Recovery</b>\nBot <code>{b_name}</code> was stalled and was automatically restarted successfully.")
                        except Exception:
                            pass
                    else:
                        fail_msg = f"Watchdog auto-recovery failed for bot '{b_name}' ({bot_id}): {start_res.get('message')}"
                        logger.error(fail_msg)
                        log_bot_activity(bot_id, "RESTART_FAILED", fail_msg)
                        log_notification("ERROR", "Watchdog Alert", f"CRITICAL: Watchdog failed to auto-recover stalled bot {bot_id}: {start_res.get('message')}. Manual intervention required.")
        except Exception as e:
            logger.error(f"Watchdog check failed: {e}")


bot_manager = BotProcessManager()
multi_bot_manager = MultiBotManager()

_watchdog_lock = threading.Lock()
_watchdog_instance: Optional[BotWatchdog] = None


def get_watchdog() -> BotWatchdog:
    global _watchdog_instance
    with _watchdog_lock:
        if _watchdog_instance is None or not _watchdog_instance.is_alive():
            _watchdog_instance = BotWatchdog(check_interval_sec=30, stall_threshold_sec=900)
            _watchdog_instance.start()
        return _watchdog_instance


def start_watchdog_thread():
    """Start the background watchdog thread once."""
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    get_watchdog()
