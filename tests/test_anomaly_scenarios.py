"""Scenario tests covering the 5 anomaly subtypes injected by the data generator.

Each scenario sends a transaction representative of one anomaly family
through the full ScoringService pipeline (features -> ML -> rules -> fusion -> action)
and asserts that the model + rules detect it with the expected band/codes.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from backend.app.schemas.transaction import TransactionRequest
from backend.app.services.scoring_service import ScoringService


def _request(**overrides) -> TransactionRequest:
    base = {
        "customer_id": "C00001",
        "amount": 2500.0,
        "channel": "App",
        "city": "Karachi",
        "home_city": "Karachi",
        "device": "trusted_device",
        "new_beneficiary": False,
        "merchant_category": "Groceries",
        "kyc_tier": "high",
        "timestamp": datetime(2026, 5, 12, 14, 30),
        "avg_user_amount": 2500.0,
        "tx_velocity": 2,
        "tx_history": 600,
    }
    base.update(overrides)
    return TransactionRequest(**base)


# ---------------------------------------------------------------------------
# Baseline — clean transaction must NOT be flagged
# ---------------------------------------------------------------------------

class TestNormalTransaction:
    def test_clean_transaction_low_or_medium_band(self, service: ScoringService):
        """Clean transactions should land in LOW or MEDIUM (never HIGH/CRITICAL)."""
        decision = service.score(_request())
        assert decision.risk_band in ("LOW", "MEDIUM")
        assert decision.action in ("ALLOW", "STEP_UP_AUTH")

    def test_clean_transaction_no_critical_codes(self, service: ScoringService):
        decision = service.score(_request())
        codes = {r.code for r in decision.reason_codes}
        assert "AMT_SPIKE_6X" not in codes
        assert "VEL_BURST" not in codes
        assert "DEV_RISKY" not in codes


# ---------------------------------------------------------------------------
# Anomaly subtype 1 — AMOUNT SPIKE
# ---------------------------------------------------------------------------

class TestAmountSpikeAnomaly:
    def test_6x_amount_spike_triggers_critical_rule(self, service: ScoringService):
        decision = service.score(_request(amount=20_000.0, avg_user_amount=2_500.0))
        codes = {r.code for r in decision.reason_codes}
        assert "AMT_SPIKE_6X" in codes
        assert decision.risk_band in ("HIGH", "CRITICAL")

    def test_3x_amount_spike_triggers_medium_rule(self, service: ScoringService):
        decision = service.score(_request(amount=8_000.0, avg_user_amount=2_500.0))
        codes = {r.code for r in decision.reason_codes}
        assert "AMT_SPIKE_3X" in codes
        assert decision.risk_score >= 30.0

    def test_extreme_amount_spike_high_or_critical(self, service: ScoringService):
        decision = service.score(_request(amount=500_000.0, avg_user_amount=2_500.0))
        assert decision.risk_band in ("HIGH", "CRITICAL")
        assert decision.action in ("HOLD_FOR_REVIEW", "BLOCK")


# ---------------------------------------------------------------------------
# Anomaly subtype 2 — LOCATION ANOMALY (no amount spike)
# ---------------------------------------------------------------------------

class TestLocationAnomaly:
    def test_different_city_triggers_loc_rule(self, service: ScoringService):
        decision = service.score(_request(city="Quetta", home_city="Karachi"))
        codes = {r.code for r in decision.reason_codes}
        assert "LOC_DIFF_CITY" in codes

    def test_location_anomaly_with_new_device_amplifies(self, service: ScoringService):
        decision = service.score(
            _request(city="Quetta", home_city="Karachi", device="new_device")
        )
        codes = {r.code for r in decision.reason_codes}
        assert "DEV_GEO_MISMATCH" in codes
        assert decision.risk_score >= 30.0

    def test_normal_amount_diff_city_still_detected(self, service: ScoringService):
        """Even at the customer's normal amount, a foreign city should be flagged."""
        decision = service.score(_request(amount=2_500.0, city="Peshawar", home_city="Karachi"))
        codes = {r.code for r in decision.reason_codes}
        assert "LOC_DIFF_CITY" in codes


# ---------------------------------------------------------------------------
# Anomaly subtype 3 — VELOCITY BURST
# ---------------------------------------------------------------------------

class TestVelocityBurstAnomaly:
    def test_high_velocity_triggers_burst_rule(self, service: ScoringService):
        decision = service.score(_request(tx_velocity=25))
        codes = {r.code for r in decision.reason_codes}
        assert "VEL_BURST" in codes
        assert decision.risk_score >= 20.0

    def test_elevated_velocity_triggers_lighter_rule(self, service: ScoringService):
        decision = service.score(_request(tx_velocity=10))
        codes = {r.code for r in decision.reason_codes}
        assert "VEL_ELEVATED" in codes

    def test_velocity_burst_with_amount_spike_high_or_critical(self, service: ScoringService):
        decision = service.score(
            _request(amount=30_000.0, avg_user_amount=2_500.0, tx_velocity=28)
        )
        assert decision.risk_band in ("HIGH", "CRITICAL")
        assert decision.action in ("HOLD_FOR_REVIEW", "BLOCK")


# ---------------------------------------------------------------------------
# Anomaly subtype 4 — CHANNEL / DEVICE ANOMALY
# ---------------------------------------------------------------------------

