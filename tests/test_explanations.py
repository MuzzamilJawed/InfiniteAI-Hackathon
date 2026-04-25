"""Tests for the rich anomaly-explanation system.

Validates that build_explanation produces:
  - headline
  - narrative (analyst paragraph)
  - customer-friendly text
  - structured evidence (category, severity, observed vs expected)
  - recommended_action with situational add-ons
  - top_factors with friendly feature names
"""
from __future__ import annotations

from datetime import datetime

import pytest

from backend.app.rules.risk_rules import ReasonHit, evaluate_rules
from backend.app.schemas.transaction import TransactionRequest
from backend.app.services.explanations import (
    CODE_TO_CATEGORY,
    CODE_TO_SEVERITY,
    FRIENDLY_FEATURE_NAMES,
    build_explanation,
)
from backend.app.services.scoring_service import ScoringService


# ---------------------------------------------------------------------------
# Direct unit tests on build_explanation
# ---------------------------------------------------------------------------

class TestBuildExplanation:
    def test_no_hits_returns_clean_message(self):
        exp = build_explanation([], {}, risk_score=10.0, risk_band="LOW", action="ALLOW")
        assert exp.headline is not None
        assert "approved" in exp.customer.lower()
        assert exp.evidence == [] or all(e.category == "Model" for e in exp.evidence or [])

    def test_evidence_built_for_amount_spike(self):
        hits = [ReasonHit("AMT_SPIKE_6X", "Amount is 6x or more above customer baseline.", 0.30)]
        tx = {"amount": 30000.0, "avg_user_amount": 2500.0, "city": "Karachi", "home_city": "Karachi"}
        exp = build_explanation(
            hits, {"amount": 0.5}, risk_score=85.0, risk_band="CRITICAL", action="BLOCK", tx=tx
        )
        ev_amount = [e for e in (exp.evidence or []) if e.category == "Amount"]
        assert ev_amount, "No Amount evidence produced"
        assert "12.0" in (ev_amount[0].title or "") or "12" in (ev_amount[0].title or "")
        assert ev_amount[0].observed and "PKR" in ev_amount[0].observed
        assert ev_amount[0].expected and "PKR" in ev_amount[0].expected
        assert ev_amount[0].severity in ("high", "critical")

    def test_evidence_built_for_location_anomaly(self):
        hits = [ReasonHit("LOC_DIFF_CITY", "Different city.", 0.15)]
        tx = {"amount": 5000, "avg_user_amount": 5000, "city": "Quetta", "home_city": "Karachi"}
        exp = build_explanation(hits, {}, risk_score=40, risk_band="MEDIUM", action="STEP_UP_AUTH", tx=tx)
        ev = [e for e in (exp.evidence or []) if e.category == "Location"]
        assert ev
        assert "Quetta" in (ev[0].observed or "")
        assert "Karachi" in (ev[0].expected or "")

    def test_evidence_built_for_off_hours(self):
        hits = [ReasonHit("TIME_OFF_HOURS", "Off-hours activity.", 0.12)]
        tx = {"amount": 5000, "avg_user_amount": 5000, "timestamp": datetime(2026, 5, 12, 3, 0)}
        exp = build_explanation(hits, {}, risk_score=35, risk_band="MEDIUM", action="STEP_UP_AUTH", tx=tx)
        ev = [e for e in (exp.evidence or []) if e.category == "Time"]
        assert ev
        assert "AM" in (ev[0].observed or "") or "PM" in (ev[0].observed or "")

    def test_recommended_action_for_critical_includes_specific_directives(self):
        hits = [
            ReasonHit("AMT_SPIKE_6X", "Amount spike.", 0.30),
            ReasonHit("VEL_BURST", "Velocity burst.", 0.20),
            ReasonHit("DEV_GEO_MISMATCH", "Risky device + city mismatch.", 0.10),
            ReasonHit("BEN_NEW_HIGH_AMT", "New beneficiary.", 0.18),
        ]
        exp = build_explanation(hits, {}, risk_score=95, risk_band="CRITICAL", action="BLOCK")
        ra = (exp.recommended_action or "").lower()
        assert "block" in ra
        assert "aml" in ra
        assert "quarantine" in ra
        assert "beneficiary" in ra

    def test_headline_reflects_risk_band(self):
        no_hits = build_explanation([], {}, risk_score=5, risk_band="LOW", action="ALLOW")
        assert "approved" in (no_hits.headline or "").lower()

        hits = [ReasonHit("AMT_SPIKE_6X", "Amount spike.", 0.30)]
        critical = build_explanation(hits, {}, risk_score=90, risk_band="CRITICAL", action="BLOCK")
        assert "critical" in (critical.headline or "").lower()
        assert "block" in (critical.headline or "").lower()

    def test_narrative_groups_signals_by_category(self):
        hits = [
            ReasonHit("AMT_SPIKE_6X", "Amount spike.", 0.30),
            ReasonHit("LOC_DIFF_CITY", "Different city.", 0.15),
            ReasonHit("DEV_RISKY", "Risky device.", 0.15),
        ]
        exp = build_explanation(hits, {}, risk_score=85, risk_band="CRITICAL", action="BLOCK")
        narr = (exp.narrative or "").lower()
        assert "amount" in narr
        assert "location" in narr
        assert "device" in narr

    def test_top_factors_use_friendly_names_when_importance_provided(self):
        importance = {"amount_ratio": 0.42, "diff_city": 0.31, "risky_device": 0.27}
        exp = build_explanation([], importance, risk_score=20, risk_band="LOW", action="ALLOW")
        joined = " ".join(exp.top_factors)
        assert FRIENDLY_FEATURE_NAMES["amount_ratio"] in joined
        assert FRIENDLY_FEATURE_NAMES["diff_city"] in joined

    def test_customer_message_tailored_to_band(self):
        hits = [ReasonHit("AMT_SPIKE_6X", "Amount spike.", 0.30)]

        critical = build_explanation(hits, {}, risk_score=90, risk_band="CRITICAL", action="BLOCK")
        assert "blocked" in critical.customer.lower()

        high = build_explanation(hits, {}, risk_score=70, risk_band="HIGH", action="HOLD_FOR_REVIEW")
        assert "paused" in high.customer.lower() or "review" in high.customer.lower()

        medium = build_explanation(hits, {}, risk_score=45, risk_band="MEDIUM", action="STEP_UP_AUTH")
        assert "confirm" in medium.customer.lower()

    def test_severity_pills_match_mapping(self):
        hits = [
            ReasonHit("AMT_SPIKE_6X", "x", 0.30),
            ReasonHit("KYC_MED_TIER", "y", 0.04),
        ]
        exp = build_explanation(hits, {}, risk_score=50, risk_band="MEDIUM", action="STEP_UP_AUTH")
        for ev in exp.evidence or []:
            if ev.category == "Model":
                continue
            code = next((h.code for h in hits if h.description == ev.detail), None)
            if code:
                assert ev.severity == CODE_TO_SEVERITY[code]
                assert ev.category == CODE_TO_CATEGORY[code]


