import pytest
import sys
import json
from pathlib import Path

# Add project root to path
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

def test_index_route(client):
    response = client.get('/')
    assert response.status_code == 200

def test_ticker_api(client):
    response = client.get('/api/ticker')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'data' in data
    assert 'last' in data['data']

def test_candles_api(client):
    response = client.get('/api/candles?timeframe=5m&limit=10')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'candles' in data

def test_orderbook_api(client):
    response = client.get('/api/orderbook')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'bids' in data
    assert 'asks' in data

def test_status_api(client):
    response = client.get('/api/status')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'bot' in data
    assert 'health' in data

def test_bot_control_api(client):
    response = client.post('/api/bot/control', json={'action': 'PAUSE'})
    assert response.status_code in [200, 400]
    data = json.loads(response.data)
    assert 'status' in data

def test_strategy_config_api(client):
    response = client.get('/api/strategy/config')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'config' in data

def test_risk_calculate_api(client):
    response = client.post('/api/risk/calculate', json={
        'account_balance': 10000,
        'risk_pct': 0.02,
        'entry_price': 65000,
        'stop_loss_price': 63700
    })
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'success'
    assert 'position_units_btc' in data['calculation']

def test_analytics_api(client):
    response = client.get('/api/analytics')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'metrics' in data
    assert 'equity_curve' in data

def test_trades_api(client):
    response = client.get('/api/trades')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'trades' in data

def test_alerts_api(client):
    response = client.get('/api/alerts')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'notifications' in data

def test_security_audit_api(client):
    response = client.get('/api/security/audit')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'audit_logs' in data

def test_logs_api(client):
    response = client.get('/api/logs')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'logs' in data
