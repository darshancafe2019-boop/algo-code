import unittest
import threading
import time
import random
from datetime import datetime, timezone
from src import config, db, audit
from src.process_manager import bot_manager, multi_bot_manager

class TestSQLiteConcurrency(unittest.TestCase):
    """
    Stress test verifying SQLite concurrency under high multi-threaded load.
    Ensures WAL mode, 10000ms busy timeout, and with_db_retry prevent database locks.
    """

    def setUp(self):
        db.init_db()
        audit.init_audit_db()

    def test_concurrent_reads_and_writes(self):
        errors = []
        trades_before = len(db.safe_query("SELECT id FROM trades_log"))
        audit_before = len(audit.get_bot_audit_events(limit=10000))

        def reader_task(worker_id: int):
            for i in range(15):
                try:
                    res1 = db.safe_query("SELECT * FROM bot_instances LIMIT 10")
                    res2 = db.safe_query("SELECT * FROM trades_log ORDER BY id DESC LIMIT 5")
                    res3 = audit.get_bot_audit_events(limit=5)
                    self.assertIsInstance(res1, list)
                    self.assertIsInstance(res2, list)
                    self.assertIsInstance(res3, list)
                    time.sleep(random.uniform(0.01, 0.03))
                except Exception as e:
                    errors.append(f"Reader-{worker_id} error: {e}")

        def trade_writer_task(worker_id: int):
            for i in range(5):
                try:
                    with db.get_db_transaction() as conn:
                        now_str = datetime.now(timezone.utc).isoformat()
                        conn.execute(
                            """
                            INSERT INTO trades_log (
                                timestamp, symbol, direction, entry_price, stop_loss,
                                take_profit, position_size, status, result_pnl, metadata
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?)
                            """,
                            (now_str, "BTC/USDT", "LONG", 65000.0, 64000.0, 67000.0, 0.05, 50.0, f"concurrency_test_worker_{worker_id}_{i}")
                        )
                    time.sleep(random.uniform(0.01, 0.03))
                except Exception as e:
                    errors.append(f"TradeWriter-{worker_id} error: {e}")

        def audit_writer_task(worker_id: int):
            for i in range(5):
                try:
                    audit.log_bot_audit_event(
                        bot_instance_id=f"bot-test-{worker_id}",
                        bot_instance_name=f"Test Bot {worker_id}",
                        event_type="CONCURRENCY_TEST",
                        message=f"Stress test write iteration {i}",
                        severity="INFO"
                    )
                    time.sleep(random.uniform(0.01, 0.03))
                except Exception as e:
                    errors.append(f"AuditWriter-{worker_id} error: {e}")

        def status_sync_task(worker_id: int):
            for i in range(3):
                try:
                    db.reconcile_stale_bot_statuses()
                    time.sleep(random.uniform(0.02, 0.05))
                except Exception as e:
                    errors.append(f"StatusSync-{worker_id} error: {e}")

        threads = []
        # Launch 10 readers
        for i in range(10):
            threads.append(threading.Thread(target=reader_task, args=(i,)))
        # Launch 5 trade writers
        for i in range(5):
            threads.append(threading.Thread(target=trade_writer_task, args=(i,)))
        # Launch 5 audit writers
        for i in range(5):
            threads.append(threading.Thread(target=audit_writer_task, args=(i,)))
        # Launch 3 status synchronizers
        for i in range(3):
            threads.append(threading.Thread(target=status_sync_task, args=(i,)))

        # Start all concurrently
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Clean up test trades and test audit events inserted during this stress test
        with db.get_db_transaction() as conn:
            conn.execute("DELETE FROM trades_log WHERE metadata LIKE 'concurrency_test_worker_%'")
            conn.execute("DELETE FROM bot_event_audit WHERE event_type = 'CONCURRENCY_TEST'")

        self.assertEqual(len(errors), 0, f"Encountered concurrency errors: {errors}")

        trades_after = len(db.safe_query("SELECT id FROM trades_log"))
        self.assertEqual(trades_before, trades_after, "Historical trade count must be preserved.")

if __name__ == "__main__":
    unittest.main()
