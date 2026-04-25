"""FastAPI entry point for the Smart Transaction Anomaly Detector."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models.anomaly_model import HybridScorer
from .pipeline.features import build_training_frame
from .schemas.transaction import (
    CaseRecord,
    ConfirmationRequest,
    ConfirmationResponse,
    TransactionDecision,
    TransactionRequest,
)
from .services.case_store import CASE_STORE
from .services.scoring_service import ScoringService


SCORER = HybridScorer()
SERVICE: ScoringService | None = None

DATA_CSV = Path(__file__).resolve().parents[2] / "scriptdata" / "data" / "raw" / "synthetic_fintech_transactions.csv"


def _bootstrap_scorer() -> None:
    """Load saved artifacts; if missing, train from the synthetic dataset."""
    global SERVICE
    if SCORER.load():
        print("[startup] loaded model artifacts")
    else:
        print("[startup] artifacts missing, training from synthetic dataset")
        if not DATA_CSV.exists():
            raise RuntimeError(f"Dataset not found: {DATA_CSV}")
        df = pd.read_csv(DATA_CSV)
        X, y = build_training_frame(df)
        SCORER.fit(X, y)
        print("[startup] training complete")
    SERVICE = ScoringService(SCORER)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _bootstrap_scorer()
    yield


app = FastAPI(
    title="Smart Transaction Anomaly Detector",
    description="Pakistan-compliant hybrid (ML + rules) fraud and anomaly detection API.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _service() -> ScoringService:
    if SERVICE is None:
        raise HTTPException(status_code=503, detail="Scoring service not ready")
    return SERVICE


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "smart-transaction-anomaly-detector",
        "model_ready": SCORER.is_ready(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/score-transaction", response_model=TransactionDecision)
def score_transaction(request: TransactionRequest) -> TransactionDecision:
    return _service().score(request)


@app.post("/confirm-transaction", response_model=ConfirmationResponse)
def confirm_transaction(payload: ConfirmationRequest) -> ConfirmationResponse:
    if payload.confirmed:
        return ConfirmationResponse(
            transaction_id=payload.transaction_id,
            status="CONFIRMED",
            message="Thank you for confirming. We will keep monitoring future activity.",
        )
    decision = next(
        (d for d in CASE_STORE.list_recent_decisions(500) if d.transaction_id == payload.transaction_id),
        None,
    )
    if decision is None:
        raise HTTPException(status_code=404, detail="Transaction decision not found")
    case = CASE_STORE.open_case(decision, notes="Customer disputed via Was-this-you flow.")
    return ConfirmationResponse(
        transaction_id=payload.transaction_id,
        status="DISPUTED",
        message="Thanks for letting us know. We have escalated this for fraud review.",
        case_id=case.case_id,
    )


@app.post("/dispute-transaction", response_model=ConfirmationResponse)
def dispute_transaction(payload: ConfirmationRequest) -> ConfirmationResponse:
    payload = payload.model_copy(update={"confirmed": False})
    return confirm_transaction(payload)


@app.get("/recent-decisions", response_model=list[TransactionDecision])
def recent_decisions(limit: int = 100) -> list[TransactionDecision]:
    return CASE_STORE.list_recent_decisions(limit=limit)


@app.get("/cases", response_model=list[CaseRecord])
def list_cases() -> list[CaseRecord]:
    return CASE_STORE.list_cases()


@app.get("/")
def root() -> dict:
    return {
        "name": "Smart Transaction Anomaly Detector",
        "endpoints": [
            "GET /health",
            "POST /score-transaction",
            "POST /confirm-transaction",
            "POST /dispute-transaction",
            "GET /recent-decisions",
            "GET /cases",
        ],
    }
