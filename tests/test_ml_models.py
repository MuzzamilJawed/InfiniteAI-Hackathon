"""Unit tests for the hybrid ML model (IsolationForest + GradientBoosting).

These tests target the model itself — independent of rules and explanations —
to verify training, scoring, persistence, ranges, determinism, and edge cases.
"""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest

from backend.app.models.anomaly_model import HybridScorer, ScoringResult
from backend.app.pipeline.features import FEATURE_COLUMNS, build_inference_features


# ---------------------------------------------------------------------------
# 1. Initialisation & loading
# ---------------------------------------------------------------------------

class TestHybridScorerInit:
    def test_fresh_scorer_is_not_ready(self):
        s = HybridScorer()
        assert s.is_ready() is False
        assert s.iforest is None
        assert s.supervised is None

    def test_loaded_scorer_is_ready(self, scorer: HybridScorer):
        assert scorer.is_ready()
        assert scorer.iforest is not None
        assert isinstance(scorer.iforest, IsolationForest)

    def test_loaded_scorer_has_supervised_model(self, scorer: HybridScorer):
        assert scorer.supervised is not None
        assert isinstance(scorer.supervised, GradientBoostingClassifier)

    def test_score_raises_when_models_not_loaded(self, normal_features: pd.DataFrame):
        s = HybridScorer()
        with pytest.raises(RuntimeError, match="Models not loaded"):
            s.score(normal_features)

    def test_meta_contains_required_keys(self, scorer: HybridScorer):
        meta = scorer.meta
        assert "feature_columns" in meta
        assert "iforest_min" in meta
        assert "iforest_max" in meta
        assert "trained_rows" in meta
        assert meta["trained_rows"] > 0


# ---------------------------------------------------------------------------
# 2. Score range, types, and structure
# ---------------------------------------------------------------------------

class TestScoreOutputs:
    def test_score_returns_scoring_result(self, scorer: HybridScorer, normal_features: pd.DataFrame):
        result = scorer.score(normal_features)
        assert isinstance(result, ScoringResult)

    def test_anomaly_score_in_valid_range(self, scorer: HybridScorer, normal_features: pd.DataFrame):
        result = scorer.score(normal_features)
        assert 0.0 <= result.anomaly_score <= 100.0

    def test_fraud_score_in_valid_range(self, scorer: HybridScorer, normal_features: pd.DataFrame):
        result = scorer.score(normal_features)
        assert 0.0 <= result.fraud_score <= 100.0

    def test_feature_importance_keys_match_model_features(
        self, scorer: HybridScorer, normal_features: pd.DataFrame, feature_columns: list[str]
    ):
        result = scorer.score(normal_features)
        if scorer.supervised is None:
            pytest.skip("Supervised model not present")
        assert set(result.feature_importance.keys()) == set(feature_columns)

    def test_feature_importance_values_non_negative(
        self, scorer: HybridScorer, normal_features: pd.DataFrame
    ):
        result = scorer.score(normal_features)
        for k, v in result.feature_importance.items():
            assert v >= 0.0, f"Negative importance for {k}: {v}"


# ---------------------------------------------------------------------------
# 3. Determinism & idempotence
# ---------------------------------------------------------------------------

class TestDeterminism:
    def test_score_is_deterministic_for_same_input(
        self, scorer: HybridScorer, normal_features: pd.DataFrame
    ):
        r1 = scorer.score(normal_features)
        r2 = scorer.score(normal_features.copy())
        assert r1.anomaly_score == pytest.approx(r2.anomaly_score)
        assert r1.fraud_score == pytest.approx(r2.fraud_score)

    def test_score_unaffected_by_column_order(
        self, scorer: HybridScorer, normal_features: pd.DataFrame
    ):
        shuffled = normal_features[list(reversed(normal_features.columns))]
        r1 = scorer.score(normal_features)
        r2 = scorer.score(shuffled)
        assert r1.fraud_score == pytest.approx(r2.fraud_score)


# ---------------------------------------------------------------------------
# 4. Sensitivity — anomalous inputs score higher than normal ones
# ---------------------------------------------------------------------------

def _extreme_features() -> pd.DataFrame:
    tx = {
        "amount": 480_000.0,
        "channel": "ATM",
        "city": "Quetta",
        "home_city": "Karachi",
        "device": "emulated_device",
        "new_beneficiary": True,
        "merchant_category": "Cash",
        "kyc_tier": "low",
        "timestamp": datetime(2026, 4, 25, 3, 0),
        "avg_user_amount": 4_500.0,
        "tx_velocity": 30,
        "tx_history": 12,
    }
    return build_inference_features(tx)


class TestModelSensitivity:
    def test_extreme_anomaly_higher_anomaly_score(
        self, scorer: HybridScorer, normal_features: pd.DataFrame
    ):
        normal = scorer.score(normal_features)
        extreme = scorer.score(_extreme_features())
        assert extreme.anomaly_score > normal.anomaly_score

    def test_extreme_anomaly_higher_fraud_score(
        self, scorer: HybridScorer, normal_features: pd.DataFrame
    ):
        normal = scorer.score(normal_features)
        extreme = scorer.score(_extreme_features())
        assert extreme.fraud_score > normal.fraud_score

    def test_extreme_fraud_score_above_threshold(self, scorer: HybridScorer):
        """A textbook fraud transaction should score >= 60 (HIGH band)."""
        result = scorer.score(_extreme_features())
        assert result.fraud_score >= 60.0, (
            f"Expected fraud_score >= 60 for extreme case, got {result.fraud_score}"
        )

    def test_clean_transaction_low_fraud_score(
        self, scorer: HybridScorer, normal_features: pd.DataFrame
    ):
        result = scorer.score(normal_features)
        assert result.fraud_score < 30.0, (
            f"Expected fraud_score < 30 for clean transaction, got {result.fraud_score}"
        )


