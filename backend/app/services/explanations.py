"""Rich, multi-layered explanations for analysts and customers.

Produces:
  - headline: one-line gist
  - narrative: full analyst paragraph
  - customer message: friendly multi-sentence message
  - evidence: structured list (category, severity, observed vs expected)
  - top_factors: ML feature ranking (SHAP-equivalent)
  - recommended_action: what to do and why
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from ..rules.risk_rules import ReasonHit
from ..schemas.transaction import Evidence, Explanation, ReasonCode


# ---------------------------------------------------------------------------
# Mapping tables
# ---------------------------------------------------------------------------

CODE_TO_CATEGORY: dict[str, str] = {
    "AMT_SPIKE_6X": "Amount",
    "AMT_SPIKE_3X": "Amount",
    "LOC_DIFF_CITY": "Location",
    "TIME_OFF_HOURS": "Time",
    "CTX_HOLIDAY": "Time",
    "VEL_BURST": "Velocity",
    "VEL_ELEVATED": "Velocity",
    "BEN_NEW_HIGH_AMT": "Beneficiary",
    "DEV_RISKY": "Device",
    "DEV_GEO_MISMATCH": "Device",
    "CHN_RISKY": "Channel",
    "MCC_RISKY": "Channel",
    "KYC_LOW_TIER": "Compliance",
    "KYC_MED_TIER": "Compliance",
    "ATM_NIGHT": "Time",
}

CODE_TO_SEVERITY: dict[str, str] = {
    "AMT_SPIKE_6X": "critical",
    "AMT_SPIKE_3X": "high",
    "LOC_DIFF_CITY": "medium",
    "TIME_OFF_HOURS": "medium",
    "CTX_HOLIDAY": "low",
    "VEL_BURST": "critical",
    "VEL_ELEVATED": "medium",
    "BEN_NEW_HIGH_AMT": "high",
    "DEV_RISKY": "high",
    "DEV_GEO_MISMATCH": "high",
    "CHN_RISKY": "medium",
    "MCC_RISKY": "low",
    "KYC_LOW_TIER": "medium",
    "KYC_MED_TIER": "info",
    "ATM_NIGHT": "high",
}

CUSTOMER_REASON_TEMPLATES: dict[str, str] = {
    "AMT_SPIKE_6X": "this purchase is much larger than your usual spending",
    "AMT_SPIKE_3X": "this purchase is higher than your usual spending",
    "LOC_DIFF_CITY": "you appear to be transacting from a different city than usual",
    "TIME_OFF_HOURS": "this happened at an unusual time of day",
    "CTX_HOLIDAY": "today is a busy holiday/salary-credit day",
    "VEL_BURST": "we noticed many transactions in a short window",
    "VEL_ELEVATED": "your transaction frequency is higher than normal",
    "BEN_NEW_HIGH_AMT": "you are sending a large amount to a new beneficiary",
    "DEV_RISKY": "this device looks new or unusual",
    "CHN_RISKY": "the channel used is monitored more closely",
    "MCC_RISKY": "the merchant type is monitored more closely",
    "KYC_LOW_TIER": "we have limited verification on your account",
    "KYC_MED_TIER": "your account verification level applies stricter checks",
    "ATM_NIGHT": "ATM use late at night triggers extra checks",
    "DEV_GEO_MISMATCH": "a new device is being used outside your home city",
}

FRIENDLY_FEATURE_NAMES: dict[str, str] = {
    "amount_ratio": "Amount vs personal baseline",
    "amount_deviation": "Amount deviation",
    "is_off_hours": "Off-hours timing",
    "tx_velocity": "Transaction velocity",
    "diff_city": "City mismatch",
    "risky_device": "Risky device profile",
    "device_trusted": "Trusted-device signal",
    "tx_history": "Account maturity",
    "new_beneficiary": "New beneficiary",
    "kyc_risk_weight": "KYC tier weight",
    "risky_channel": "Risky channel",
    "risky_merchant": "Risky merchant category",
    "is_holiday": "Holiday context",
    "hour": "Hour of day",
    "amount": "Transaction amount",
    "avg_user_amount": "Customer baseline amount",
}

ACTION_RATIONALE: dict[str, str] = {
    "ALLOW": "Score is below the medium threshold (30). Approve and continue normal monitoring.",
    "STEP_UP_AUTH": "Score is in the 30-59 medium band. Send OTP/biometric step-up before completing.",
    "HOLD_FOR_REVIEW": "Score is in the 60-79 high band. Hold the funds and route to fraud ops for human review within SLA.",
    "BLOCK": "Score is at or above 80 (critical). Block immediately, freeze beneficiary if applicable, notify customer, and open an SBP/AML case.",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_pkr(v: float | int | None) -> str:
    if v is None:
        return "—"
    return f"PKR {float(v):,.0f}"


def _fmt_hour(h: int | None) -> str:
    if h is None:
        return "—"
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12:02d}:00 {suffix}"


def _hour_from_ts(ts) -> Optional[int]:
    if isinstance(ts, datetime):
        return ts.hour
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts).hour
        except ValueError:
            return None
    return None


def _build_evidence(
    hits: list[ReasonHit],
    tx: dict | None,
    baseline: dict | None,
    feature_snapshot: dict | None,
) -> list[Evidence]:
    """Convert rule hits into structured evidence with observed/expected values."""
    tx = tx or {}
    baseline = baseline or {}
    fs = feature_snapshot or {}
    out: list[Evidence] = []

    amount = float(tx.get("amount", fs.get("amount", 0)) or 0)
    avg_amount = float(tx.get("avg_user_amount") or baseline.get("avg_user_amount") or fs.get("avg_user_amount") or amount or 1)
    ratio = amount / max(avg_amount, 1.0)
    hour = _hour_from_ts(tx.get("timestamp"))
    if hour is None and "hour" in fs:
        hour = int(fs.get("hour") or 12)

    for h in hits:
        category = CODE_TO_CATEGORY.get(h.code, "Behavior")
        severity = CODE_TO_SEVERITY.get(h.code, "medium")

        observed: Optional[str] = None
        expected: Optional[str] = None

        if h.code in ("AMT_SPIKE_6X", "AMT_SPIKE_3X"):
            observed = f"{_fmt_pkr(amount)} ({ratio:.1f}x baseline)"
            expected = f"~{_fmt_pkr(avg_amount)} typical"
        elif h.code == "LOC_DIFF_CITY":
            observed = str(tx.get("city") or "—")
            expected = f"home: {tx.get('home_city') or '—'}"
        elif h.code == "TIME_OFF_HOURS":
            observed = _fmt_hour(hour)
            expected = "06:00 AM – 10:00 PM normal"
        elif h.code == "ATM_NIGHT":
            observed = f"ATM at {_fmt_hour(hour)}"
            expected = "Daytime ATM use"
        elif h.code in ("VEL_BURST", "VEL_ELEVATED"):
            v = int(tx.get("tx_velocity") or baseline.get("tx_velocity") or fs.get("tx_velocity") or 0)
            observed = f"{v} tx in burst window"
            expected = "≤7 tx/window typical"
        elif h.code == "BEN_NEW_HIGH_AMT":
            observed = f"{_fmt_pkr(amount)} to new beneficiary"
            expected = "First transfer ≤2x baseline"
        elif h.code in ("DEV_RISKY", "DEV_GEO_MISMATCH"):
            observed = str(tx.get("device") or "—")
            expected = "trusted_device"
        elif h.code == "CHN_RISKY":
            observed = f"channel: {tx.get('channel') or '—'}"
            expected = "lower-risk channels (Raast, IBFT, App)"
        elif h.code == "MCC_RISKY":
            observed = f"merchant: {tx.get('merchant_category') or '—'}"
            expected = "everyday categories (Groceries, Utilities)"
        elif h.code in ("KYC_LOW_TIER", "KYC_MED_TIER"):
            observed = f"KYC: {tx.get('kyc_tier') or '—'}"
            expected = "high KYC for sensitive flows"
        elif h.code == "CTX_HOLIDAY":
            observed = "Holiday / salary window"
            expected = "Regular weekday"

        out.append(
            Evidence(
                category=category,  # type: ignore[arg-type]
                severity=severity,  # type: ignore[arg-type]
                title=_evidence_title(h.code, ratio, hour, tx),
                detail=h.description,
                observed=observed,
                expected=expected,
            )
        )

    # Always add a "Model" evidence block summarizing ML output
    out.append(
        Evidence(
            category="Model",
            severity="info",
            title="ML score breakdown",
            detail="Hybrid scoring combines GradientBoosting (supervised fraud) with IsolationForest (unsupervised anomaly), then fuses with rule weights.",
            observed=None,
            expected=None,
        )
    )
    return out


def _evidence_title(code: str, ratio: float, hour: Optional[int], tx: dict) -> str:
    if code == "AMT_SPIKE_6X":
        return f"Amount spike — {ratio:.1f}× baseline"
    if code == "AMT_SPIKE_3X":
        return f"Elevated amount — {ratio:.1f}× baseline"
    if code == "LOC_DIFF_CITY":
        return f"Out-of-city transaction ({tx.get('city')})"
    if code == "TIME_OFF_HOURS":
        return f"Off-hours activity at {_fmt_hour(hour)}"
    if code == "ATM_NIGHT":
        return f"Night ATM withdrawal ({_fmt_hour(hour)})"
    if code == "VEL_BURST":
        return "Velocity burst detected"
    if code == "VEL_ELEVATED":
        return "Elevated transaction frequency"
    if code == "BEN_NEW_HIGH_AMT":
        return "High amount to new beneficiary"
    if code == "DEV_RISKY":
        return f"Risky device ({tx.get('device')})"
    if code == "DEV_GEO_MISMATCH":
        return "Risky device + city mismatch"
    if code == "CHN_RISKY":
        return f"Higher-risk channel ({tx.get('channel')})"
    if code == "MCC_RISKY":
        return f"Higher-risk merchant ({tx.get('merchant_category')})"
    if code == "KYC_LOW_TIER":
        return "Low-tier KYC customer"
    if code == "KYC_MED_TIER":
        return "Medium-tier KYC customer"
    if code == "CTX_HOLIDAY":
        return "Holiday / salary credit window"
    return code


def _format_factor(name: str, value: float) -> str:
    pretty = FRIENDLY_FEATURE_NAMES.get(name, name.replace("_", " "))
    return f"{pretty} ({value:.2f})"


def _build_headline(risk_band: str, hits: list[ReasonHit], ratio: float) -> str:
    if not hits:
        return "Transaction approved — no risk signals."
    primary = hits[0]
    cat = CODE_TO_CATEGORY.get(primary.code, "Behavior")
    if risk_band == "CRITICAL":
        return f"Critical {cat.lower()} risk — blocked for safety."
    if risk_band == "HIGH":
        return f"High {cat.lower()} risk — held for review."
    if risk_band == "MEDIUM":
        return f"Medium {cat.lower()} risk — step-up authentication required."
    return f"Low risk — minor {cat.lower()} signal noted."


def _build_narrative(
    risk_score: float,
    risk_band: str,
    hits: list[ReasonHit],
    evidence: list[Evidence],
    top_factors: list[str],
    tx: dict | None,
) -> str:
    tx = tx or {}
    parts: list[str] = []

    parts.append(
        f"This transaction was scored at {risk_score:.1f}/100 ({risk_band}). "
        f"The decision combines a supervised ML fraud model, an unsupervised anomaly detector, "
        f"and {len(hits)} rule hit{'s' if len(hits) != 1 else ''}."
    )

    if hits:
        # Group by category for the narrative
        by_cat: dict[str, list[Evidence]] = {}
        for e in evidence:
            if e.category == "Model":
                continue
            by_cat.setdefault(e.category, []).append(e)

        if by_cat:
            cat_lines = []
            for cat, items in by_cat.items():
                titles = ", ".join(it.title.lower() for it in items)
                cat_lines.append(f"**{cat}**: {titles}")
            parts.append("Signals grouped by category — " + " · ".join(cat_lines) + ".")

    if top_factors:
        parts.append("Top ML factors: " + ", ".join(top_factors[:3]) + ".")

    if tx.get("city") and tx.get("home_city") and tx["city"] != tx["home_city"]:
        parts.append(f"Geographic note: txn city={tx['city']}, home city={tx['home_city']}.")

    parts.append(ACTION_RATIONALE.get({
        "LOW": "ALLOW",
        "MEDIUM": "STEP_UP_AUTH",
        "HIGH": "HOLD_FOR_REVIEW",
        "CRITICAL": "BLOCK",
    }.get(risk_band, "ALLOW"), ""))

    return " ".join(parts)


def _build_customer_text(risk_band: str, hits: list[ReasonHit], tx: dict | None) -> str:
    tx = tx or {}
    if not hits:
        return (
            "We approved this transaction. Everything looked normal compared to your usual activity — "
            "your spending pattern, location, device, and time of day all match your history."
        )

    codes_seen: list[str] = []
    seen: set[str] = set()
    for h in hits:
        if h.code in seen:
            continue
        seen.add(h.code)
        if h.code in CUSTOMER_REASON_TEMPLATES:
            codes_seen.append(CUSTOMER_REASON_TEMPLATES[h.code])
        if len(codes_seen) >= 3:
            break

    if not codes_seen:
        codes_seen = ["this transaction did not match your usual pattern"]

    if risk_band == "CRITICAL":
        opener = "We blocked this transaction to protect your account."
        closer = "If you started this transaction, please reach out so we can verify and re-enable."
    elif risk_band == "HIGH":
        opener = "We paused this transaction for a quick review."
        closer = "Our fraud team will reach out shortly. You can also confirm it from the Security Alerts page."
    elif risk_band == "MEDIUM":
        opener = "We need a quick confirmation before completing this transaction."
        closer = "Open Security Alerts and tap 'Yes, this was me' or 'Report fraud'."
    else:
        opener = "Just a heads up — we approved this transaction."
        closer = "If anything looks wrong, you can dispute it from Security Alerts."

    return f"{opener} Why: {'; '.join(codes_seen)}. {closer}"


def _build_recommended_action(risk_band: str, action: str, hits: list[ReasonHit]) -> str:
    base = ACTION_RATIONALE.get(action, "")
    extras: list[str] = []
    codes = {h.code for h in hits}
    if "AMT_SPIKE_6X" in codes or "VEL_BURST" in codes:
        extras.append("Trigger AML review (>= 50 weight on amount/velocity).")
    if "DEV_GEO_MISMATCH" in codes:
        extras.append("Quarantine the device until customer reconfirms.")
    if "BEN_NEW_HIGH_AMT" in codes:
        extras.append("Cool-down period on the new beneficiary recommended.")
    if "ATM_NIGHT" in codes:
        extras.append("Cross-check ATM camera/branch logs for the time window.")
    return base + (" " + " ".join(extras) if extras else "")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_explanation(
    hits: list[ReasonHit],
    feature_importance: dict[str, float] | None = None,
    risk_score: float = 0.0,
    risk_band: str = "LOW",
    action: str = "ALLOW",
    tx: dict | None = None,
    baseline: dict | None = None,
    feature_snapshot: dict | None = None,
) -> Explanation:
    feature_importance = feature_importance or {}
    top_factors = [
        _format_factor(k, v)
        for k, v in sorted(feature_importance.items(), key=lambda kv: kv[1], reverse=True)[:5]
    ]
    if not top_factors:
        top_factors = [h.code for h in hits[:5]]

    evidence = _build_evidence(hits, tx, baseline, feature_snapshot)

    tx = tx or {}
    fs = feature_snapshot or {}
    amount = float(tx.get("amount", fs.get("amount", 0)) or 0)
    avg_amount = float(tx.get("avg_user_amount") or (baseline or {}).get("avg_user_amount") or fs.get("avg_user_amount") or amount or 1)
    ratio = amount / max(avg_amount, 1.0)

    headline = _build_headline(risk_band, hits, ratio)
    narrative = _build_narrative(risk_score, risk_band, hits, evidence, top_factors, tx)
    customer_text = _build_customer_text(risk_band, hits, tx)
    recommended = _build_recommended_action(risk_band, action, hits)

    rule_lines = [f"  - [{h.code}] {h.description} (weight={h.weight:.2f})" for h in hits[:8]]
    analyst_text = (
        f"{headline}\n\n"
        f"{narrative}\n\n"
        f"Top ML factors:\n  - " + ("\n  - ".join(top_factors) if top_factors else "none") + "\n\n"
        f"Triggered rules:\n" + ("\n".join(rule_lines) if rule_lines else "  - none") + "\n\n"
        f"Recommended action: {recommended}"
    )

    return Explanation(
        analyst=analyst_text,
        customer=customer_text,
        top_factors=top_factors,
        headline=headline,
        narrative=narrative,
        recommended_action=recommended,
        evidence=evidence,
    )


def hits_to_reason_codes(hits: list[ReasonHit]) -> list[ReasonCode]:
    return [ReasonCode(code=h.code, description=h.description, weight=h.weight) for h in hits]
