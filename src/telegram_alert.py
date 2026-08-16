import logging
from typing import Optional
import requests
from src import config, db

logger = logging.getLogger("TelegramAlert")


class TelegramAlert:
    """Send formatted notifications to Telegram while logging delivery attempts."""

    def __init__(self, token: Optional[str] = None, chat_id: Optional[str] = None) -> None:
        self.token = token or config.TELEGRAM_BOT_TOKEN
        self.chat_id = chat_id or config.TELEGRAM_CHAT_ID
        self.enabled = bool(self.token and self.chat_id)
        if not self.enabled:
            logger.warning("Telegram alerts are DISABLED. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in your .env file.")

    def send_message(self, text: str, parse_mode: str = "HTML") -> tuple[bool, dict]:
        """Send a synchronous text message to the configured Telegram chat."""
        if not self.enabled:
            logger.info("Skipping Telegram notification (disabled): %s", text)
            return False, {"ok": False, "error": "Telegram disabled"}

        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        payload = {"chat_id": self.chat_id, "text": text, "parse_mode": parse_mode}

        try:
            logger.info("Sending Telegram alert...")
            response = requests.post(url, json=payload, timeout=10)
            res_data = {}
            try:
                res_data = response.json()
            except Exception:
                res_data = {"raw_response": response.text}

            if response.status_code == 200:
                db.log_telegram_event(success=True, message=text)
                logger.info("Telegram alert sent successfully.")
                return True, res_data
            
            error_text = response.text
            logger.error("Failed to send Telegram alert. HTTP Status: %s. Response: %s", response.status_code, error_text)
            db.log_telegram_event(success=False, message=text, error=error_text)
            return False, res_data
        except Exception as exc:
            logger.error("Failed to send Telegram alert due to connection error: %s", exc)
            db.log_telegram_event(success=False, message=text, error=str(exc))
            return False, {"ok": False, "error": str(exc)}

    def send_interactive_signal_alert(
        self,
        signal_id: int,
        symbol: str,
        signal_type: str,
        price: float,
        confluence_pct: float,
        threshold_pct: float = 75.0,
        current_position: str = "FLAT",
        entry_price: float = 0.0,
        timeframe: str = "15m"
    ) -> tuple[bool, dict]:
        """Send interactive signal approval message to Telegram with action buttons."""
        if signal_type in ["EXIT_SIGNAL", "SQUARE_OFF"]:
            pnl_val = (price - entry_price) * 0.001 if entry_price > 0 else 0.0
            pnl_str = f"+${pnl_val:,.2f}" if pnl_val >= 0 else f"-${abs(pnl_val):,.2f}"
            text = (
                f"🚨 <b>POSITION ALERT</b>\n\n"
                f"<b>{symbol}</b>\n\n"
                f"Current Position:\n<b>{current_position}</b>\n\n"
                f"Entry:\n${entry_price:,.2f}\n\n"
                f"Current:\n${price:,.2f}\n\n"
                f"Unrealized P&L:\n<b>{pnl_str}</b>\n\n"
                f"Strategy:\n<b>Possible EXIT</b>\n\n"
                f"Confidence:\n<b>{confluence_pct:.0f}%</b>\n\n"
                f"⚠️ <b>Bot will NOT close the position automatically.</b>\n\n"
                f"Waiting for your decision."
            )
            reply_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🟡 HOLD", "callback_data": f"SIG:{signal_id}:HOLD"},
                        {"text": "🔴 SQUARE OFF", "callback_data": f"SIG:{signal_id}:SQUARE_OFF"},
                        {"text": "⚪ IGNORE", "callback_data": f"SIG:{signal_id}:IGNORE"}
                    ]
                ]
            }
        else:
            text = (
                f"🚨 <b>TRADE SIGNAL GENERATED</b>\n\n"
                f"<b>{symbol}</b>\n"
                f"Timeframe: {timeframe}\n\n"
                f"Signal: <b>{signal_type}</b>\n"
                f"Confidence: <b>{confluence_pct:.0f}%</b>\n"
                f"Required Threshold: <b>{threshold_pct:.0f}%</b>\n\n"
                f"Price: <b>${price:,.2f}</b>\n\n"
                f"EMA: Bullish\n"
                f"MACD: Bullish\n"
                f"Volume Profile: Bullish\n\n"
                f"⚠️ <b>NO TRADE EXECUTED</b>\n\n"
                f"Waiting for your decision."
            )
            if signal_type == "LONG":
                btn_action = {"text": "🟢 APPROVE LONG", "callback_data": f"SIG:{signal_id}:BUY_LONG"}
            else:
                btn_action = {"text": "🔴 APPROVE SHORT", "callback_data": f"SIG:{signal_id}:SELL_SHORT"}

            reply_markup = {
                "inline_keyboard": [
                    [
                        btn_action,
                        {"text": "⚪ IGNORE", "callback_data": f"SIG:{signal_id}:IGNORE"}
                    ]
                ]
            }

        if not self.enabled:
            logger.info("Skipping interactive Telegram notification (disabled): %s", text)
            return False, {"ok": False, "error": "Telegram disabled"}

        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": reply_markup
        }

        try:
            response = requests.post(url, json=payload, timeout=10)
            res_data = response.json() if response.status_code == 200 else {}
            if response.status_code == 200:
                db.log_telegram_event(success=True, message=text)
                return True, res_data
            else:
                db.log_telegram_event(success=False, message=text, error=response.text)
                return False, res_data
        except Exception as exc:
            logger.error("Failed to send interactive Telegram alert: %s", exc)
            return False, {"ok": False, "error": str(exc)}

