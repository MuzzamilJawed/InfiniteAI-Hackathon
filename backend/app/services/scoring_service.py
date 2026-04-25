"""Score fusion, banding, and decision mapping."""
from __future__ import annotations

import uuid
from datetime import datetime

from ..models.anomaly_model import HybridScorer
from ..pipeline.features import build_inference_features
from ..rules.risk_rules import compliance_metadata, evaluate_rules, rules_score
from ..schemas.transaction import Action, RiskBand, TransactionDecision, TransactionRequest
from .case_store import CASE_STORE
from .explanations import build_explanation, hits_to_reason_codes


WEIGHT_ML = 0.55
WEIGHT_RULES = 0.45


def _band_for(score: float) -> RiskBand:
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


def _action_for(band: RiskBand) -> Action:
    return {
        "LOW": "ALLOW",
        "MEDIUM": "STEP_UP_AUTH",
        "HIGH": "HOLD_FOR_REVIEW",
        "CRITICAL": "BLOCK",
    }[band]


class ScoringService:
    def __init__(self, scorer: HybridScorer) -> None:
        self.scorer = scorer

    def score(self, request: TransactionRequest) -> TransactionDecision:
        tx = request.model_dump()
        if not tx.get("timestamp"):
            tx["timestamp"] = datetime.utcnow()

        baseline = CASE_STORE.customer_baseline(request.customer_id)
        feature_frame = build_inference_features(tx, baseline)
        ml_result = self.scorer.score(feature_frame)

        hits = evaluate_rules(tx, baseline)
        r_score = rules_score(hits)

        risk_score = float(ml_result.fraud_score * WEIGHT_ML + r_score * WEIGHT_RULES)
        risk_score = max(risk_score, ml_result.anomaly_score * 0.6)
        risk_score = min(100.0, risk_score)

        band = _band_for(risk_score)
        action = _action_for(band)

        explanation = build_explanation(
            hits=hits,
            feature_importance=ml_result.feature_importance,
            risk_score=risk_score,
            risk_band=band,
        )
        compliance = compliance_metadata(tx, hits)

        decision = TransactionDecision(
            transaction_id=f"TX-{uuid.uuid4().hex[:10].upper()}",
            customer_id=request.customer_id,
            timestamp=tx["timestamp"],
            anomaly_score=round(ml_result.anomaly_score, 2),
            fraud_score=round(ml_result.fraud_score, 2),
            risk_score=round(risk_score, 2),
            risk_band=band,
            action=action,
            reason_codes=hits_to_reason_codes(hits),
            explanation=explanation,
            feature_snapshot=feature_frame.iloc[0].to_dict(),
            compliance=compliance,
        )

        CASE_STORE.add_decision(decision)
        if action in ("HOLD_FOR_REVIEW", "BLOCK"):
            CASE_STORE.open_case(decision)

        return decision
