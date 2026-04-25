"""End-to-end scoring tests for the Smart Transaction Anomaly Detector."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest

from backend.app.models.anomaly_model import HybridScorer
from backend.app.pipeline.features import build_inference_features, build_training_frame
from backend.app.rules.risk_rules import evaluate_rules, rules_score
from backend.app.schemas.transaction import TransactionRequest
from backend.app.services.scoring_service import ScoringService


DATA_CSV = Path(__file__).resolve().parents[1] / "scriptdata" / "data" / "raw" / "synthetic_fintech_transactions.csv"


@pytest.fixture(scope="session")
def scorer() -> HybridScorer:
    s = HybridScorer()
    if not s.load():
        df = pd.read_csv(DATA_CSV)
        X, y = build_training_frame(df)
        s.fit(X, y)
    return s


@pytest.fixture(scope="session")
def service(scorer: HybridScorer) -> ScoringService:
    return ScoringService(scorer)


def test_dataset_has_required_columns():
    df = pd.read_csv(DATA_CSV)
    expected = {
        "timestamp",
        "customer_id",
        "amount",
        "avg_user_amount",
        "channel",
        "city",
        "home_city",
        "kyc_tier",
        "merchant_category",
        "is_holiday",
        "hour",
        "is_anomaly",
    }
    missing = expected - set(df.columns)
    assert not missing, f"Missing columns: {missing}"


def test_low_risk_clean_transaction(service: ScoringService) -> None:
    request = TransactionRequest(
        customer_id="C00100",
        amount=2500,
        channel="IBFT",
        city="Karachi",
        home_city="Karachi",
        device="trusted_device",
        new_beneficiary=False,
        merchant_category="Groceries",
        kyc_tier="high",
        timestamp=datetime(2025, 7, 15, 14, 30),
        avg_user_amount=2500,
        tx_velocity=2,
        tx_history=600,
    )
    decision = service.score(request)
    assert decision.risk_band in ("LOW", "MEDIUM"), decision.risk_band
    assert decision.action in ("ALLOW", "STEP_UP_AUTH")


def test_critical_risk_fraud_pattern(service: ScoringService) -> None:
    request = TransactionRequest(
        customer_id="C00911",
        amount=92000,
        channel="ATM",
        city="Quetta",
        home_city="Karachi",
        device="emulated_device",
        new_beneficiary=True,
        merchant_category="Cash",
        kyc_tier="low",
        timestamp=datetime(2025, 6, 8, 2, 15),
        avg_user_amount=2000,
        tx_velocity=28,
        tx_history=15,
    )
    decision = service.score(request)
    assert decision.risk_band in ("HIGH", "CRITICAL")
    assert decision.action in ("HOLD_FOR_REVIEW", "BLOCK")
    codes = {r.code for r in decision.reason_codes}
    assert "AMT_SPIKE_6X" in codes
    assert "VEL_BURST" in codes
    assert "DEV_RISKY" in codes
    assert decision.compliance.get("aml_review_required") is True


def test_holiday_amplifies_off_hours_atm(service: ScoringService) -> None:
    request = TransactionRequest(
        customer_id="C00200",
        amount=20000,
        channel="ATM",
        city="Karachi",
        home_city="Karachi",
        device="trusted_device",
        new_beneficiary=False,
        merchant_category="Cash",
        kyc_tier="medium",
        timestamp=datetime(2025, 8, 14, 3, 0),
        avg_user_amount=15000,
        tx_velocity=2,
        tx_history=300,
    )
    decision = service.score(request)
    codes = {r.code for r in decision.reason_codes}
    assert "TIME_OFF_HOURS" in codes
    assert "ATM_NIGHT" in codes
    assert decision.risk_score > 30


def test_rules_engine_returns_reason_codes() -> None:
    tx = {
        "amount": 50000,
        "avg_user_amount": 5000,
        "channel": "ATM",
        "city": "Lahore",
        "home_city": "Karachi",
        "device": "new_device",
        "new_beneficiary": True,
        "merchant_category": "Cash",
        "kyc_tier": "low",
        "tx_velocity": 22,
        "timestamp": datetime(2025, 4, 1, 2, 30),
    }
    hits = evaluate_rules(tx)
    score = rules_score(hits)
    codes = {h.code for h in hits}
    assert "AMT_SPIKE_6X" in codes
    assert "LOC_DIFF_CITY" in codes
    assert "TIME_OFF_HOURS" in codes
    assert score >= 60


def test_inference_features_complete() -> None:
    tx = {
        "amount": 10000,
        "channel": "POS",
        "city": "Lahore",
        "home_city": "Lahore",
        "device": "trusted_device",
        "new_beneficiary": False,
        "merchant_category": "Groceries",
        "kyc_tier": "medium",
        "timestamp": datetime(2025, 5, 5, 13, 0),
    }
    df = build_inference_features(tx)
    assert df.shape == (1, 16)
    assert df.iloc[0]["is_holiday"] == 0
    assert df.iloc[0]["risky_channel"] == 0
