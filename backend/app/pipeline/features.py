"""Feature engineering for the Smart Transaction Anomaly Detector.

Builds a model-ready feature dataframe from raw transaction records (pandas)
and from a single inbound transaction (dict). Both flows share the same
ordered column list for consistent training and inference.
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable

import numpy as np
import pandas as pd


CHANNELS = ["IBFT", "Raast", "1LINK", "JazzCash", "Easypaisa", "POS", "ATM", "App", "Card"]
DEVICES = ["trusted_device", "new_device", "emulated_device"]
KYC_TIERS = ["low", "medium", "high"]
MERCHANT_CATEGORIES = [
    "Groceries",
    "Utilities",
    "Travel",
    "Electronics",
    "Cash",
    "P2P",
    "Fuel",
    "Dining",
    "Healthcare",
    "Education",
    "Others",
]

PAKISTAN_HOLIDAYS = {
    (3, 31),
    (4, 1),
    (4, 2),
    (5, 1),
    (6, 7),
    (6, 8),
    (8, 14),
    (9, 5),
    (12, 25),
}

KYC_RISK_WEIGHT = {"low": 1.0, "medium": 0.6, "high": 0.3}
RISKY_CHANNELS = {"ATM", "P2P", "Cash"}
RISKY_MERCHANTS = {"Cash", "P2P", "Electronics", "Travel"}


FEATURE_COLUMNS: list[str] = [
    "amount",
    "avg_user_amount",
    "amount_deviation",
    "amount_ratio",
    "tx_velocity",
    "tx_history",
    "new_beneficiary",
    "is_holiday",
    "hour",
    "is_off_hours",
    "diff_city",
    "kyc_risk_weight",
    "risky_channel",
    "risky_merchant",
    "risky_device",
    "device_trusted",
]


def _hour_from_value(value) -> int:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return 12
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).hour
        except ValueError:
            return 12
    if isinstance(value, datetime):
        return value.hour
    return 12


def _is_holiday(ts) -> int:
    if ts is None:
        return 0
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts)
        except ValueError:
            return 0
    if isinstance(ts, datetime):
        if (ts.month, ts.day) in PAKISTAN_HOLIDAYS:
            return 1
        if ts.day in (1, 25, 26, 27, 28, 29, 30, 31):
            return 1
    return 0


def build_training_frame(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series | None]:
    """Build a numeric feature dataframe from the synthetic dataset.

    Returns (X, y) where y is the optional `is_anomaly` series.
    """
    out = pd.DataFrame()
    out["amount"] = df["amount"].astype(float)
    out["avg_user_amount"] = df["avg_user_amount"].astype(float)
    out["amount_deviation"] = df["amount_deviation"].astype(float)
    out["amount_ratio"] = (out["amount"] / out["avg_user_amount"].replace(0, np.nan)).fillna(1.0)
    out["tx_velocity"] = df["tx_velocity"].astype(float)
    out["tx_history"] = df["tx_history"].astype(float)
    out["new_beneficiary"] = df["new_beneficiary"].astype(int)

    if "is_holiday" in df.columns:
        out["is_holiday"] = df["is_holiday"].astype(int)
    else:
        out["is_holiday"] = df.get("timestamp", pd.Series([None] * len(df))).map(_is_holiday).fillna(0).astype(int)

    if "hour" in df.columns:
        out["hour"] = df["hour"].astype(int)
    else:
        out["hour"] = df.get("timestamp", pd.Series([None] * len(df))).map(_hour_from_value).astype(int)

    out["is_off_hours"] = out["hour"].isin([0, 1, 2, 3, 4, 5, 23]).astype(int)

    if "city" in df.columns and "home_city" in df.columns:
        out["diff_city"] = (df["city"] != df["home_city"]).astype(int)
    else:
        out["diff_city"] = (df.get("location", pd.Series(["same_city"] * len(df))) == "different_city").astype(int)

    if "kyc_tier" in df.columns:
        out["kyc_risk_weight"] = df["kyc_tier"].map(KYC_RISK_WEIGHT).fillna(0.6)
    else:
        out["kyc_risk_weight"] = 0.6

    if "channel" in df.columns:
        out["risky_channel"] = df["channel"].isin(RISKY_CHANNELS).astype(int)
    else:
        out["risky_channel"] = 0

    if "merchant_category" in df.columns:
        out["risky_merchant"] = df["merchant_category"].isin(RISKY_MERCHANTS).astype(int)
    else:
        out["risky_merchant"] = 0

    if "device" in df.columns:
        out["risky_device"] = df["device"].isin(["new_device", "emulated_device"]).astype(int)
        out["device_trusted"] = (df["device"] == "trusted_device").astype(int)
    else:
        out["risky_device"] = 0
        out["device_trusted"] = 1

    out = out.loc[:, FEATURE_COLUMNS].astype(float)
    y = df["is_anomaly"].astype(int) if "is_anomaly" in df.columns else None
    return out, y


def build_inference_features(tx: dict, baseline: dict | None = None) -> pd.DataFrame:
    """Build a 1-row feature frame from a transaction dict.

    `baseline` may carry per-customer averages computed from history.
    """
    baseline = baseline or {}
    avg_user_amount = float(tx.get("avg_user_amount") or baseline.get("avg_user_amount") or tx["amount"])
    if avg_user_amount <= 0:
        avg_user_amount = float(tx["amount"])

    amount = float(tx["amount"])
    amount_deviation = amount - avg_user_amount
    amount_ratio = amount / avg_user_amount if avg_user_amount > 0 else 1.0

    tx_velocity = float(tx.get("tx_velocity") or baseline.get("tx_velocity") or 1)
    tx_history = float(tx.get("tx_history") or baseline.get("tx_history") or 50)
    new_beneficiary = int(bool(tx.get("new_beneficiary", False)))

    timestamp = tx.get("timestamp") or datetime.now()
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp)
        except ValueError:
            timestamp = datetime.now()

    hour = timestamp.hour if isinstance(timestamp, datetime) else 12
    is_off_hours = int(hour in {0, 1, 2, 3, 4, 5, 23})
    is_holiday = _is_holiday(timestamp)

    diff_city = int(tx.get("city") != tx.get("home_city"))
    kyc_tier = tx.get("kyc_tier") or "medium"
    kyc_risk_weight = KYC_RISK_WEIGHT.get(kyc_tier, 0.6)

    channel = tx.get("channel", "App")
    merchant_category = tx.get("merchant_category", "Others")
    device = tx.get("device", "trusted_device")

    feature_row = {
        "amount": amount,
        "avg_user_amount": avg_user_amount,
        "amount_deviation": amount_deviation,
        "amount_ratio": amount_ratio,
        "tx_velocity": tx_velocity,
        "tx_history": tx_history,
        "new_beneficiary": new_beneficiary,
        "is_holiday": is_holiday,
        "hour": hour,
        "is_off_hours": is_off_hours,
        "diff_city": diff_city,
        "kyc_risk_weight": kyc_risk_weight,
        "risky_channel": int(channel in RISKY_CHANNELS),
        "risky_merchant": int(merchant_category in RISKY_MERCHANTS),
        "risky_device": int(device in {"new_device", "emulated_device"}),
        "device_trusted": int(device == "trusted_device"),
    }

    df = pd.DataFrame([feature_row], columns=FEATURE_COLUMNS).astype(float)
    return df


def feature_names() -> list[str]:
    return list(FEATURE_COLUMNS)