class TestChannelDeviceAnomaly:
    def test_emulated_device_triggers_dev_risky(self, service: ScoringService):
        decision = service.score(_request(device="emulated_device"))
        codes = {r.code for r in decision.reason_codes}
        assert "DEV_RISKY" in codes

    def test_new_device_triggers_dev_risky(self, service: ScoringService):
        decision = service.score(_request(device="new_device"))
        codes = {r.code for r in decision.reason_codes}
        assert "DEV_RISKY" in codes

    def test_atm_channel_triggers_chn_risky(self, service: ScoringService):
        decision = service.score(_request(channel="ATM", merchant_category="Cash"))
        codes = {r.code for r in decision.reason_codes}
        assert "CHN_RISKY" in codes

    def test_atm_at_night_triggers_atm_night(self, service: ScoringService):
        decision = service.score(
            _request(
                channel="ATM",
                merchant_category="Cash",
                timestamp=datetime(2026, 5, 12, 3, 15),
            )
        )
        codes = {r.code for r in decision.reason_codes}
        assert "ATM_NIGHT" in codes
        assert "TIME_OFF_HOURS" in codes


# ---------------------------------------------------------------------------
# Anomaly subtype 5 — BEHAVIORAL DRIFT (subtle multi-feature shift)
# ---------------------------------------------------------------------------

class TestBehavioralDriftAnomaly:
    def test_subtle_drift_multi_feature(self, service: ScoringService):
        """Slight off-hours + new device + KYC low + new beneficiary — no single
        feature is extreme but ML should pick up the joint signal."""
        decision = service.score(
            _request(
                amount=4_500.0,
                avg_user_amount=2_500.0,
                device="new_device",
                new_beneficiary=True,
                kyc_tier="low",
                timestamp=datetime(2026, 5, 12, 23, 30),
                tx_history=20,
            )
        )
        codes = {r.code for r in decision.reason_codes}
        assert "DEV_RISKY" in codes
        assert "KYC_LOW_TIER" in codes
        assert decision.risk_score >= 30.0

    def test_low_kyc_amplifies_baseline_risk(self, service: ScoringService):
        decision = service.score(_request(kyc_tier="low"))
        codes = {r.code for r in decision.reason_codes}
        assert "KYC_LOW_TIER" in codes


# ---------------------------------------------------------------------------
# Beneficiary anomaly (a sub-pattern in many real-world frauds)
# ---------------------------------------------------------------------------

class TestBeneficiaryAnomaly:
    def test_new_beneficiary_high_amount_triggers_rule(self, service: ScoringService):
        decision = service.score(
            _request(amount=15_000.0, avg_user_amount=2_500.0, new_beneficiary=True)
        )
        codes = {r.code for r in decision.reason_codes}
        assert "BEN_NEW_HIGH_AMT" in codes


# ---------------------------------------------------------------------------
# Holiday / off-hours context
# ---------------------------------------------------------------------------

class TestContextualFactors:
    def test_pakistan_holiday_recognised(self, service: ScoringService):
        """Aug 14 is Pakistan Independence Day."""
        decision = service.score(
            _request(timestamp=datetime(2026, 8, 14, 14, 0))
        )
        codes = {r.code for r in decision.reason_codes}
        assert "CTX_HOLIDAY" in codes

    def test_off_hours_3am_triggers_time_rule(self, service: ScoringService):
        decision = service.score(_request(timestamp=datetime(2026, 5, 12, 3, 0)))
        codes = {r.code for r in decision.reason_codes}
        assert "TIME_OFF_HOURS" in codes


# ---------------------------------------------------------------------------
# Decision banding sanity checks
# ---------------------------------------------------------------------------

class TestDecisionBanding:
    def test_band_score_action_consistent(self, service: ScoringService):
        decision = service.score(_request(amount=400_000.0, avg_user_amount=3_000.0))
        score = decision.risk_score
        if score >= 80:
            assert decision.risk_band == "CRITICAL" and decision.action == "BLOCK"
        elif score >= 60:
            assert decision.risk_band == "HIGH" and decision.action == "HOLD_FOR_REVIEW"
        elif score >= 30:
            assert decision.risk_band == "MEDIUM" and decision.action == "STEP_UP_AUTH"
        else:
            assert decision.risk_band == "LOW" and decision.action == "ALLOW"

    def test_critical_decision_has_compliance_flags(self, service: ScoringService):
        decision = service.score(
            _request(
                amount=300_000.0,
                avg_user_amount=2_500.0,
                tx_velocity=25,
                device="emulated_device",
                kyc_tier="low",
            )
        )
        assert decision.risk_band == "CRITICAL"
        assert decision.compliance.get("aml_review_required") is True
        assert decision.compliance.get("sbp_risk_monitoring_flag") is True


# ---------------------------------------------------------------------------
# Parameterised matrix — quick combinatorial sanity sweep
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "channel,device,expected_dev_risky",
    [
        ("App", "trusted_device", False),
        ("App", "new_device", True),
        ("ATM", "trusted_device", False),
        ("ATM", "emulated_device", True),
    ],
)
def test_device_risky_flag_matrix(
    service: ScoringService, channel: str, device: str, expected_dev_risky: bool
):
    decision = service.score(_request(channel=channel, device=device))
    codes = {r.code for r in decision.reason_codes}
    assert ("DEV_RISKY" in codes) is expected_dev_risky
