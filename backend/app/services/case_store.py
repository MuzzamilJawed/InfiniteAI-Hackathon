"""In-memory case + audit log store for the hackathon demo.

Persists fraud cases, customer confirmations, and a recent decisions log
so that the analyst dashboard and customer flows share a single source.
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime
from typing import Optional

from ..schemas.transaction import CaseRecord, TransactionDecision


class CaseStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._decisions: list[TransactionDecision] = []
        self._cases: dict[str, CaseRecord] = {}
        self._customer_history: dict[str, list[TransactionDecision]] = {}

    def add_decision(self, decision: TransactionDecision) -> None:
        with self._lock:
            self._decisions.insert(0, decision)
            self._decisions = self._decisions[:500]
            self._customer_history.setdefault(decision.customer_id, []).insert(0, decision)
            self._customer_history[decision.customer_id] = self._customer_history[decision.customer_id][:50]

    def open_case(self, decision: TransactionDecision, notes: Optional[str] = None) -> CaseRecord:
        case_id = f"CASE-{uuid.uuid4().hex[:8].upper()}"
        record = CaseRecord(
            case_id=case_id,
            transaction_id=decision.transaction_id,
            customer_id=decision.customer_id,
            risk_band=decision.risk_band,
            action=decision.action,
            risk_score=decision.risk_score,
            created_at=datetime.utcnow(),
            status="OPEN",
            notes=notes,
        )
        with self._lock:
            self._cases[case_id] = record
        return record

    def update_case(self, case_id: str, status: str, notes: Optional[str] = None) -> Optional[CaseRecord]:
        with self._lock:
            case = self._cases.get(case_id)
            if not case:
                return None
            case = case.model_copy(update={"status": status, "notes": notes or case.notes})
            self._cases[case_id] = case
            return case

    def list_recent_decisions(self, limit: int = 100) -> list[TransactionDecision]:
        with self._lock:
            return list(self._decisions[:limit])

    def list_cases(self) -> list[CaseRecord]:
        with self._lock:
            return list(self._cases.values())

    def customer_baseline(self, customer_id: str) -> dict:
        with self._lock:
            history = self._customer_history.get(customer_id, [])
        if not history:
            return {}
        amounts = [d.feature_snapshot.get("amount", 0) for d in history if d.feature_snapshot]
        velocities = [d.feature_snapshot.get("tx_velocity", 0) for d in history if d.feature_snapshot]
        avg_amount = sum(amounts) / len(amounts) if amounts else None
        avg_velocity = sum(velocities) / len(velocities) if velocities else None
        return {
            "avg_user_amount": avg_amount,
            "tx_velocity": avg_velocity,
            "tx_history": len(history),
        }


CASE_STORE = CaseStore()
