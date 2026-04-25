"""Hybrid anomaly + fraud risk model.

- Supervised: GradientBoostingClassifier trained on `is_anomaly` labels.
- Unsupervised: IsolationForest for anomaly score (fallback when labels absent).
- Both produce calibrated 0-100 scores.
"""
from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest

from ..pipeline.features import FEATURE_COLUMNS


ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"
SUPERVISED_PATH = ARTIFACT_DIR / "supervised_model.pkl"
UNSUPERVISED_PATH = ARTIFACT_DIR / "isolation_forest.pkl"
META_PATH = ARTIFACT_DIR / "model_meta.json"


@dataclass
class ScoringResult:
    anomaly_score: float
    fraud_score: float
    feature_importance: dict[str, float]


class HybridScorer:
    """Loads (or trains) supervised + unsupervised models and produces 0-100 scores."""

    def __init__(self) -> None:
        self.supervised: Optional[GradientBoostingClassifier] = None
        self.iforest: Optional[IsolationForest] = None
        self.meta: dict = {}
        self.feature_columns: list[str] = list(FEATURE_COLUMNS)
        self._iforest_min: float = -0.5
        self._iforest_max: float = 0.5

    def is_ready(self) -> bool:
        return self.iforest is not None

    def load(self) -> bool:
        try:
            if SUPERVISED_PATH.exists():
                with SUPERVISED_PATH.open("rb") as fh:
                    self.supervised = pickle.load(fh)
            if UNSUPERVISED_PATH.exists():
                with UNSUPERVISED_PATH.open("rb") as fh:
                    self.iforest = pickle.load(fh)
            if META_PATH.exists():
                self.meta = json.loads(META_PATH.read_text(encoding="utf-8"))
                self.feature_columns = self.meta.get("feature_columns", self.feature_columns)
                self._iforest_min = float(self.meta.get("iforest_min", -0.5))
                self._iforest_max = float(self.meta.get("iforest_max", 0.5))
        except Exception as e:
            print(f"[HybridScorer] load failed: {e}")
            return False
        return self.is_ready()

    def fit(self, X: pd.DataFrame, y: Optional[pd.Series]) -> dict:
        X = X.loc[:, FEATURE_COLUMNS].astype(float)
        self.iforest = IsolationForest(
            n_estimators=200,
            contamination=0.08,
            random_state=42,
            n_jobs=-1,
        )
        self.iforest.fit(X)

        scores = self.iforest.decision_function(X)
        self._iforest_min = float(np.min(scores))
        self._iforest_max = float(np.max(scores))

        if y is not None and y.nunique() > 1:
            self.supervised = GradientBoostingClassifier(
                n_estimators=200,
                max_depth=3,
                learning_rate=0.08,
                random_state=42,
            )
            self.supervised.fit(X, y)

        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        with UNSUPERVISED_PATH.open("wb") as fh:
            pickle.dump(self.iforest, fh)
        if self.supervised is not None:
            with SUPERVISED_PATH.open("wb") as fh:
                pickle.dump(self.supervised, fh)

        self.meta = {
            "feature_columns": list(FEATURE_COLUMNS),
            "iforest_min": self._iforest_min,
            "iforest_max": self._iforest_max,
            "trained_rows": int(len(X)),
            "supervised": self.supervised is not None,
        }
        META_PATH.write_text(json.dumps(self.meta, indent=2), encoding="utf-8")
        return self.meta

    def score(self, X: pd.DataFrame) -> ScoringResult:
        if not self.is_ready():
            raise RuntimeError("Models not loaded. Train or load artifacts first.")

        X = X.loc[:, FEATURE_COLUMNS].astype(float)
        raw = float(self.iforest.decision_function(X)[0])
        if self._iforest_max > self._iforest_min:
            normalized = (self._iforest_max - raw) / (self._iforest_max - self._iforest_min)
        else:
            normalized = 0.5
        anomaly_score = float(np.clip(normalized, 0.0, 1.0) * 100.0)

        if self.supervised is not None:
            prob = float(self.supervised.predict_proba(X)[0, 1])
            fraud_score = float(np.clip(prob, 0.0, 1.0) * 100.0)
        else:
            fraud_score = anomaly_score

        importance: dict[str, float] = {}
        if self.supervised is not None and hasattr(self.supervised, "feature_importances_"):
            row = X.iloc[0].to_dict()
            for col, imp in zip(FEATURE_COLUMNS, self.supervised.feature_importances_):
                value = row.get(col, 0.0)
                importance[col] = float(imp * (abs(value) + 0.1))

        return ScoringResult(
            anomaly_score=round(anomaly_score, 2),
            fraud_score=round(fraud_score, 2),
            feature_importance=importance,
        )
