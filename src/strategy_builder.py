"""
Visual Strategy Builder Engine & Rule Compiler
==============================================
Compiles visual IF / AND / OR / NOT / THEN rule conditions into executable
strategy definitions compatible with the live trading and backtesting engines.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union

import pandas as pd
import numpy as np

from src import db, config, audit

logger = logging.getLogger("StrategyBuilder")

SUPPORTED_OPERATORS = {
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: np.isclose(a, b, atol=1e-5),
    "!=": lambda a, b: not np.isclose(a, b, atol=1e-5),
}

DEFAULT_STRATEGY_TEMPLATES = [
    {
        "id": "strat-golden-cross",
        "name": "EMA Golden Cross & RSI Filter",
        "description": "Trend-following strategy entering long when EMA 9 crosses above EMA 21 with RSI > 50.",
        "target_signal": "BUY",
        "conjunction": "AND",
        "rules": [
            {"left": "ema_9", "op": ">", "right": "ema_20"},
            {"left": "rsi_14", "op": ">", "right": "50"},
            {"left": "close", "op": ">", "right": "ema_200"}
        ]
    },
    {
        "id": "strat-rsi-oversold",
        "name": "RSI Mean Reversion (Oversold Bounce)",
        "description": "Mean-reversion strategy buying when RSI drops below 30 and MACD turns positive.",
        "target_signal": "BUY",
        "conjunction": "AND",
        "rules": [
            {"left": "rsi_14", "op": "<", "right": "30"},
            {"left": "macd_line", "op": ">", "right": "macd_signal"}
        ]
    },
    {
        "id": "strat-breakout-vah",
        "name": "Volume Profile VAH Breakout",
        "description": "Breakout strategy triggering when close breaks above Value Area High (VAH) with ADX confirmation.",
        "target_signal": "BUY",
        "conjunction": "AND",
        "rules": [
            {"left": "close", "op": ">", "right": "vah"},
            {"left": "adx_14", "op": ">=", "right": "25"}
        ]
    }
]


def init_strategy_builder_schema() -> None:
    """Ensure strategy_definitions table exists in SQLite database."""
    try:
        conn = db.get_connection()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS custom_strategy_definitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                target_signal TEXT NOT NULL DEFAULT 'BUY',
                conjunction TEXT NOT NULL DEFAULT 'AND',
                rules_json TEXT NOT NULL,
                author TEXT DEFAULT 'Trader',
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error initializing custom_strategy_definitions table: {e}")


class StrategyBuilder:
    """Compiles and evaluates rule-based visual trading strategies."""

    def __init__(self):
        init_strategy_builder_schema()

    def get_all_strategies(self) -> List[Dict[str, Any]]:
        """Return combined catalog of built-in templates and user custom strategies."""
        custom_strategies = []
        try:
            rows = db.safe_query("SELECT * FROM custom_strategy_definitions WHERE is_active = 1 ORDER BY created_at DESC")
            for r in rows:
                r_dict = dict(r)
                if isinstance(r_dict.get("rules_json"), str):
                    try:
                        r_dict["rules"] = json.loads(r_dict["rules_json"])
                    except Exception:
                        r_dict["rules"] = []
                custom_strategies.append(r_dict)
        except Exception as e:
            logger.warning(f"Could not load custom strategies: {e}")

        return DEFAULT_STRATEGY_TEMPLATES + custom_strategies

    def compile_rule(self, rule: Dict[str, Any]) -> Tuple[bool, str]:
        """Validate a single rule condition."""
        left = str(rule.get("left", "")).strip()
        op = str(rule.get("op", "")).strip()
        right = str(rule.get("right", "")).strip()

        if not left:
            return False, "Rule is missing left operand."
        if op not in SUPPORTED_OPERATORS:
            return False, f"Unsupported operator '{op}'. Must be one of: {list(SUPPORTED_OPERATORS.keys())}"
        if not right:
            return False, "Rule is missing right operand."

        return True, "Rule validated successfully."

    def compile_strategy(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and compile a full strategy rule definition."""
        name = payload.get("name", "").strip()
        target_signal = payload.get("target_signal", "BUY").upper().strip()
        conjunction = payload.get("conjunction", "AND").upper().strip()
        rules = payload.get("rules", [])

        if not name:
            return {"valid": False, "error": "Strategy name is required."}
        if target_signal not in ["BUY", "SELL", "HOLD", "CLOSE"]:
            return {"valid": False, "error": f"Invalid target signal '{target_signal}'."}
        if conjunction not in ["AND", "OR"]:
            return {"valid": False, "error": f"Conjunction must be 'AND' or 'OR', got '{conjunction}'."}
        if not rules or not isinstance(rules, list):
            return {"valid": False, "error": "At least one valid rule condition is required."}

        validated_rules = []
        for idx, r in enumerate(rules):
            ok, msg = self.compile_rule(r)
            if not ok:
                return {"valid": False, "error": f"Rule #{idx+1} error: {msg}"}
            validated_rules.append({
                "left": r["left"].strip().lower(),
                "op": r["op"].strip(),
                "right": r["right"].strip().lower()
            })

        compiled_repr = f"IF ({f' {conjunction} '.join([f'{r['left']} {r['op']} {r['right']}' for r in validated_rules])}) THEN {target_signal}"

        return {
            "valid": True,
            "name": name,
            "target_signal": target_signal,
            "conjunction": conjunction,
            "rules": validated_rules,
            "compiled_expression": compiled_repr,
            "rule_count": len(validated_rules)
        }

    def save_strategy(self, payload: Dict[str, Any], user: str = "Trader") -> Dict[str, Any]:
        """Compile and save custom strategy to database."""
        compiled = self.compile_strategy(payload)
        if not compiled.get("valid"):
            return {"status": "error", "message": compiled.get("error")}

        strat_id = payload.get("id") or f"strat-custom-{int(datetime.now(timezone.utc).timestamp())}"
        now_str = datetime.now(timezone.utc).isoformat()
        name = compiled["name"]
        desc = payload.get("description", "")
        target_signal = compiled["target_signal"]
        conjunction = compiled["conjunction"]
        rules_json = json.dumps(compiled["rules"])

        try:
            db.safe_execute("""
                INSERT INTO custom_strategy_definitions 
                (id, name, description, target_signal, conjunction, rules_json, author, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    target_signal = excluded.target_signal,
                    conjunction = excluded.conjunction,
                    rules_json = excluded.rules_json,
                    updated_at = excluded.updated_at
            """, (strat_id, name, desc, target_signal, conjunction, rules_json, user, now_str, now_str))

            audit.log_bot_event(
                event_type="CUSTOM_STRATEGY_SAVED",
                message=f"Created custom strategy '{name}' ({strat_id})",
                severity="INFO",
                metadata={"strategy_id": strat_id, "expression": compiled["compiled_expression"]}
            )

            return {
                "status": "success",
                "message": f"Strategy '{name}' compiled and saved successfully.",
                "strategy_id": strat_id,
                "compiled_expression": compiled["compiled_expression"]
            }
        except Exception as e:
            logger.error(f"Failed to save custom strategy: {e}")
            return {"status": "error", "message": str(e)}

    def evaluate_strategy_on_indicators(
        self,
        strategy_config: Dict[str, Any],
        indicators_snapshot: Dict[str, Any]
    ) -> Tuple[bool, str, List[Dict[str, Any]]]:
        """
        Evaluates visual strategy rules against live indicator values.
        Returns (is_triggered, evaluated_signal, condition_results).
        """
        rules = strategy_config.get("rules", [])
        conjunction = strategy_config.get("conjunction", "AND").upper()
        target_signal = strategy_config.get("target_signal", "BUY")

        if not rules:
            return False, "HOLD", []

        results = []
        for r in rules:
            left_key = r["left"]
            op = r["op"]
            right_val_str = r["right"]

            # Resolve left value
            left_val = indicators_snapshot.get(left_key)
            if left_val is None:
                # Try partial match or direct indicator
                left_val = indicators_snapshot.get(left_key.split("_")[0])

            # Resolve right value (could be a number or another indicator)
            right_val = None
            try:
                right_val = float(right_val_str)
            except ValueError:
                right_val = indicators_snapshot.get(right_val_str)

            passed = False
            if left_val is not None and right_val is not None:
                func = SUPPORTED_OPERATORS.get(op)
                if func:
                    try:
                        passed = bool(func(float(left_val), float(right_val)))
                    except Exception:
                        passed = False

            results.append({
                "condition": f"{left_key} {op} {right_val_str}",
                "left_val": left_val,
                "right_val": right_val,
                "passed": passed
            })

        passed_count = sum(1 for res in results if res["passed"])
        if conjunction == "AND":
            triggered = (passed_count == len(results))
        else:  # OR
            triggered = (passed_count > 0)

        final_signal = target_signal if triggered else "HOLD"
        return triggered, final_signal, results


strategy_builder = StrategyBuilder()
