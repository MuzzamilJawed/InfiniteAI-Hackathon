"""Pydantic schemas for transaction scoring API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


PakistaniCity = Literal[
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

Channel = Literal[
    "IBFT",
    "Raast",
    "1LINK",
    "JazzCash",
    "Easypaisa",
    "POS",
    "ATM",
    "App",
    "Card",
]

DeviceType = Literal["trusted_device", "new_device", "emulated_device"]
KycTier = Literal["low", "medium", "high"]
RiskBand = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
Action = Literal["ALLOW", "STEP_UP_AUTH", "HOLD_FOR_REVIEW", "BLOCK"]

MerchantCategory = Literal[
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


class TransactionRequest(BaseModel):
    """Inbound transaction submitted for scoring."""

    customer_id: str = Field(..., examples=["C00123"])
    amount: float = Field(..., gt=0, description="Transaction amount in PKR")
    channel: Channel
    city: PakistaniCity
    home_city: PakistaniCity
    device: DeviceType = "trusted_device"
    new_beneficiary: bool = False
    merchant_category: MerchantCategory = "Others"
    kyc_tier: KycTier = "medium"
    timestamp: Optional[datetime] = None
    avg_user_amount: Optional[float] = Field(None, gt=0)
    tx_velocity: Optional[int] = Field(None, ge=0)
    tx_history: Optional[int] = Field(None, ge=0)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "customer_id": "C00123",
                    "amount": 4200.0,
                    "channel": "IBFT",
                    "city": "Karachi",
                    "home_city": "Karachi",
                    "device": "trusted_device",
                    "new_beneficiary": False,
                    "merchant_category": "Groceries",
                    "kyc_tier": "medium",
                }
            ]
        }
    }


class ReasonCode(BaseModel):
    code: str
    description: str
    weight: float


EvidenceCategory = Literal[
    "Amount",
    "Time",
    "Location",
    "Device",
    "Channel",
    "Velocity",
    "Beneficiary",
    "Compliance",
    "Behavior",
    "Model",
]
Severity = Literal["info", "low", "medium", "high", "critical"]


class Evidence(BaseModel):
    category: EvidenceCategory
    severity: Severity
    title: str
    detail: str
    observed: Optional[str] = None
    expected: Optional[str] = None


class Explanation(BaseModel):
    analyst: str
    customer: str
    top_factors: list[str]
    headline: Optional[str] = None
    narrative: Optional[str] = None
    recommended_action: Optional[str] = None
    evidence: list[Evidence] = []


class TransactionDecision(BaseModel):
    transaction_id: str
    customer_id: str
    timestamp: datetime
    anomaly_score: float = Field(..., ge=0, le=100)
    fraud_score: float = Field(..., ge=0, le=100)
    risk_score: float = Field(..., ge=0, le=100)
    risk_band: RiskBand
    action: Action
    reason_codes: list[ReasonCode]
    explanation: Explanation
    feature_snapshot: dict
    compliance: dict


class ConfirmationRequest(BaseModel):
    transaction_id: str
    customer_id: str
    confirmed: bool


class ConfirmationResponse(BaseModel):
    transaction_id: str
    status: Literal["CONFIRMED", "DISPUTED", "ESCALATED"]
    message: str
    case_id: Optional[str] = None


class CaseRecord(BaseModel):
    case_id: str
    transaction_id: str
    customer_id: str
    risk_band: RiskBand
    action: Action
    risk_score: float
    created_at: datetime
    status: Literal["OPEN", "RESOLVED", "DISPUTED"]
    notes: Optional[str] = None
