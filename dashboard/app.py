"""Streamlit analyst dashboard for the Smart Transaction Anomaly Detector.

Reads recent decisions and cases from the running FastAPI backend
(http://localhost:8000) and renders a balanced business + AI + compliance view.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import httpx
import pandas as pd
import plotly.express as px
import streamlit as st


API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000")


st.set_page_config(
    page_title="SafeBank PK | Fraud Ops Dashboard",
    page_icon="🛡",
    layout="wide",
)


def _get(path: str) -> Any:
    try:
        with httpx.Client(timeout=4.0) as client:
            r = client.get(f"{API_BASE}{path}")
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        st.error(f"Failed to call {path}: {exc}")
        return None


@st.cache_data(ttl=4)
def load_decisions() -> pd.DataFrame:
    data = _get("/recent-decisions?limit=200") or []
    if not data:
        return pd.DataFrame()
    rows = []
    for d in data:
        rows.append(
            {
                "transaction_id": d["transaction_id"],
                "customer_id": d["customer_id"],
                "timestamp": d["timestamp"],
                "risk_score": d["risk_score"],
                "anomaly_score": d["anomaly_score"],
                "fraud_score": d["fraud_score"],
                "risk_band": d["risk_band"],
                "action": d["action"],
                "reason_codes": [r["code"] for r in d["reason_codes"]],
                "customer_message": d["explanation"]["customer"],
                "analyst_message": d["explanation"]["analyst"],
                "kyc_tier": d["compliance"].get("kyc_tier"),
                "channel": d["compliance"].get("channel"),
                "city": d["compliance"].get("city"),
                "home_city": d["compliance"].get("home_city"),
                "aml_required": d["compliance"].get("aml_review_required"),
                "sbp_flag": d["compliance"].get("sbp_risk_monitoring_flag"),
            }
        )
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


@st.cache_data(ttl=4)
def load_cases() -> pd.DataFrame:
    data = _get("/cases") or []
    return pd.DataFrame(data)


def header() -> None:
    col_logo, col_title, col_actions = st.columns([1, 4, 2])
    with col_logo:
        st.markdown(
            "<div style='font-size: 36px; line-height: 1'>🛡</div>",
            unsafe_allow_html=True,
        )
    with col_title:
        st.markdown("### SafeBank PK · Fraud Ops Dashboard")
        st.caption(
            "Hybrid (ML + Rules) anomaly detection · SBP-aligned · Customer trust first"
        )
    with col_actions:
        if st.button("Refresh", type="primary"):
            st.cache_data.clear()
            st.rerun()


def kpi_block(df: pd.DataFrame) -> None:
    if df.empty:
        st.info("No transactions scored yet. Use the customer app to generate activity.")
        return
    total = len(df)
    blocked = (df["action"] == "BLOCK").sum()
    held = (df["action"] == "HOLD_FOR_REVIEW").sum()
    step_up = (df["action"] == "STEP_UP_AUTH").sum()
    allowed = (df["action"] == "ALLOW").sum()

    fraud_loss_prevented = df.loc[
        df["action"].isin(["BLOCK", "HOLD_FOR_REVIEW"]), "risk_score"
    ].sum() * 100
    aml_required = df["aml_required"].fillna(False).astype(bool).sum()
    avg_risk = df["risk_score"].mean()

    cols = st.columns(6)
    cols[0].metric("Transactions", f"{total:,}")
    cols[1].metric("Allowed", f"{allowed:,}")
    cols[2].metric("Step-up", f"{step_up:,}")
    cols[3].metric("Held / Blocked", f"{held + blocked:,}")
    cols[4].metric("AML reviews", f"{aml_required:,}")
    cols[5].metric("Avg risk", f"{avg_risk:.1f}")

    cols2 = st.columns(3)
    cols2[0].metric(
        "Fraud loss prevented (proxy)",
        f"PKR {int(fraud_loss_prevented):,}",
    )
    cols2[1].metric(
        "False decline proxy", f"{(step_up / total * 100 if total else 0):.1f}%"
    )
    cols2[2].metric(
        "Critical share", f"{(blocked / total * 100 if total else 0):.1f}%"
    )


def charts(df: pd.DataFrame) -> None:
    if df.empty:
        return
    left, right = st.columns(2)
    with left:
        st.markdown("##### Risk band distribution")
        band_df = (
            df["risk_band"].value_counts().rename_axis("band").reset_index(name="count")
        )
        order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        band_df["band"] = pd.Categorical(band_df["band"], order)
        band_df = band_df.sort_values("band")
        fig = px.bar(
            band_df,
            x="band",
            y="count",
            color="band",
            color_discrete_map={
                "LOW": "#1ec27a",
                "MEDIUM": "#f59e0b",
                "HIGH": "#f97316",
                "CRITICAL": "#dc2626",
            },
        )
        fig.update_layout(showlegend=False, height=300, margin=dict(t=10, b=0))
        st.plotly_chart(fig, use_container_width=True)

    with right:
        st.markdown("##### Channel mix · last 200 decisions")
        chan_df = (
            df["channel"].fillna("UNKNOWN").value_counts().rename_axis("channel").reset_index(name="count")
        )
        fig = px.pie(chan_df, names="channel", values="count", hole=0.55)
        fig.update_layout(height=300, margin=dict(t=10, b=0))
        st.plotly_chart(fig, use_container_width=True)

    st.markdown("##### Risk score over time")
    series = df.sort_values("timestamp")
    fig = px.line(
        series,
        x="timestamp",
        y="risk_score",
        markers=True,
        color="risk_band",
        color_discrete_map={
            "LOW": "#1ec27a",
            "MEDIUM": "#f59e0b",
            "HIGH": "#f97316",
            "CRITICAL": "#dc2626",
        },
    )
    fig.update_layout(height=320, margin=dict(t=10, b=0))
    st.plotly_chart(fig, use_container_width=True)


def alerts_table(df: pd.DataFrame) -> None:
    if df.empty:
        return
    flagged = df[df["action"].isin(["HOLD_FOR_REVIEW", "BLOCK", "STEP_UP_AUTH"])].copy()
    if flagged.empty:
        st.success("No flagged alerts in the recent window.")
        return
    flagged["reasons"] = flagged["reason_codes"].apply(lambda v: ", ".join(v[:4]))
    flagged_view = flagged[
        [
            "timestamp",
            "customer_id",
            "channel",
            "city",
            "risk_band",
            "action",
            "risk_score",
            "kyc_tier",
            "reasons",
        ]
    ].sort_values("timestamp", ascending=False)
    st.markdown("##### Flagged transactions queue")
    st.dataframe(flagged_view, use_container_width=True, hide_index=True)


def case_drilldown(df: pd.DataFrame) -> None:
    if df.empty:
        return
    flagged = df[df["action"].isin(["HOLD_FOR_REVIEW", "BLOCK", "STEP_UP_AUTH"])]
    if flagged.empty:
        return
    st.markdown("##### Case drill-down")
    selected_id = st.selectbox(
        "Select transaction",
        options=flagged["transaction_id"].tolist(),
    )
    row = flagged[flagged["transaction_id"] == selected_id].iloc[0]
    cols = st.columns([2, 1])
    with cols[0]:
        st.markdown(f"**Customer:** `{row['customer_id']}` · **Action:** `{row['action']}`")
        st.markdown(f"**Customer message:** {row['customer_message']}")
        st.markdown("**Analyst notes**")
        st.code(row["analyst_message"], language="markdown")
        st.markdown("**Reason codes**")
        st.write(row["reason_codes"])
    with cols[1]:
        st.metric("Risk score", f"{row['risk_score']:.1f}")
        st.metric("Anomaly score", f"{row['anomaly_score']:.1f}")
        st.metric("Fraud score", f"{row['fraud_score']:.1f}")
        st.markdown("**Compliance**")
        st.write(
            {
                "aml_review_required": bool(row["aml_required"]),
                "sbp_flag": bool(row["sbp_flag"]),
                "kyc_tier": row["kyc_tier"],
                "channel": row["channel"],
                "city": row["city"],
                "home_city": row["home_city"],
            }
        )


def cases_panel() -> None:
    cases = load_cases()
    st.markdown("##### Auto-created cases")
    if cases.empty:
        st.info("No cases created yet.")
        return
    cases["created_at"] = pd.to_datetime(cases["created_at"])
    cases = cases.sort_values("created_at", ascending=False)
    st.dataframe(cases, use_container_width=True, hide_index=True)


def main() -> None:
    header()
    df = load_decisions()
    kpi_block(df)
    charts(df)
    st.divider()
    alerts_table(df)
    st.divider()
    case_drilldown(df)
    st.divider()
    cases_panel()
    st.caption(
        f"Connected to {API_BASE} · Last refresh {datetime.utcnow().strftime('%H:%M:%S')} UTC"
    )


if __name__ == "__main__":
    main()
