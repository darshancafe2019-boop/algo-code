import pathlib
import sys
root = pathlib.Path(r'H:/algo/algo/btc-bot').resolve()
sys.path.insert(0, str(root))
import src.indicators as indicators
print('imported', indicators.__name__)
