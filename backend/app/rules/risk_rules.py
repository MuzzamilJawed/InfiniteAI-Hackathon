"""Deterministic banking + Pakistan compliance rules.

Each rule emits a `ReasonHit` with a stable code, a human-readable description,
and a contribution weight (0-1) used in score fusion. Reason codes are designed
to be machine-readable so the dashboard and case management can group them.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


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

RISKY_CHANNELS = {"ATM", "P2P", "Cash"}
RISKY_MERCHANTS = {"Cash", "P2P", "Electronics", "Travel"}
RISKY_DEVICES = {"new_device", "emulated_device"}


@dataclass
class ReasonHit:
    code: str
    description: str
    weight: float


def _hour_from(timestamp) -> int:
    if isinstance(timestamp, datetime):
        return timestamp.hour
    if isinstance(timestamp, str):
        try:
            return datetime.fromisoformat(timestamp).hour
        except ValueError:
            return 12
    return 12


def _is_holiday(timestamp) -> bool:
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp)
        except ValueError:
            return False
    if isinstance(timestamp, datetime):
        return (timestamp.month, timestamp.day) in PAKISTAN_HOLIDAYS or timestamp.day in (
            1,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
        )
    return False


def evaluate_rules(tx: dict, baseline: dict | None = None) -> list[ReasonHit]:
    """Apply rules to a transaction. Returns a list of hits."""
    baseline = baseline or {}
    hits: list[ReasonHit] = []

    amount = float(tx.get("amount", 0))
    avg_amount = float(tx.get("avg_user_amount") or baseline.get("avg_user_amount") or amount or 1)
    avg_amount = max(avg_amount, 1.0)
    ratio = amount / avg_amount

    if ratio >= 6:
        hits.append(ReasonHit("AMT_SPIKE_6X", "Amount is 6x or more above customer baseline.", 0.30))
    elif ratio >= 3:
        hits.append(ReasonHit("AMT_SPIKE_3X", "Amount is 3x above customer baseline.", 0.18))

    if tx.get("city") and tx.get("home_city") and tx["city"] != tx["home_city"]:
        hits.append(ReasonHit("LOC_DIFF_CITY", f"Transaction city ({tx['city']}) differs from home city ({tx['home_city']}).", 0.15))

    hour = _hour_from(tx.get("timestamp"))
    if hour in (0, 1, 2, 3, 4, 5, 23):
        hits.append(ReasonHit("TIME_OFF_HOURS", f"Transaction at off-hours (hour={hour}).", 0.12))

    if _is_holiday(tx.get("timestamp")):
        hits.append(ReasonHit("CTX_HOLIDAY", "Transaction occurred on a holiday or salary-credit window.", 0.05))

    velocity = float(tx.get("tx_velocity") or baseline.get("tx_velocity") or 0)
    if velocity >= 20:
        hits.append(ReasonHit("VEL_BURST", f"High transaction velocity ({int(velocity)} in window).", 0.20))
    elif velocity >= 8:
        hits.append(ReasonHit("VEL_ELEVATED", f"Elevated transaction velocity ({int(velocity)}).", 0.10))

    if tx.get("new_beneficiary") and amount >= avg_amount * 2:
        hits.append(ReasonHit("BEN_NEW_HIGH_AMT", "New beneficiary with high transfer amount.", 0.18))

    device = tx.get("device", "trusted_device")
    if device in RISKY_DEVICES:
        hits.append(ReasonHit("DEV_RISKY", f"Risky device profile detected ({device}).", 0.15))

    channel = tx.get("channel")
    if channel in RISKY_CHANNELS:
        hits.append(ReasonHit("CHN_RISKY", f"Higher-risk channel used ({channel}).", 0.10))

    merchant = tx.get("merchant_category")
    if merchant in RISKY_MERCHANTS:
        hits.append(ReasonHit("MCC_RISKY", f"Higher-risk merchant category ({merchant}).", 0.05))

    kyc_tier = tx.get("kyc_tier", "medium")
    if kyc_tier == "low":
        hits.append(ReasonHit("KYC_LOW_TIER", "Customer is on low KYC tier (limited due diligence).", 0.10))
    elif kyc_tier == "medium":
        hits.append(ReasonHit("KYC_MED_TIER", "Customer is on medium KYC tier.", 0.04))

    if hour in (0, 1, 2, 3, 4) and channel == "ATM":
        hits.append(ReasonHit("ATM_NIGHT", "ATM withdrawal during high-risk night window.", 0.10))

    if device in RISKY_DEVICES and tx.get("city") != tx.get("home_city"):
        hits.append(ReasonHit("DEV_GEO_MISMATCH", "Risky device combined with city mismatch.", 0.10))

    return hits


def rules_score(hits: list[ReasonHit]) -> float:
    """Aggregate reason weights into a 0-100 score."""
    if not hits:
        return 0.0
    total = sum(h.weight for h in hits)
    return float(min(100.0, total * 100.0))


def compliance_metadata(tx: dict, hits: list[ReasonHit]) -> dict:
    """Return Pakistan compliance/audit metadata block."""
    codes = [h.code for h in hits]
    aml_flag = any(c in codes for c in {"AMT_SPIKE_6X", "VEL_BURST", "BEN_NEW_HIGH_AMT", "ATM_NIGHT"})
    sbp_monitor = aml_flag or tx.get("kyc_tier") == "low" and any(c.startswith("AMT_SPIKE") for c in codes)
    return {
        "sbp_risk_monitoring_flag": bool(sbp_monitor),
        "aml_review_required": bool(aml_flag),
        "kyc_tier": tx.get("kyc_tier", "medium"),
        "channel": tx.get("channel"),
        "city": tx.get("city"),
        "home_city": tx.get("home_city"),
        "is_holiday": _is_holiday(tx.get("timestamp")),
        "audit_reason_codes": codes,
    }
