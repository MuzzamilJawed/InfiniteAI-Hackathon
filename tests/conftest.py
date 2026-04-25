"""Shared pytest fixtures for ML model + anomaly detection tests."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest

from backend.app.models.anomaly_model import HybridScorer
from backend.app.pipeline.features import FEATURE_COLUMNS, build_inference_features, build_training_frame
from backend.app.services.scoring_service import ScoringService


DATA_CSV = Path(__file__).resolve().parents[1] / "scriptdata" / "data" / "raw" / "synthetic_fintech_transactions.csv"


@pytest.fixture(scope="session")
def training_dataframe() -> pd.DataFrame:
    """Load the synthetic dataset once for the whole session."""
    if not DATA_CSV.exists():
        pytest.skip(f"Synthetic dataset missing at {DATA_CSV}")
    return pd.read_csv(DATA_CSV)


@pytest.fixture(scope="session")
def scorer(training_dataframe: pd.DataFrame) -> HybridScorer:
    """Loaded HybridScorer (trains on the fly if no artifacts present)."""
    s = HybridScorer()
    if not s.load():
        X, y = build_training_frame(training_dataframe)
        s.fit(X, y)
    assert s.is_ready(), "HybridScorer failed to initialise"
    return s


@pytest.fixture(scope="session")
def service(scorer: HybridScorer) -> ScoringService:
    return ScoringService(scorer)


@pytest.fixture
def normal_tx() -> dict:
    """A clean, low-risk transaction baseline shared across scenario tests."""
    return {
        "amount": 2500.0,
        "channel": "App",
        "city": "Karachi",
        "home_city": "Karachi",
        "device": "trusted_device",
        "new_beneficiary": False,
        "merchant_category": "Groceries",
        "kyc_tier": "high",
        "timestamp": datetime(2026, 5, 12, 14, 30),
        "avg_user_amount": 2500.0,
        "tx_velocity": 2,
        "tx_history": 600,
    }


@pytest.fixture
def normal_features(normal_tx: dict) -> "pd.DataFrame":
    return build_inference_features(normal_tx)


@pytest.fixture(scope="session")
def feature_columns() -> list[str]:
    return list(FEATURE_COLUMNS)
