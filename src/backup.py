import os
import shutil
import logging
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src import config

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("Backup")

def run_backup():
    """
    Creates a timestamped backup of the trading database and the raw data folder
    under the configured backup directory.
    """
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_subdir = config.BACKUP_PATH / f"backup_{timestamp}"
        backup_subdir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Starting backup process. Target folder: {backup_subdir}")

        # 1. Backup SQLite Database
        db_file = Path(config.DB_PATH)
        if db_file.exists():
            shutil.copy2(db_file, backup_subdir / db_file.name)
            logger.info(f"Successfully backed up database: {db_file.name}")
        else:
            logger.warning(f"Database file not found at {db_file}, skipping DB backup.")

        # 2. Backup Data Folder (raw CSVs, historical files)
        data_dir = Path(config.DATA_DIR)
        if data_dir.exists():
            # We copy files inside data folder to a subfolder in backup
            dest_data_dir = backup_subdir / "data"
            dest_data_dir.mkdir(parents=True, exist_ok=True)
            for item in data_dir.iterdir():
                if item.is_file() and item.suffix != '.log' and item.name != db_file.name:  # skip writing active log files and the DB file (copied above)
                    shutil.copy2(item, dest_data_dir / item.name)
            logger.info("Successfully backed up historical data directory (excl. logs).")
        else:
            logger.warning(f"Data folder not found at {data_dir}, skipping data folder backup.")

        logger.info("Backup process completed successfully.")
        print(f"Backup saved successfully at: {backup_subdir.resolve()}")
        return True

    except Exception as e:
        logger.error(f"Backup failed: {e}")
        return False

if __name__ == "__main__":
    run_backup()
