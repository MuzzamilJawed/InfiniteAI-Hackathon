"""Accuracy benchmarks for the ML model on UNSEEN synthetic data.

Marked `slow` — generates fresh transactions with a different random seed,
runs them through the model, and asserts thresholds for accuracy / F1 / ROC-AUC.

Run only the fast suite with: `pytest -m "not slow"`
Run benchmarks with:           `pytest -m slow`
"""
from __future__ import annotations

import random
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from backend.app.models.anomaly_model import HybridScorer
from backend.app.pipeline.features import FEATURE_COLUMNS, build_training_frame


# Make the synthetic data generator importable
SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scriptdata" / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))


@pytest.fixture(scope="module")
def unseen_dataset() -> pd.DataFrame:
    """Generate ~1500 unseen transactions with seed 9999 (different from training)."""
    try:
        from generate_synthetic_fintech_transactions import (
            USD_TO_PKR,
            allocate_counts,
            inject_anomalies,
            make_profile,
            normal_tx,
            random_timestamp,
        )
    except ImportError:
        pytest.skip("Synthetic data generator script not importable")

    SEED = 9999
    random.seed(SEED)
    np.random.seed(SEED)

    rows_target = 1500
    users = 120
    anomaly_ratio = 0.08
    start, end = datetime(2026, 1, 1), datetime(2026, 6, 30)

    profiles = [make_profile(i + 5000) for i in range(users)]
    profile_map = {p.user_id: p for p in profiles}
    counts = allocate_counts(rows_target, users)

    rows = []
    for p, c in zip(profiles, counts):
        for i in range(int(c)):
            ts = random_timestamp(start, end, hour_bias="normal")
            rows.append(normal_tx(p, i, int(c), ts))

    df = pd.DataFrame(rows)
    df = inject_anomalies(df, anomaly_ratio, profile_map)

    # Convert USD-scale amounts to PKR (matches the live dataset)
    for col in ("amount", "avg_user_amount", "amount_deviation"):
        df[col] = (df[col].astype(float) * USD_TO_PKR).round(2)

    for col in ["tx_velocity", "tx_history", "new_beneficiary", "is_anomaly", "is_holiday", "hour"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    return df.sample(frac=1.0, random_state=SEED).reset_index(drop=True)


@pytest.fixture(scope="module")
def predictions(unseen_dataset: pd.DataFrame, scorer: HybridScorer) -> dict:
    X, y = build_training_frame(unseen_dataset)
    Xf = X.loc[:, FEATURE_COLUMNS].astype(float)

    # Vectorised IsolationForest
    raw_if = scorer.iforest.decision_function(Xf)
    span = max(scorer._iforest_max - scorer._iforest_min, 1e-9)
    norm_if = (scorer._iforest_max - raw_if) / span
    anomaly_scores = np.clip(norm_if, 0.0, 1.0) * 100.0

    # Vectorised GradientBoosting
    if scorer.supervised is not None:
        fraud_scores = scorer.supervised.predict_proba(Xf)[:, 1] * 100.0
    else:
        fraud_scores = anomaly_scores.copy()

    fused = np.maximum(fraud_scores * 0.55, anomaly_scores * 0.6)

    return {
        "y": y.values,
        "anomaly_scores": anomaly_scores,
        "fraud_scores": fraud_scores,
        "fused": fused,
    }


# ---------------------------------------------------------------------------
# 1. Class balance sanity
# ---------------------------------------------------------------------------

@pytest.mark.slow
class TestUnseenDatasetIntegrity:
    def test_dataset_has_both_classes(self, unseen_dataset: pd.DataFrame):
        labels = unseen_dataset["is_anomaly"].value_counts()
        assert 0 in labels.index
        assert 1 in labels.index
        assert labels.min() >= 50, "Need at least 50 of each class for stable metrics"

    def test_anomaly_subtypes_diverse(self, unseen_dataset: pd.DataFrame):
        """Confirms the generator produces anomalies that are NOT all amount spikes."""
        anom = unseen_dataset[unseen_dataset["is_anomaly"] == 1]
        ratio = anom["amount"] / anom["avg_user_amount"].replace(0, 1)
        non_spike = (ratio < 2).sum()
        assert non_spike >= max(5, int(0.2 * len(anom))), (
            f"Only {non_spike}/{len(anom)} non-spike anomalies — generator may have regressed"
        )


# ---------------------------------------------------------------------------
# 2. GradientBoosting (supervised) accuracy
# ---------------------------------------------------------------------------

@pytest.mark.slow
class TestSupervisedAccuracy:
    THRESHOLD = 50.0

    def test_accuracy_above_85_percent(self, predictions: dict):
        pred = (predictions["fraud_scores"] >= self.THRESHOLD).astype(int)
        acc = accuracy_score(predictions["y"], pred)
        assert acc >= 0.85, f"Accuracy {acc:.4f} below 0.85 target"

    def test_f1_above_0_60(self, predictions: dict):
        pred = (predictions["fraud_scores"] >= self.THRESHOLD).astype(int)
        f1 = f1_score(predictions["y"], pred, zero_division=0)
        assert f1 >= 0.60, f"F1 {f1:.4f} below 0.60 target"

    def test_roc_auc_above_0_85(self, predictions: dict):
        auc = roc_auc_score(predictions["y"], predictions["fraud_scores"])
        assert auc >= 0.85, f"ROC-AUC {auc:.4f} below 0.85 target"

    def test_recall_above_0_50(self, predictions: dict):
        """Recall (catching real fraud) is critical for fintech use cases."""
        pred = (predictions["fraud_scores"] >= self.THRESHOLD).astype(int)
        rec = recall_score(predictions["y"], pred, zero_division=0)
        assert rec >= 0.50, f"Recall {rec:.4f} below 0.50 target"

    def test_precision_above_0_50(self, predictions: dict):
        """Precision matters too — low precision means many false positives."""
        pred = (predictions["fraud_scores"] >= self.THRESHOLD).astype(int)
        prec = precision_score(predictions["y"], pred, zero_division=0)
        assert prec >= 0.50, f"Precision {prec:.4f} below 0.50 target"


# ---------------------------------------------------------------------------
# 3. IsolationForest (unsupervised) — looser thresholds
# ---------------------------------------------------------------------------

@pytest.mark.slow
class TestUnsupervisedAccuracy:
    THRESHOLD = 40.0

    def test_anomaly_score_separates_classes(self, predictions: dict):
        y = predictions["y"]
        scores = predictions["anomaly_scores"]
        normal_mean = scores[y == 0].mean()
        anom_mean = scores[y == 1].mean()
        assert anom_mean > normal_mean, (
            f"IsolationForest mean(anomaly)={anom_mean:.1f} should exceed mean(normal)={normal_mean:.1f}"
        )

    def test_roc_auc_above_0_70(self, predictions: dict):
        auc = roc_auc_score(predictions["y"], predictions["anomaly_scores"])
        assert auc >= 0.70, f"IsolationForest ROC-AUC {auc:.4f} below 0.70"


# ---------------------------------------------------------------------------
# 4. Fused ML score — ML-only, rules-free
# ---------------------------------------------------------------------------

@pytest.mark.slow
class TestFusedMLAccuracy:
    def test_fused_roc_auc_above_0_85(self, predictions: dict):
        auc = roc_auc_score(predictions["y"], predictions["fused"])
        assert auc >= 0.85, f"Fused ML ROC-AUC {auc:.4f} below 0.85"

    def test_fused_f1_at_threshold_50(self, predictions: dict):
        pred = (predictions["fused"] >= 50.0).astype(int)
        f1 = f1_score(predictions["y"], pred, zero_division=0)
        assert f1 >= 0.55, f"Fused F1 {f1:.4f} below 0.55"


# ---------------------------------------------------------------------------
# 5. Score distribution sanity
# ---------------------------------------------------------------------------

@pytest.mark.slow
class TestScoreDistribution:
    def test_fraud_score_high_for_anomalies(self, predictions: dict):
        y = predictions["y"]
        fraud = predictions["fraud_scores"]
        anom_median = float(np.median(fraud[y == 1]))
        norm_median = float(np.median(fraud[y == 0]))
        assert anom_median > norm_median + 20, (
            f"Anomaly fraud-score median ({anom_median:.1f}) not clearly above normal ({norm_median:.1f})"
        )

    def test_normal_fraud_score_mostly_low(self, predictions: dict):
        y = predictions["y"]
        normal_low = (predictions["fraud_scores"][y == 0] < 30).mean()
        assert normal_low >= 0.80, f"Only {normal_low*100:.1f}% of normal txns scored < 30"
