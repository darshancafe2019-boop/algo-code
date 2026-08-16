import importlib.util
import pathlib
import sys

root = pathlib.Path('h:/algo/algo/btc-bot').resolve()
sys.path.insert(0, str(root))

files = [
    'src/config.py',
    'src/indicators.py',
    'src/strategy.py',
    'src/risk_manager.py',
    'src/db.py',
    'src/data_fetcher.py',
    'src/telegram_alert.py',
    'src/live_runner.py',
]

for rel in files:
    path = root / rel
    print('Checking', rel)
    spec = importlib.util.spec_from_file_location(rel.replace('/', '.').replace('.py', ''), path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
        print(' OK')
    except Exception as e:
        print(' ERROR', type(e).__name__, e)
        raise