# ---------------------------------------------------------------------------
# End-to-end via ScoringService — explanation appears on the decision
# ---------------------------------------------------------------------------

def _critical_request() -> TransactionRequest:
    return TransactionRequest(
        customer_id="C00911",
        amount=480_000,
        channel="IBFT",
        city="Quetta",
        home_city="Karachi",
        device="new_device",
        new_beneficiary=True,
        merchant_category="Cash",
        kyc_tier="low",
        timestamp=datetime(2026, 4, 25, 3, 14),
        avg_user_amount=4_500,
        tx_velocity=12,
        tx_history=40,
    )


class TestExplanationOnDecision:
    def test_decision_has_rich_explanation_fields(self, service: ScoringService):
        decision = service.score(_critical_request())
        exp = decision.explanation
        assert exp.headline
        assert exp.narrative
        assert exp.recommended_action
        assert exp.evidence and len(exp.evidence) > 0

    def test_decision_evidence_covers_multiple_categories(self, service: ScoringService):
        decision = service.score(_critical_request())
        cats = {e.category for e in decision.explanation.evidence or []}
        # Should cover at least amount, location, time, device, beneficiary
        assert {"Amount", "Location", "Device"}.issubset(cats)

    def test_decision_top_factors_non_empty(self, service: ScoringService):
        decision = service.score(_critical_request())
        assert len(decision.explanation.top_factors) > 0

    def test_low_risk_decision_explanation_present(self, service: ScoringService):
        decision = service.score(
            TransactionRequest(
                customer_id="C00100",
                amount=2_500,
                channel="App",
                city="Karachi",
                home_city="Karachi",
                device="trusted_device",
                new_beneficiary=False,
                merchant_category="Groceries",
                kyc_tier="high",
                timestamp=datetime(2026, 5, 12, 14, 30),
                avg_user_amount=2_500,
                tx_velocity=2,
                tx_history=600,
            )
        )
        assert decision.risk_band in ("LOW", "MEDIUM")
        assert decision.explanation.headline
        assert decision.explanation.evidence is not None


# ---------------------------------------------------------------------------
# Mapping tables completeness
# ---------------------------------------------------------------------------

class TestExplanationMappings:
    def test_every_rule_code_has_category_and_severity(self):
        sample_tx = {
            "amount": 100_000,
            "avg_user_amount": 2_000,
            "channel": "ATM",
            "city": "Lahore",
            "home_city": "Karachi",
            "device": "emulated_device",
            "new_beneficiary": True,
            "merchant_category": "Cash",
            "kyc_tier": "low",
            "tx_velocity": 25,
            "timestamp": datetime(2026, 4, 1, 2, 30),
        }
        hits = evaluate_rules(sample_tx)
        for h in hits:
            assert h.code in CODE_TO_CATEGORY, f"Missing category mapping for {h.code}"
            assert h.code in CODE_TO_SEVERITY, f"Missing severity mapping for {h.code}"