# ---------------------------------------------------------------------------
# 5. Persistence — fit + reload round-trip
# ---------------------------------------------------------------------------

class TestPersistenceRoundTrip:
    def test_models_persist_and_reload(self, tmp_path: Path, monkeypatch):
        """Fit a fresh HybridScorer on a tiny synthetic frame, reload, and confirm scores match."""
        from backend.app.models import anomaly_model as am

        monkeypatch.setattr(am, "ARTIFACT_DIR", tmp_path)
        monkeypatch.setattr(am, "SUPERVISED_PATH", tmp_path / "supervised_model.pkl")
        monkeypatch.setattr(am, "UNSUPERVISED_PATH", tmp_path / "isolation_forest.pkl")
        monkeypatch.setattr(am, "META_PATH", tmp_path / "model_meta.json")

        rng = np.random.default_rng(42)
        n = 400
        X = pd.DataFrame(rng.normal(0, 1, size=(n, len(FEATURE_COLUMNS))), columns=FEATURE_COLUMNS)
        X.loc[:50, "amount_ratio"] = rng.uniform(5, 12, size=51)
        X.loc[:50, "is_off_hours"] = 1
        y = pd.Series([1] * 51 + [0] * (n - 51))

        s1 = am.HybridScorer()
        meta = s1.fit(X, y)
        assert meta["trained_rows"] == n
        sample = X.iloc[[0]]
        score1 = s1.score(sample)

        s2 = am.HybridScorer()
        assert s2.load() is True
        score2 = s2.score(sample)

        assert score1.fraud_score == pytest.approx(score2.fraud_score)
        assert score1.anomaly_score == pytest.approx(score2.anomaly_score)


# ---------------------------------------------------------------------------
# 6. Edge cases & robustness
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_zero_amount_handled_by_features(self):
        tx = {
            "amount": 0.01,
            "channel": "App",
            "city": "Karachi",
            "home_city": "Karachi",
            "avg_user_amount": 1.0,
        }
        df = build_inference_features(tx)
        assert df.shape == (1, len(FEATURE_COLUMNS))
        assert np.isfinite(df.iloc[0]["amount_ratio"])

    def test_missing_optional_fields_use_defaults(self):
        tx = {
            "amount": 5000,
            "channel": "App",
            "city": "Lahore",
            "home_city": "Lahore",
        }
        df = build_inference_features(tx)
        assert df.iloc[0]["device_trusted"] == 1
        assert df.iloc[0]["risky_device"] == 0
        assert df.iloc[0]["kyc_risk_weight"] == pytest.approx(0.6)

    def test_score_handles_minimal_payload(self, scorer: HybridScorer):
        tx = {"amount": 1500.0, "channel": "App", "city": "Karachi", "home_city": "Karachi"}
        df = build_inference_features(tx)
        result = scorer.score(df)
        assert 0.0 <= result.fraud_score <= 100.0
        assert 0.0 <= result.anomaly_score <= 100.0

    def test_off_hours_flag_affects_isolation_forest(self, scorer: HybridScorer):
        """Same amount/channel but different hour should produce different anomaly scores."""
        base = {
            "amount": 8000,
            "channel": "App",
            "city": "Karachi",
            "home_city": "Karachi",
            "avg_user_amount": 8000,
            "tx_velocity": 2,
            "tx_history": 200,
        }
        day = scorer.score(build_inference_features({**base, "timestamp": datetime(2026, 5, 12, 14, 0)}))
        night = scorer.score(build_inference_features({**base, "timestamp": datetime(2026, 5, 12, 3, 0)}))
        assert day.anomaly_score != night.anomaly_score


# ---------------------------------------------------------------------------
# 7. Performance (smoke)
# ---------------------------------------------------------------------------

class TestPerformance:
    def test_single_score_under_200ms(self, scorer: HybridScorer, normal_features: pd.DataFrame):
        """Average per-call latency target — 200ms is a safe SLA for fintech scoring."""
        scorer.score(normal_features)  # warm-up
        start = time.perf_counter()
        for _ in range(20):
            scorer.score(normal_features)
        elapsed = (time.perf_counter() - start) / 20.0
        assert elapsed < 0.2, f"Single inference took {elapsed*1000:.1f}ms (target <200ms)"

    def test_batch_score_throughput_200_under_30s(
        self, scorer: HybridScorer, normal_features: pd.DataFrame
    ):
        """Sustained throughput sanity — 200 sequential scores in under 30s."""
        big = pd.concat([normal_features] * 200, ignore_index=True)
        start = time.perf_counter()
        for i in range(len(big)):
            scorer.score(big.iloc[[i]])
        elapsed = time.perf_counter() - start
        assert elapsed < 30.0, f"200 scores took {elapsed:.2f}s (target <30s)"
