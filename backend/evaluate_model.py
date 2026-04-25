"""Evaluate the ML model accuracy independently of rules.

Uses vectorized batch prediction for speed.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.pipeline.features import FEATURE_COLUMNS, build_training_frame
from app.models.anomaly_model import HybridScorer, SUPERVISED_PATH, UNSUPERVISED_PATH, META_PATH

CSV_PATH = Path(__file__).resolve().parent.parent / "scriptdata" / "data" / "raw" / "synthetic_fintech_transactions.csv"

def main():
    if not CSV_PATH.exists():
        print(f"Dataset not found at {CSV_PATH}")
        return

    df = pd.read_csv(CSV_PATH)
    print(f"Dataset: {len(df)} rows")
    print(f"Label distribution:\n{df['is_anomaly'].value_counts().to_string()}\n")

    X, y = build_training_frame(df)
    print(f"Feature matrix shape: {X.shape}")
    print(f"Features: {X.columns.tolist()}\n")

    scorer = HybridScorer()
    if not scorer.load():
        print("No trained model found. Training now...")
        scorer.fit(X, y)
    else:
        print(f"Loaded model artifacts. Supervised: {scorer.supervised is not None}")
        print(f"Meta: {scorer.meta}\n")

    Xf = X.loc[:, FEATURE_COLUMNS].astype(float)

    # --- Batch predict with IsolationForest ---
    raw_if = scorer.iforest.decision_function(Xf)
    if scorer._iforest_max > scorer._iforest_min:
        norm_if = (scorer._iforest_max - raw_if) / (scorer._iforest_max - scorer._iforest_min)
    else:
        norm_if = np.full_like(raw_if, 0.5)
    anomaly_scores = np.clip(norm_if, 0.0, 1.0) * 100.0

    # --- Batch predict with GradientBoosting ---
    if scorer.supervised is not None:
        fraud_scores = scorer.supervised.predict_proba(Xf)[:, 1] * 100.0
    else:
        fraud_scores = anomaly_scores.copy()

    print("=" * 60)
    print("ISOLATION FOREST (Unsupervised Anomaly Detection)")
    print("=" * 60)

    for threshold in [30, 40, 50]:
        pred = (anomaly_scores >= threshold).astype(int)
        print(f"\n--- Threshold: anomaly_score >= {threshold} ---")
        print(f"Accuracy:  {accuracy_score(y, pred):.4f}")
        print(f"Confusion Matrix:\n{confusion_matrix(y, pred)}")
        print(classification_report(y, pred, target_names=["Normal", "Anomaly"], zero_division=0))

    auc_anomaly = roc_auc_score(y, anomaly_scores)
    print(f"ROC-AUC (anomaly_score): {auc_anomaly:.4f}\n")

    if scorer.supervised is not None:
        print("=" * 60)
        print("GRADIENT BOOSTING (Supervised Fraud Classifier)")
        print("=" * 60)

        for threshold in [30, 50, 70]:
            pred = (fraud_scores >= threshold).astype(int)
            print(f"\n--- Threshold: fraud_score >= {threshold} ---")
            print(f"Accuracy:  {accuracy_score(y, pred):.4f}")
            print(f"Confusion Matrix:\n{confusion_matrix(y, pred)}")
            print(classification_report(y, pred, target_names=["Normal", "Fraud"], zero_division=0))

        auc_fraud = roc_auc_score(y, fraud_scores)
        print(f"ROC-AUC (fraud_score): {auc_fraud:.4f}\n")

        # --- Feature importance ---
        print("=" * 60)
        print("TOP FEATURE IMPORTANCES (GradientBoosting)")
        print("=" * 60)
        importances = scorer.supervised.feature_importances_
        feat_imp = sorted(zip(X.columns, importances), key=lambda x: x[1], reverse=True)
        for name, imp in feat_imp:
            bar = "#" * int(imp * 200)
            print(f"  {name:25s} {imp:.4f}  {bar}")

    # --- Fused score (simulating pipeline: 55% ML + 45% rules = 0 here) ---
    # When rules_score=0, the pipeline gives: max(fraud*0.55, anomaly*0.6)
    fused = np.maximum(fraud_scores * 0.55, anomaly_scores * 0.6)

    print(f"\n{'=' * 60}")
    print("FUSED ML-ONLY SCORE (no rules)")
    print("=" * 60)
    for threshold in [30, 50, 60]:
        pred = (fused >= threshold).astype(int)
        print(f"\n--- Threshold: fused_score >= {threshold} ---")
        print(f"Accuracy:  {accuracy_score(y, pred):.4f}")
        print(f"Confusion Matrix:\n{confusion_matrix(y, pred)}")
        print(classification_report(y, pred, target_names=["Normal", "Anomaly"], zero_division=0))

    auc_fused = roc_auc_score(y, fused)
    print(f"ROC-AUC (fused ML-only): {auc_fused:.4f}\n")

    # --- Score distribution ---
    print("=" * 60)
    print("SCORE DISTRIBUTION SUMMARY")
    print("=" * 60)
    df_eval = pd.DataFrame({
        "true": y.values,
        "anomaly": anomaly_scores,
        "fraud": fraud_scores,
        "fused": fused,
    })
    for lv, ln in [(0, "Normal"), (1, "Anomaly")]:
        s = df_eval[df_eval["true"] == lv]
        print(f"\n{ln} (n={len(s)}):")
        print(f"  Anomaly: mean={s['anomaly'].mean():.1f}  med={s['anomaly'].median():.1f}  min={s['anomaly'].min():.1f}  max={s['anomaly'].max():.1f}")
        print(f"  Fraud:   mean={s['fraud'].mean():.1f}  med={s['fraud'].median():.1f}  min={s['fraud'].min():.1f}  max={s['fraud'].max():.1f}")
        print(f"  Fused:   mean={s['fused'].mean():.1f}  med={s['fused'].median():.1f}  min={s['fused'].min():.1f}  max={s['fused'].max():.1f}")


if __name__ == "__main__":
    main()
