import sys
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from src import db, audit

PRESERVED_CORE_BOT_IDS = {"bot-1", "bot-2", "bot-3"}


def clean_test_bot_instances(execute: bool = False):
    db.init_db(force=True)

    mode_label = "EXECUTE MODE (PERMANENT SOFT-DELETE)" if execute else "DRY-RUN MODE (SAFETY ANALYSIS ONLY)"
    print("==========================================================================")
    print(f"  BOT INSTANCE CLEANUP — {mode_label}")
    print("==========================================================================")
    if not execute:
        print("NOTE: Defaulting to DRY-RUN. No database modifications will occur.")
        print("To perform validated soft-deletion, run: python clean_leftover_test_bots.py --execute\n")

    conn = db.get_connection()
    c = conn.cursor()

    # Scan all un-deleted bot instances
    c.execute("SELECT * FROM bot_instances WHERE COALESCE(is_deleted, 0) = 0 ORDER BY created_at ASC")
    rows = c.fetchall()

    scanned_count = len(rows)
    eligible_count = 0
    protected_count = 0
    skipped_count = 0
    deleted_count = 0
    error_count = 0

    trade_records_preserved = 0
    audit_records_preserved = 0
    open_positions_protected = 0
    live_bots_protected = 0

    print(f"{'BOT ID':<24} | {'MODE':<6} | {'STATUS':<9} | {'TRADES':<6} | {'ACTION / REASON'}")
    print("-" * 85)

    for row in rows:
        b = dict(row)
        bot_id = b["id"]
        bot_name = b.get("name", "Unnamed")
        status = (b.get("status") or "STOPPED").upper()
        mode = (b.get("execution_mode") or "PAPER").upper()

        # Trade and Audit record counts
        c.execute("SELECT COUNT(*) FROM trades_log WHERE bot_id = ?", (bot_id,))
        trade_count = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM trades_log WHERE bot_id = ? AND status = 'OPEN'", (bot_id,))
        open_pos_count = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM bot_event_audit WHERE bot_instance_id = ?", (bot_id,))
        audit_count = c.fetchone()[0]

        trade_records_preserved += trade_count
        audit_records_preserved += audit_count

        # Pre-flight safety checks
        is_protected = False
        protect_reason = ""

        if bot_id in PRESERVED_CORE_BOT_IDS:
            is_protected = True
            protect_reason = "Preserved Core Instance whitelist"
        elif status in ["RUNNING", "STARTING"]:
            is_protected = True
            protect_reason = "Active running process state"
        elif mode == "LIVE":
            is_protected = True
            live_bots_protected += 1
            protect_reason = "Protected Live Trading mode"
        elif open_pos_count > 0 or b.get("open_position_count", 0) > 0:
            is_protected = True
            open_positions_protected += 1
            protect_reason = "Holds active open market position"

        if is_protected:
            protected_count += 1
            print(f"{bot_id:<24} | {mode:<6} | {status:<9} | {trade_count:<6} | [PROTECTED] {protect_reason}")
            continue

        # Candidate selection check: must be test or timestamp duplicate instance
        is_test_candidate = False
        delete_reason = ""

        if bot_id.startswith("bot-test-") or bot_id.startswith("test-") or "test" in bot_name.lower():
            is_test_candidate = True
            delete_reason = "Identified disposable test bot instance"
        elif bot_id.startswith("bot-17") and len(bot_id) > 15:
            is_test_candidate = True
            delete_reason = "Identified ephemeral timestamp test duplicate"

        if not is_test_candidate:
            skipped_count += 1
            print(f"{bot_id:<24} | {mode:<6} | {status:<9} | {trade_count:<6} | [SKIPPED] Non-test production instance")
            continue

        eligible_count += 1

        if not execute:
            print(f"{bot_id:<24} | {mode:<6} | {status:<9} | {trade_count:<6} | [DRY RUN] Would soft-delete ({delete_reason})")
        else:
            # Transactional validated soft-deletion
            try:
                now_utc = datetime.now(timezone.utc).isoformat()
                # Secondary transactional check
                c.execute(
                    """
                    UPDATE bot_instances
                    SET is_deleted = 1, deleted_at = ?, deleted_by = 'cleanup_script', deletion_reason = ?
                    WHERE id = ? AND status NOT IN ('RUNNING', 'STARTING') AND (execution_mode != 'LIVE' OR execution_mode IS NULL) AND COALESCE(is_deleted, 0) = 0
                    """,
                    (now_utc, delete_reason, bot_id)
                )

                if c.rowcount > 0:
                    deleted_count += 1
                    import uuid
                    evt_uuid = str(uuid.uuid4())
                    c.execute(
                        """
                        INSERT INTO bot_event_audit (
                            event_id, timestamp_utc, local_timestamp, bot_instance_id, bot_instance_name,
                            account_id, asset_class, symbol, event_type, severity, status, message, reason,
                            metadata_json, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            evt_uuid, now_utc, datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S"),
                            bot_id, bot_name, "default_account", b.get("asset_class", "Crypto"), b.get("symbol", "BTC/USDT"),
                            "BOT_INSTANCE_CLEANUP", "INFO", "SUCCESS", f"Soft-deleted candidate bot instance '{bot_id}' ({bot_name})",
                            delete_reason, json.dumps({
                                "bot_id": bot_id,
                                "timestamp_utc": now_utc,
                                "previous_status": status,
                                "execution_mode": mode,
                                "trade_count": trade_count,
                                "performed_by": "cleanup_script",
                                "action": "SOFT_DELETE"
                            }), now_utc
                        )
                    )
                    print(f"{bot_id:<24} | {mode:<6} | {status:<9} | {trade_count:<6} | [DELETED] Soft-deleted successfully")
                else:
                    skipped_count += 1
                    print(f"{bot_id:<24} | {mode:<6} | {status:<9} | {trade_count:<6} | [SKIPPED] State changed during transaction")
            except Exception as e:
                error_count += 1
                print(f"{bot_id:<24} | {mode:<6} | {status:<9} | {trade_count:<6} | [ERROR] {e}")

    if execute:
        conn.commit()

    conn.close()

    print("\n" + "=" * 85)
    print("  BOT INSTANCE CLEANUP REPORT")
    print("=" * 85)
    print(f"Scanned:                   {scanned_count}")
    print(f"Eligible:                  {eligible_count}")
    print(f"Protected:                 {protected_count}")
    print(f"Skipped:                   {skipped_count}")
    print(f"Deleted:                   {deleted_count if execute else 0} ({'Soft-deleted' if execute else '0 (Dry-Run)'})")
    print(f"Errors:                    {error_count}")
    print("-" * 85)
    print(f"Trade records preserved:   {trade_records_preserved} (100% intact)")
    print(f"Audit records preserved:   {audit_records_preserved} (100% intact)")
    print(f"Open positions protected:  {open_positions_protected}")
    print(f"Live bots protected:       {live_bots_protected}")
    print("=" * 85 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deterministic Safe Soft-Deletion Cleanup for Bot Instances")
    parser.add_argument("--execute", action="store_true", help="Perform validated soft-deletion (Default is DRY-RUN)")
    args = parser.parse_args()

    clean_test_bot_instances(execute=args.execute)

