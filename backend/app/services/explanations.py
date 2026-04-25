"""Analyst and customer explanations.

Builds plain-language explanations from rule hits and supervised feature
importances (used as a lightweight SHAP-equivalent for hackathon timing).
"""
from __future__ import annotations

from ..rules.risk_rules import ReasonHit
from ..schemas.transaction import Explanation, ReasonCode


CUSTOMER_REASON_TEMPLATES = {
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


def _format_factor(name: str, value: float) -> str:
    pretty = name.replace("_", " ")
    return f"{pretty} ({value:.2f})"


def build_explanation(
    hits: list[ReasonHit],
    feature_importance: dict[str, float] | None = None,
    risk_score: float = 0.0,
    risk_band: str = "LOW",
) -> Explanation:
    feature_importance = feature_importance or {}
    top_factors = [
        _format_factor(k, v)
        for k, v in sorted(feature_importance.items(), key=lambda kv: kv[1], reverse=True)[:5]
    ]
    if not top_factors:
        top_factors = [h.code for h in hits[:5]]

    rule_lines = [f"- [{h.code}] {h.description} (weight={h.weight:.2f})" for h in hits[:6]]
    analyst_text = (
        f"Risk score: {risk_score:.1f} (band: {risk_band}).\n"
        f"Top contributing factors: {', '.join(top_factors) if top_factors else 'none'}.\n"
        f"Triggered rules:\n" + ("\n".join(rule_lines) if rule_lines else "- none")
    )

    if not hits:
        customer_text = (
            "We approved this transaction. Everything looked normal compared to your usual activity."
        )
    else:
        codes_seen = []
        seen = set()
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

        if risk_band in ("HIGH", "CRITICAL"):
            opener = "We paused this transaction to keep your money safe."
        elif risk_band == "MEDIUM":
            opener = "We need a quick confirmation before completing this transaction."
        else:
            opener = "Just a heads up while we approved this transaction."

        customer_text = opener + " Reasons: " + "; ".join(codes_seen) + "."

    return Explanation(
        analyst=analyst_text,
        customer=customer_text,
        top_factors=top_factors,
    )


def hits_to_reason_codes(hits: list[ReasonHit]) -> list[ReasonCode]:
    return [ReasonCode(code=h.code, description=h.description, weight=h.weight) for h in hits]
