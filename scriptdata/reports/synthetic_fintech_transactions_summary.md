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
- Amount mean / P95 / P99: **199.10 / 586.46 / 1954.48**
- Avg velocity (normal vs anomaly): **4.35 vs 38.16**
- Avg amount (normal vs anomaly): **130.64 vs 986.39**
- New beneficiary rate (normal vs anomaly): **13.75% vs 83.65%**
- Risky device rate (normal vs anomaly): **14.26% vs 83.54%**
- Different-city rate (normal vs anomaly): **11.41% vs 73.85%**
- Off-hours rate (normal vs anomaly): **0.00% vs 61.35%**
- Channel distribution: **{"App": 0.13666666666666666, "ATM": 0.13558333333333333, "JazzCash": 0.1325, "Easypaisa": 0.12533333333333332, "Raast": 0.11966666666666667, "1LINK": 0.11916666666666667, "POS": 0.11816666666666667, "IBFT": 0.11291666666666667}**
- Merchant distribution: **{"Groceries": 0.16825, "P2P": 0.12275, "Utilities": 0.11908333333333333, "Cash": 0.10708333333333334, "Dining": 0.09325, "Fuel": 0.07391666666666667, "Electronics": 0.07008333333333333, "Travel": 0.06891666666666667, "Others": 0.06475, "Healthcare": 0.06066666666666667, "Education": 0.05125}**
- KYC tier distribution: **{"low": 0.5343333333333333, "medium": 0.35333333333333333, "high": 0.11233333333333333}**
- Device distribution: **{"trusted_device": 0.802, "new_device": 0.14575, "emulated_device": 0.05225}**