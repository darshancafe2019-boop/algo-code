import pytest
import sys
import json
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from dashboard import app
from src import db

@pytest.fixture
def client():
    app.config['TESTING'] = True
    db.init_db()
    with app.test_client() as client:
        yield client

def test_market_context_api(client):
    res = client.get('/api/market/context')
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data['status'] == 'success'
    assert 'btc_dominance' in data['data']
    assert 'indices' in data['data']

def test_bots_list_api(client):
    res = client.get('/api/bots')
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data['status'] == 'success'
    assert isinstance(data['bots'], list)

def test_bots_create_and_control(client):
    # Create bot instance
    res = client.post('/api/bots/create', json={
        'name': 'Test Bot',
        'symbol': 'BTC/USDT',
        'strategy': 'EMA_MACD_VP',
        'timeframe': '5m',
        'allocated_capital': 5000.0
    })
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data['status'] == 'success'
    bot_id = data['bot_id']

    # Control bot instance
    res_ctrl = client.post(f'/api/bots/{bot_id}/control', json={'action': 'PAUSE'})
    assert res_ctrl.status_code == 200

def test_bots_comparison_api(client):
    res = client.get('/api/bots/comparison')
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data['status'] == 'success'
    assert isinstance(data['comparison'], list)

def test_expanded_analytics_api(client):
    res = client.get('/api/analytics?bot_id=ALL&strategy=ALL&symbol=ALL')
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data['status'] == 'success'
    assert 'trade_summary' in data
    assert 'charts' in data
    assert 'realized_pnl_by_symbol' in data['charts']
    assert 'win_loss_donut' in data['charts']
    assert 'strategy_combo' in data['charts']

def test_trade_observation_api(client):
    res = client.post('/api/trades/1/observation', json={
        'emotion_tag': '🎯 Disciplined',
        'remarks': 'Test remark update'
    })
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data['status'] == 'success'

def test_alerts_clear_and_dismiss(client):
    res_clear = client.delete('/api/alerts/clear')
    assert res_clear.status_code == 200
