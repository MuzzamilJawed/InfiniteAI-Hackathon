# Synthetic Fintech Transactions Summary

## How Anomalies Were Generated
- 8% anomalies injected by default (configurable 5-10%).
- Fraud patterns include 3x-10x amount spikes, velocity bursts, new beneficiary with high amount, risky devices, and different-city mismatch.
- A subset of users receives abrupt behavioral drift in baseline amount and device behavior.

## Simulated Patterns
- User cohorts: high spenders, low-frequency, high-frequency, new users, and standard users.
- `amount` is correlated with `avg_user_amount` for normal behavior; history-rich users show more stable velocity.
- New users are noisier and more sensitive to anomaly triggers.

## Assumptions
- Synthetic MVP data intended for hackathon anomaly modeling.
- Categorical features are raw strings (`device`, `location`) and may be encoded during training.
- `is_anomaly` can be used for offline evaluation and excluded in unsupervised training.

## Feature Summary
- Total rows: **12000**
- Anomalies: **960** (8.00%)
- Correlation (`amount`, `avg_user_amount`): **0.504**
- Amount mean / P95 / P99: **184.93 / 544.67 / 1632.89**
- Avg velocity (normal vs anomaly): **4.60 vs 36.98**
- Avg amount (normal vs anomaly): **124.09 vs 884.49**
- New beneficiary rate (normal vs anomaly): **14.28% vs 83.75%**
- Risky device rate (normal vs anomaly): **14.10% vs 79.48%**
- Different-city rate (normal vs anomaly): **11.04% vs 75.94%**
- Device distribution: **{"trusted_device": 0.8066666666666666, "new_device": 0.14583333333333334, "emulated_device": 0.0475}**
- Location distribution: **{"same_city": 0.8376666666666667, "different_city": 0.16233333333333333}**