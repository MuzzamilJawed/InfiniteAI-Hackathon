# Synthetic Fintech Transactions Summary

## How Anomalies Were Generated
- 8% anomalies injected by default (configurable 5-10%).
- Fraud scenarios: duplicate tx within 60s, 5x amount vs avg, 2AM transfer above PKR 500,000, rapid ATM withdrawals across locations, first-time international on domestic-only account.
- Scenario tags are exported in `scenario_tag` with supporting flags (`seconds_since_prev_tx`, `is_international`, `is_first_time_international`).

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
- Amount mean / P95 / P99: **58033.32 / 119466.62 / 958588.93**
- Avg velocity (normal vs anomaly): **4.35 vs 9.88**
- Avg amount (normal vs anomaly): **36579.48 vs 304752.51**
- New beneficiary rate (normal vs anomaly): **13.75% vs 49.58%**
- Risky device rate (normal vs anomaly): **14.26% vs 63.33%**
- Different-city rate (normal vs anomaly): **11.41% vs 27.92%**
- Off-hours rate (normal vs anomaly): **0.00% vs 19.06%**
- Channel distribution: **{"ATM": 0.14291666666666666, "App": 0.13375, "Raast": 0.12533333333333332, "JazzCash": 0.12325, "IBFT": 0.12258333333333334, "1LINK": 0.11908333333333333, "POS": 0.11791666666666667, "Easypaisa": 0.11516666666666667}**
- Merchant distribution: **{"Groceries": 0.16791666666666666, "Utilities": 0.11816666666666667, "P2P": 0.11775, "Cash": 0.11408333333333333, "Dining": 0.093, "Others": 0.07408333333333333, "Fuel": 0.07366666666666667, "Travel": 0.06941666666666667, "Electronics": 0.06191666666666667, "Healthcare": 0.059583333333333335, "Education": 0.050416666666666665}**
- KYC tier distribution: **{"low": 0.5343333333333333, "medium": 0.35333333333333333, "high": 0.11233333333333333}**
- Device distribution: **{"trusted_device": 0.8181666666666667, "new_device": 0.14291666666666666, "emulated_device": 0.03891666666666667}**