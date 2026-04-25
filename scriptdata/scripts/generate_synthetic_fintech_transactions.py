#!/usr/bin/env python3
"""Synthetic Pakistan-localized fintech transactions generator.

Adds: timestamp, customer_id, channel, city, kyc_tier, merchant_category, is_holiday
to the existing schema for the Smart Transaction Anomaly Detector hackathon project.
"""
from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd


PAKISTAN_CITIES = [
    "Karachi",
    "Lahore",
    "Islamabad",
    "Rawalpindi",
    "Faisalabad",
    "Peshawar",
    "Quetta",
    "Multan",
    "Hyderabad",
    "Sialkot",
]

CHANNELS = [
    "IBFT",
    "Raast",
    "1LINK",
    "JazzCash",
    "Easypaisa",
    "POS",
    "ATM",
    "App",
]

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

KYC_TIERS = ["low", "medium", "high"]

PAKISTAN_HOLIDAYS_2025 = {
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


@dataclass
class UserProfile:
    user_id: int
    cohort: str
    avg_amount: float
    volatility: float
    base_velocity: float
    history_base: int
    trusted_device_prob: float
    same_city_prob: float
    new_beneficiary_prob: float
    home_city: str
    kyc_tier: str
    preferred_channels: list[str]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", type=int, default=12000)
    p.add_argument("--users", type=int, default=900)
    p.add_argument("--anomaly-ratio", type=float, default=0.08)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--output-csv", type=str, default="data/raw/synthetic_fintech_transactions.csv")
    p.add_argument("--summary-md", type=str, default="reports/synthetic_fintech_transactions_summary.md")
    p.add_argument("--start-date", type=str, default="2025-01-01")
    p.add_argument("--end-date", type=str, default="2025-12-31")
    p.add_argument("--include-label", action="store_true", default=True)
    return p.parse_args()


def clip(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def make_profile(uid: int) -> UserProfile:
    r = random.random()
    home_city = random.choice(PAKISTAN_CITIES)
    kyc_tier = random.choices(KYC_TIERS, weights=[0.55, 0.35, 0.10])[0]
    preferred_channels = random.sample(CHANNELS, k=random.randint(2, 4))

    if r < 0.18:
        cohort = "high_spender"
        avg_amount = np.random.lognormal(5.6, 0.35)
        volatility = np.random.uniform(0.08, 0.25)
        base_velocity = np.random.uniform(1.2, 3.2)
        history = np.random.randint(220, 1300)
        trusted = np.random.uniform(0.85, 0.97)
        city = np.random.uniform(0.88, 0.98)
        ben = np.random.uniform(0.05, 0.18)
    elif r < 0.38:
        cohort = "low_frequency"
        avg_amount = np.random.lognormal(4.6, 0.45)
        volatility = np.random.uniform(0.10, 0.35)
        base_velocity = np.random.uniform(0.12, 0.7)
        history = np.random.randint(40, 500)
        trusted = np.random.uniform(0.78, 0.94)
        city = np.random.uniform(0.80, 0.96)
        ben = np.random.uniform(0.08, 0.24)
    elif r < 0.62:
        cohort = "high_frequency"
        avg_amount = np.random.lognormal(4.25, 0.32)
        volatility = np.random.uniform(0.05, 0.18)
        base_velocity = np.random.uniform(5.0, 18.0)
        history = np.random.randint(650, 3000)
        trusted = np.random.uniform(0.88, 0.99)
        city = np.random.uniform(0.90, 0.99)
        ben = np.random.uniform(0.03, 0.12)
    elif r < 0.82:
        cohort = "new_user"
        avg_amount = np.random.lognormal(4.1, 0.50)
        volatility = np.random.uniform(0.18, 0.45)
        base_velocity = np.random.uniform(0.4, 4.0)
        history = np.random.randint(2, 90)
        trusted = np.random.uniform(0.60, 0.85)
        city = np.random.uniform(0.68, 0.90)
        ben = np.random.uniform(0.15, 0.42)
    else:
        cohort = "standard"
        avg_amount = np.random.lognormal(4.45, 0.40)
        volatility = np.random.uniform(0.08, 0.28)
        base_velocity = np.random.uniform(0.8, 8.0)
        history = np.random.randint(80, 1400)
        trusted = np.random.uniform(0.80, 0.96)
        city = np.random.uniform(0.82, 0.97)
        ben = np.random.uniform(0.05, 0.20)

    return UserProfile(
        user_id=uid,
        cohort=cohort,
        avg_amount=float(clip(avg_amount, 8, 6000)),
        volatility=float(volatility),
        base_velocity=float(base_velocity),
        history_base=int(history),
        trusted_device_prob=float(trusted),
        same_city_prob=float(city),
        new_beneficiary_prob=float(ben),
        home_city=home_city,
        kyc_tier=kyc_tier,
        preferred_channels=preferred_channels,
    )


def allocate_counts(rows: int, users: int) -> np.ndarray:
    raw = np.random.gamma(2.5, 1.0, size=users)
    counts = np.floor(raw / raw.sum() * rows).astype(int)
    counts = np.maximum(counts, 1)
    gap = rows - int(counts.sum())
    while gap != 0:
        i = np.random.randint(0, users)
        if gap > 0:
            counts[i] += 1
            gap -= 1
        elif counts[i] > 1:
            counts[i] -= 1
            gap += 1
    return counts


def random_timestamp(start: datetime, end: datetime, hour_bias: str = "normal") -> datetime:
    delta = end - start
    days = random.randint(0, max(0, delta.days))
    base = start + timedelta(days=days)
    if hour_bias == "normal":
        hour = int(np.clip(np.random.normal(13, 3.5), 6, 22))
    elif hour_bias == "off_hours":
        hour = random.choice([0, 1, 2, 3, 4, 5, 23])
    elif hour_bias == "burst":
        hour = int(np.clip(np.random.normal(2, 1.5), 0, 5))
    else:
        hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return base.replace(hour=hour, minute=minute, second=second, microsecond=0)


def is_holiday_flag(dt: datetime) -> int:
    if (dt.month, dt.day) in PAKISTAN_HOLIDAYS_2025:
        return 1
    if dt.day in (1, 25, 26, 27, 28, 29, 30, 31):
        return 1
    return 0


def pick_channel(profile: UserProfile, anomaly: bool) -> str:
    if anomaly and random.random() < 0.45:
        return random.choice(["ATM", "POS", "P2P", "JazzCash", "Easypaisa"])
    if random.random() < 0.78:
        return random.choice(profile.preferred_channels)
    return random.choice(CHANNELS)


def pick_merchant_category(channel: str, anomaly: bool) -> str:
    if anomaly and random.random() < 0.45:
        return random.choice(["Cash", "P2P", "Electronics", "Travel"])
    weights = {
        "Groceries": 0.18,
        "Utilities": 0.12,
        "Travel": 0.06,
        "Electronics": 0.06,
        "Cash": 0.10,
        "P2P": 0.12,
        "Fuel": 0.08,
        "Dining": 0.10,
        "Healthcare": 0.06,
        "Education": 0.05,
        "Others": 0.07,
    }
    cats = list(weights.keys())
    w = list(weights.values())
    return random.choices(cats, weights=w)[0]


def pick_city(profile: UserProfile, anomaly: bool) -> str:
    if anomaly and random.random() < 0.55:
        candidates = [c for c in PAKISTAN_CITIES if c != profile.home_city]
        return random.choice(candidates)
    if random.random() < profile.same_city_prob:
        return profile.home_city
    return random.choice([c for c in PAKISTAN_CITIES if c != profile.home_city])


def normal_tx(p: UserProfile, idx: int, total: int, ts: datetime) -> dict:
    drift = np.sin((idx / max(1, total)) * np.pi * np.random.uniform(0.7, 1.3))
    avg = clip(p.avg_amount * (1.0 + drift * p.volatility * np.random.uniform(0.3, 0.7)), 5.0, 7000.0)
    amount = clip(avg * np.random.normal(1.0, p.volatility), 1.5, 15000.0)
    stability = min(p.history_base / 1800.0, 1.0)
    vel_sd = clip(2.2 * (1.0 - stability), 0.25, 2.5)
    velocity = int(max(0, round(np.random.normal(p.base_velocity, vel_sd))))
    history = int(max(0, p.history_base + idx + np.random.randint(-4, 5)))
    new_b = 1 if random.random() < clip(p.new_beneficiary_prob * (1.0 - 0.35 * stability), 0.01, 0.5) else 0
    device = (
        "trusted_device"
        if random.random() < p.trusted_device_prob
        else ("new_device" if random.random() < 0.82 else "emulated_device")
    )
    city = pick_city(p, anomaly=False)
    location = "same_city" if city == p.home_city else "different_city"
    channel = pick_channel(p, anomaly=False)
    merchant_category = pick_merchant_category(channel, anomaly=False)

    return {
        "timestamp": ts.isoformat(),
        "customer_id": f"C{p.user_id:05d}",
        "user_id": p.user_id,
        "amount": round(amount, 2),
        "avg_user_amount": round(avg, 2),
        "amount_deviation": round(amount - avg, 2),
        "tx_velocity": velocity,
        "tx_history": history,
        "new_beneficiary": new_b,
        "device": device,
        "location": location,
        "city": city,
        "home_city": p.home_city,
        "channel": channel,
        "merchant_category": merchant_category,
        "kyc_tier": p.kyc_tier,
        "is_holiday": is_holiday_flag(ts),
        "hour": ts.hour,
        "is_anomaly": 0,
    }


def inject_anomalies(df: pd.DataFrame, ratio: float, profiles: dict[int, UserProfile]) -> pd.DataFrame:
    n = max(1, int(round(len(df) * ratio)))
    idxs = np.random.choice(np.arange(len(df)), size=n, replace=False)
    df.loc[idxs, "is_anomaly"] = 1
    drift_users = set(
        np.random.choice(
            df["user_id"].unique(),
            size=max(1, int(df["user_id"].nunique() * 0.06)),
            replace=False,
        )
    )
    for i in idxs:
        r = df.loc[i].copy()
        uid = int(r["user_id"])
        profile = profiles.get(uid)

        r["amount"] = round(
            clip(float(r["avg_user_amount"]) * np.random.uniform(3.0, 10.0), 20.0, 25000.0),
            2,
        )
        r["tx_velocity"] = int(
            max(
                float(r["tx_velocity"]),
                round(
                    np.random.randint(8, 40)
                    * (1.0 + min(float(r["tx_history"]) / 1200.0, 1.5))
                ),
            )
        )
        if random.random() < 0.82:
            r["new_beneficiary"] = 1
        if random.random() < 0.78:
            r["device"] = "new_device" if random.random() < 0.6 else "emulated_device"
        if random.random() < 0.72 and profile is not None:
            other_cities = [c for c in PAKISTAN_CITIES if c != profile.home_city]
            r["city"] = random.choice(other_cities)
            r["location"] = "different_city"

        if random.random() < 0.6:
            try:
                ts = datetime.fromisoformat(str(r["timestamp"]))
                ts = ts.replace(hour=random.choice([0, 1, 2, 3, 4, 23]))
                r["timestamp"] = ts.isoformat()
                r["hour"] = ts.hour
            except Exception:
                pass

        if random.random() < 0.55:
            r["channel"] = random.choice(["ATM", "P2P", "Cash", "JazzCash", "Easypaisa"])
        if random.random() < 0.5:
            r["merchant_category"] = random.choice(["Cash", "P2P", "Electronics", "Travel"])

        if uid in drift_users and random.random() < 0.75:
            r["avg_user_amount"] = round(
                clip(float(r["avg_user_amount"]) * np.random.uniform(1.8, 3.8), 6.0, 9000.0),
                2,
            )
            if random.random() < 0.65:
                r["device"] = "emulated_device"

        r["amount_deviation"] = round(float(r["amount"]) - float(r["avg_user_amount"]), 2)
        min_dev = float(r["avg_user_amount"]) * np.random.uniform(2.5, 6.5)
        if float(r["amount_deviation"]) < min_dev:
            r["amount"] = round(float(r["avg_user_amount"]) + min_dev, 2)
            r["amount_deviation"] = round(min_dev, 2)
        df.loc[i] = r
    return df


def corr(a: pd.Series, b: pd.Series) -> float:
    return 0.0 if a.nunique() <= 1 or b.nunique() <= 1 else float(np.corrcoef(a.values, b.values)[0, 1])


def summary(df: pd.DataFrame) -> dict:
    normal = df[df["is_anomaly"] == 0]
    anom = df[df["is_anomaly"] == 1]
    return {
        "row_count": int(len(df)),
        "anomaly_count": int(len(anom)),
        "anomaly_ratio": float(len(anom) / len(df)),
        "amount_mean": float(df["amount"].mean()),
        "amount_p95": float(df["amount"].quantile(0.95)),
        "amount_p99": float(df["amount"].quantile(0.99)),
        "normal_velocity_mean": float(normal["tx_velocity"].mean()),
        "anomaly_velocity_mean": float(anom["tx_velocity"].mean()),
        "normal_amount_mean": float(normal["amount"].mean()),
        "anomaly_amount_mean": float(anom["amount"].mean()),
        "normal_new_beneficiary_rate": float(normal["new_beneficiary"].mean()),
        "anomaly_new_beneficiary_rate": float(anom["new_beneficiary"].mean()),
        "normal_risky_device_rate": float(normal["device"].isin(["new_device", "emulated_device"]).mean()),
        "anomaly_risky_device_rate": float(anom["device"].isin(["new_device", "emulated_device"]).mean()),
        "normal_diff_city_rate": float((normal["location"] == "different_city").mean()),
        "anomaly_diff_city_rate": float((anom["location"] == "different_city").mean()),
        "normal_offhours_rate": float(normal["hour"].isin([0, 1, 2, 3, 4, 5, 23]).mean()),
        "anomaly_offhours_rate": float(anom["hour"].isin([0, 1, 2, 3, 4, 5, 23]).mean()),
        "channel_distribution": df["channel"].value_counts(normalize=True).to_dict(),
        "merchant_distribution": df["merchant_category"].value_counts(normalize=True).to_dict(),
        "kyc_tier_distribution": df["kyc_tier"].value_counts(normalize=True).to_dict(),
        "city_distribution": df["city"].value_counts(normalize=True).to_dict(),
        "device_distribution": df["device"].value_counts(normalize=True).to_dict(),
        "missing_values_total": int(df.isna().sum().sum()),
    }


def write_md(s: dict, out: Path) -> None:
    lines = [
        "# Synthetic Fintech Transactions Summary",
        "",
        "## How Anomalies Were Generated",
        "- 8% anomalies injected by default (configurable 5-10%).",
        "- Fraud patterns: 3x-10x amount spikes, velocity bursts, off-hours timestamps, channel-shift to ATM/P2P/Cash, new beneficiary, risky devices, different-city.",
        "- Subset of users receives behavioral drift in baseline amount and device behavior.",
        "",
        "## Pakistan-Localized Fields",
        "- `timestamp`: ISO datetime spanning the configured date range.",
        "- `customer_id`: stable per-user identifier (e.g., C00123).",
        "- `channel`: one of IBFT, Raast, 1LINK, JazzCash, Easypaisa, POS, ATM, App.",
        "- `city` / `home_city`: Pakistani cities (Karachi, Lahore, Islamabad, etc.).",
        "- `kyc_tier`: low / medium / high (drives compliance weighting).",
        "- `merchant_category`: Groceries, Utilities, Cash, P2P, etc.",
        "- `is_holiday`: derived flag for Eid days, Independence Day, salary-credit windows.",
        "",
        "## Feature Summary",
        f"- Total rows: **{s['row_count']}**",
        f"- Anomalies: **{s['anomaly_count']}** ({s['anomaly_ratio']:.2%})",
        f"- Amount mean / P95 / P99: **{s['amount_mean']:.2f} / {s['amount_p95']:.2f} / {s['amount_p99']:.2f}**",
        f"- Avg velocity (normal vs anomaly): **{s['normal_velocity_mean']:.2f} vs {s['anomaly_velocity_mean']:.2f}**",
        f"- Avg amount (normal vs anomaly): **{s['normal_amount_mean']:.2f} vs {s['anomaly_amount_mean']:.2f}**",
        f"- New beneficiary rate (normal vs anomaly): **{s['normal_new_beneficiary_rate']:.2%} vs {s['anomaly_new_beneficiary_rate']:.2%}**",
        f"- Risky device rate (normal vs anomaly): **{s['normal_risky_device_rate']:.2%} vs {s['anomaly_risky_device_rate']:.2%}**",
        f"- Different-city rate (normal vs anomaly): **{s['normal_diff_city_rate']:.2%} vs {s['anomaly_diff_city_rate']:.2%}**",
        f"- Off-hours rate (normal vs anomaly): **{s['normal_offhours_rate']:.2%} vs {s['anomaly_offhours_rate']:.2%}**",
        f"- Channel distribution: **{json.dumps(s['channel_distribution'])}**",
        f"- Merchant distribution: **{json.dumps(s['merchant_distribution'])}**",
        f"- KYC tier distribution: **{json.dumps(s['kyc_tier_distribution'])}**",
        f"- Device distribution: **{json.dumps(s['device_distribution'])}**",
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    a = parse_args()
    if a.rows < 10000:
        raise ValueError("rows must be at least 10,000")
    if not (0.05 <= a.anomaly_ratio <= 0.10):
        raise ValueError("anomaly-ratio must be between 0.05 and 0.10")
    random.seed(a.seed)
    np.random.seed(a.seed)

    start = datetime.fromisoformat(a.start_date)
    end = datetime.fromisoformat(a.end_date)

    profiles = [make_profile(i) for i in range(a.users)]
    profile_map = {p.user_id: p for p in profiles}
    counts = allocate_counts(a.rows, a.users)
    rows = []
    for p, c in zip(profiles, counts):
        for i in range(int(c)):
            ts = random_timestamp(start, end, hour_bias="normal")
            rows.append(normal_tx(p, i, int(c), ts))

    df = pd.DataFrame(rows)
    df = inject_anomalies(df, a.anomaly_ratio, profile_map)

    df["tx_velocity"] = pd.to_numeric(df["tx_velocity"], errors="coerce").fillna(0).clip(lower=0).round().astype(int)
    df["tx_history"] = pd.to_numeric(df["tx_history"], errors="coerce").fillna(0).clip(lower=0).round().astype(int)
    df["new_beneficiary"] = pd.to_numeric(df["new_beneficiary"], errors="coerce").fillna(0).clip(lower=0, upper=1).round().astype(int)
    df["is_anomaly"] = pd.to_numeric(df["is_anomaly"], errors="coerce").fillna(0).clip(lower=0, upper=1).round().astype(int)
    df["is_holiday"] = pd.to_numeric(df["is_holiday"], errors="coerce").fillna(0).clip(lower=0, upper=1).round().astype(int)
    df["hour"] = pd.to_numeric(df["hour"], errors="coerce").fillna(12).clip(lower=0, upper=23).round().astype(int)

    df["device"] = df["device"].where(df["device"].isin(["trusted_device", "new_device", "emulated_device"]), "new_device")
    df["location"] = df["location"].where(df["location"].isin(["same_city", "different_city"]), "different_city")
    df["channel"] = df["channel"].where(df["channel"].isin(CHANNELS), "App")
    df["merchant_category"] = df["merchant_category"].where(df["merchant_category"].isin(MERCHANT_CATEGORIES), "Others")
    df["kyc_tier"] = df["kyc_tier"].where(df["kyc_tier"].isin(KYC_TIERS), "low")

    df = df.sample(frac=1.0, random_state=np.random.randint(1, 10000)).reset_index(drop=True)

    export_cols = [
        "timestamp",
        "customer_id",
        "amount",
        "avg_user_amount",
        "amount_deviation",
        "tx_velocity",
        "tx_history",
        "new_beneficiary",
        "device",
        "location",
        "city",
        "home_city",
        "channel",
        "merchant_category",
        "kyc_tier",
        "is_holiday",
        "hour",
    ]
    if a.include_label:
        export_cols.append("is_anomaly")
    out_csv = Path(a.output_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df.loc[:, export_cols].to_csv(out_csv, index=False)

    s = summary(df)
    write_md(s, Path(a.summary_md))
    print("Synthetic dataset generated successfully")
    print(f"Rows: {s['row_count']}")
    print(f"Anomaly ratio: {s['anomaly_ratio']:.2%}")
    print(f"Missing values: {s['missing_values_total']}")


if __name__ == "__main__":
    main()
