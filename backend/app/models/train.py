"""Train the hybrid anomaly model from the synthetic dataset."""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from ..pipeline.features import build_training_frame
from .anomaly_model import HybridScorer


DEFAULT_CSV = Path(__file__).resolve().parents[3] / "scriptdata" / "data" / "raw" / "synthetic_fintech_transactions.csv"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=str, default=str(DEFAULT_CSV))
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"Dataset not found at {csv_path}")

    print(f"[train] reading {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"[train] rows: {len(df)} | columns: {list(df.columns)}")

    X, y = build_training_frame(df)
    print(f"[train] features: {X.shape}, label balance: {y.value_counts().to_dict() if y is not None else 'NA'}")

    scorer = HybridScorer()
    meta = scorer.fit(X, y)
    print(f"[train] saved artifacts. meta: {meta}")


if __name__ == "__main__":
    main()
