# Synthetic Fintech Transactions Summary

## How Anomalies Were Generated
- 8% anomalies injected by default (configurable 5-10%).
- Fraud patterns: 3x-10x amount spikes, velocity bursts, off-hours timestamps, channel-shift to ATM/P2P/Cash, new beneficiary, risky devices, different-city.
- Subset of users receives behavioral drift in baseline amount and device behavior.

## Pakistan-Localized Fields
- `timestamp`: ISO datetime spanning the configured date range.
- `customer_id`: stable per-user identifier (e.g., C00123).
- `channel`: one of IBFT, Raast, 1LINK, JazzCash, Easypaisa, POS, ATM, App.
- `city` / `home_city`: Pakistani cities (Karachi, Lahore, Islamabad, etc.).
- `kyc_tier`: low / medium / high (drives compliance weighting).
- `merchant_category`: Groceries, Utilities, Cash, P2P, etc.
- `is_holiday`: derived flag for Eid days, Independence Day, salary-credit windows.

## Feature Summary
- Total rows: **12000**
- Anomalies: **960** (8.00%)
- Amount mean / P95 / P99: **148.33 / 379.44 / 713.15**
- Avg velocity (normal vs anomaly): **4.35 vs 10.31**
- Avg amount (normal vs anomaly): **130.64 vs 351.75**
- New beneficiary rate (normal vs anomaly): **13.75% vs 45.00%**
- Risky device rate (normal vs anomaly): **14.26% vs 53.96%**
- Different-city rate (normal vs anomaly): **11.41% vs 34.06%**
- Off-hours rate (normal vs anomaly): **0.00% vs 33.23%**
- Channel distribution: **{"ATM": 0.13741666666666666, "App": 0.13291666666666666, "JazzCash": 0.12625, "Raast": 0.12341666666666666, "POS": 0.12341666666666666, "1LINK": 0.12208333333333334, "Easypaisa": 0.11883333333333333, "IBFT": 0.11566666666666667}**
- Merchant distribution: **{"Groceries": 0.17316666666666666, "P2P": 0.12166666666666667, "Utilities": 0.12166666666666667, "Cash": 0.10591666666666667, "Dining": 0.09591666666666666, "Fuel": 0.07608333333333334, "Others": 0.06666666666666667, "Electronics": 0.06358333333333334, "Healthcare": 0.062, "Travel": 0.06066666666666667, "Education": 0.05266666666666667}**
- KYC tier distribution: **{"low": 0.5343333333333333, "medium": 0.35333333333333333, "high": 0.11233333333333333}**
- Device distribution: **{"trusted_device": 0.8256666666666667, "new_device": 0.13441666666666666, "emulated_device": 0.03991666666666667}**