"""Evaluate ML model on NEW unseen records (different seed from training data).

Generates 2000 fresh transactions, scores each through the full ML pipeline,
and reports accuracy metrics separately for:
  1. ML-only scores (fraud_score, anomaly_score)
  2. Full pipeline (ML + rules fused risk_score)
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
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scriptdata" / "scripts"))

from generate_synthetic_fintech_transactions import (
    USD_TO_PKR,
    allocate_counts,
    inject_anomalies,
    is_holiday_flag,
    make_profile,
    normal_tx,
    random_timestamp,
)
from datetime import datetime
import random

from app.models.anomaly_model import HybridScorer
from app.pipeline.features import FEATURE_COLUMNS, build_training_frame

ROWS = 2000
USERS = 150
ANOMALY_RATIO = 0.08
NEW_SEED = 9999


def generate_unseen_data() -> pd.DataFrame:
    random.seed(NEW_SEED)
    np.random.seed(NEW_SEED)

    start = datetime(2026, 1, 1)
    end = datetime(2026, 6, 30)

    profiles = [make_profile(i + 5000) for i in range(USERS)]
    profile_map = {p.user_id: p for p in profiles}
    counts = allocate_counts(ROWS, USERS)

    rows = []
    for p, c in zip(profiles, counts):
        for i in range(int(c)):
            ts = random_timestamp(start, end, hour_bias="normal")
            rows.append(normal_tx(p, i, int(c), ts))

    df = pd.DataFrame(rows)
    df = inject_anomalies(df, ANOMALY_RATIO, profile_map)

    # Convert USD-scale amounts to PKR
    for col in ("amount", "avg_user_amount", "amount_deviation"):
        df[col] = (df[col].astype(float) * USD_TO_PKR).round(2)

    for col in ["tx_velocity", "tx_history", "new_beneficiary", "is_anomaly", "is_holiday", "hour"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    df = df.sample(frac=1.0, random_state=NEW_SEED).reset_index(drop=True)
    return df


def main():
    print("=" * 60)
    print("GENERATING 2000 UNSEEN RECORDS (seed=9999)")
    print("=" * 60)
    df = generate_unseen_data()
    print(f"Generated: {len(df)} rows")
    print(f"Label distribution:\n{df['is_anomaly'].value_counts().to_string()}\n")

    anom = df[df["is_anomaly"] == 1]
    ratio = anom["amount"] / anom["avg_user_amount"].replace(0, 1)
    print(f"Anomaly amount_ratio: mean={ratio.mean():.2f}, min={ratio.min():.2f}, max={ratio.max():.2f}")
    print(f"Non-spike anomalies (ratio < 2): {(ratio < 2).sum()} / {len(ratio)}")
    print(f"Off-hours anomalies: {anom['hour'].isin([0,1,2,3,4,5,23]).sum()}")
    print(f"Diff-city anomalies: {(anom['city'] != anom['home_city']).sum()}")
    print(f"Risky device: {anom['device'].isin(['new_device','emulated_device']).sum()}")
    print(f"High velocity (>14): {(anom['tx_velocity'] > 14).sum()}\n")

    X, y = build_training_frame(df)

    scorer = HybridScorer()
    if not scorer.load():
        print("ERROR: No trained model found. Run train first.")
        return
    print(f"Model loaded. Supervised: {scorer.supervised is not None}\n")

    Xf = X.loc[:, FEATURE_COLUMNS].astype(float)

    # --- ML-only predictions (vectorized) ---
    raw_if = scorer.iforest.decision_function(Xf)
    norm_if = (scorer._iforest_max - raw_if) / max(scorer._iforest_max - scorer._iforest_min, 1e-9)
    anomaly_scores = np.clip(norm_if, 0.0, 1.0) * 100.0

    fraud_scores = scorer.supervised.predict_proba(Xf)[:, 1] * 100.0 if scorer.supervised else anomaly_scores.copy()

    # --- Full pipeline fused score (ML + rules @ 0 since we skip rules for ML eval) ---
    fused_ml = np.maximum(fraud_scores * 0.55, anomaly_scores * 0.6)

    # ===== RESULTS =====
    print("=" * 60)
    print("1. ISOLATION FOREST (Unsupervised) — New Records")
    print("=" * 60)
    for thr in [30, 40, 50]:
        pred = (anomaly_scores >= thr).astype(int)
        print(f"\n--- Threshold >= {thr} ---")
        print(f"Accuracy:  {accuracy_score(y, pred):.4f}")
        cm = confusion_matrix(y, pred)
        print(f"Confusion Matrix:\n{cm}")
        print(classification_report(y, pred, target_names=["Normal", "Anomaly"], zero_division=0))
    auc_a = roc_auc_score(y, anomaly_scores)
    print(f"ROC-AUC (anomaly): {auc_a:.4f}\n")

    print("=" * 60)
    print("2. GRADIENT BOOSTING (Supervised) — New Records")
    print("=" * 60)
    for thr in [30, 50, 70]:
        pred = (fraud_scores >= thr).astype(int)
        print(f"\n--- Threshold >= {thr} ---")
        print(f"Accuracy:  {accuracy_score(y, pred):.4f}")
        cm = confusion_matrix(y, pred)
        print(f"Confusion Matrix:\n{cm}")
        print(classification_report(y, pred, target_names=["Normal", "Fraud"], zero_division=0))
    auc_f = roc_auc_score(y, fraud_scores)
    print(f"ROC-AUC (fraud): {auc_f:.4f}\n")

    print("=" * 60)
    print("3. FUSED ML SCORE (55% fraud + anomaly floor) — New Records")
    print("=" * 60)
    for thr in [30, 50]:
        pred = (fused_ml >= thr).astype(int)
        print(f"\n--- Threshold >= {thr} ---")
        print(f"Accuracy:  {accuracy_score(y, pred):.4f}")
        cm = confusion_matrix(y, pred)
        print(f"Confusion Matrix:\n{cm}")
        print(classification_report(y, pred, target_names=["Normal", "Anomaly"], zero_division=0))
    auc_fused = roc_auc_score(y, fused_ml)
    print(f"ROC-AUC (fused ML): {auc_fused:.4f}\n")

    print("=" * 60)
    print("4. FEATURE IMPORTANCES (what the model relies on)")
    print("=" * 60)
    if scorer.supervised:
        feat_imp = sorted(zip(FEATURE_COLUMNS, scorer.supervised.feature_importances_), key=lambda x: x[1], reverse=True)
        for name, imp in feat_imp:
            bar = "#" * int(imp * 150)
            print(f"  {name:25s} {imp:.4f}  {bar}")

    print(f"\n{'=' * 60}")
    print("5. SCORE DISTRIBUTION ON NEW DATA")
    print("=" * 60)
    df_eval = pd.DataFrame({"true": y.values, "anomaly": anomaly_scores, "fraud": fraud_scores, "fused": fused_ml})
    for lv, ln in [(0, "Normal"), (1, "Anomaly")]:
        s = df_eval[df_eval["true"] == lv]
        print(f"\n{ln} (n={len(s)}):")
        print(f"  Anomaly: mean={s['anomaly'].mean():.1f}  med={s['anomaly'].median():.1f}  min={s['anomaly'].min():.1f}  max={s['anomaly'].max():.1f}")
        print(f"  Fraud:   mean={s['fraud'].mean():.1f}  med={s['fraud'].median():.1f}  min={s['fraud'].min():.1f}  max={s['fraud'].max():.1f}")
        print(f"  Fused:   mean={s['fused'].mean():.1f}  med={s['fused'].median():.1f}  min={s['fused'].min():.1f}  max={s['fused'].max():.1f}")

    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print("=" * 60)
    best_thr_fraud = 50
    pred_best = (fraud_scores >= best_thr_fraud).astype(int)
    acc = accuracy_score(y, pred_best)
    from sklearn.metrics import precision_score, recall_score, f1_score
    prec = precision_score(y, pred_best, zero_division=0)
    rec = recall_score(y, pred_best, zero_division=0)
    f1 = f1_score(y, pred_best, zero_division=0)
    print(f"  GradientBoosting @ threshold 50 on {len(df)} UNSEEN records:")
    print(f"    Accuracy:   {acc:.4f}  ({acc*100:.2f}%)")
    print(f"    Precision:  {prec:.4f}")
    print(f"    Recall:     {rec:.4f}")
    print(f"    F1-Score:   {f1:.4f}")
    print(f"    ROC-AUC:    {auc_f:.4f}")


if __name__ == "__main__":
    main()
