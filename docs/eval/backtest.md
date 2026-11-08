# Walk-forward backtest

Config hash `17b55fc0fe1a0b73`. 1-month-ahead 5th/95th percentiles, one forecast per month after a 36-month warm-up, fitted only on data up to each origin. Held out: origins from 2024-01-01. Target breach rate 5% each side.

| Series | Model | Period | n | Low breaches (95% CI) | Kupiec p | Christoffersen p | High breaches | Pinball |
|---|---|---|---|---|---|---|---|---|
| an | hist_sim | all | 115 | 8.7% (4.8%–15.3%) | 0.10 | 0.04 | 6.1% | 0.0105 |
| an | mc | all | 115 | 7.8% (4.2%–14.2%) | 0.20 | 0.00 | 5.2% | 0.0094 |
| an | normal_refit | all | 115 | 6.1% (3.0%–12.0%) | 0.60 | 0.05 | 5.2% | 0.0094 |
| an | hist_sim | development | 84 | 9.5% (4.9%–17.7%) | 0.09 | 0.18 | 7.1% | 0.0106 |
| an | mc | development | 84 | 9.5% (4.9%–17.7%) | 0.09 | 0.00 | 6.0% | 0.0102 |
| an | normal_refit | development | 84 | 7.1% (3.3%–14.7%) | 0.40 | 0.05 | 6.0% | 0.0101 |
| an | hist_sim | held_out | 31 | 6.5% (1.8%–20.7%) | 0.72 | 0.07 | 3.2% | 0.0101 |
| an | mc | held_out | 31 | 3.2% (0.6%–16.2%) | 0.63 | 0.79 | 3.2% | 0.0073 |
| an | normal_refit | held_out | 31 | 3.2% (0.6%–16.2%) | 0.63 | 0.79 | 3.2% | 0.0075 |
| barley | hist_sim | all | 115 | 5.2% (2.4%–10.9%) | 0.92 | 0.02 | 7.0% | 0.0074 |
| barley | mc | all | 115 | 7.0% (3.6%–13.1%) | 0.36 | 0.09 | 8.7% | 0.0069 |
| barley | normal_refit | all | 115 | 6.1% (3.0%–12.0%) | 0.60 | 0.05 | 7.8% | 0.0068 |
| barley | hist_sim | development | 84 | 7.1% (3.3%–14.7%) | 0.40 | 0.05 | 8.3% | 0.0083 |
| barley | mc | development | 84 | 7.1% (3.3%–14.7%) | 0.40 | 0.05 | 9.5% | 0.0077 |
| barley | normal_refit | development | 84 | 7.1% (3.3%–14.7%) | 0.40 | 0.05 | 9.5% | 0.0075 |
| barley | hist_sim | held_out | 31 | 0.0% (0.0%–11.0%) | 0.07 | 1.00 | 3.2% | 0.0051 |
| barley | mc | held_out | 31 | 6.5% (1.8%–20.7%) | 0.72 | 0.71 | 6.5% | 0.0049 |
| barley | normal_refit | held_out | 31 | 3.2% (0.6%–16.2%) | 0.63 | 0.79 | 3.2% | 0.0049 |
| fuel | hist_sim | all | 115 | 8.7% (4.8%–15.3%) | 0.10 | 0.00 | 8.7% | 0.0066 |
| fuel | mc | all | 115 | 8.7% (4.8%–15.3%) | 0.10 | 0.24 | 8.7% | 0.0062 |
| fuel | normal_refit | all | 115 | 7.0% (3.6%–13.1%) | 0.36 | 0.09 | 8.7% | 0.0061 |
| fuel | hist_sim | development | 84 | 9.5% (4.9%–17.7%) | 0.09 | 0.02 | 8.3% | 0.0051 |
| fuel | mc | development | 84 | 9.5% (4.9%–17.7%) | 0.09 | 0.78 | 8.3% | 0.0048 |
| fuel | normal_refit | development | 84 | 7.1% (3.3%–14.7%) | 0.40 | 0.42 | 8.3% | 0.0046 |
| fuel | hist_sim | held_out | 31 | 6.5% (1.8%–20.7%) | 0.72 | 0.07 | 9.7% | 0.0106 |
| fuel | mc | held_out | 31 | 6.5% (1.8%–20.7%) | 0.72 | 0.07 | 9.7% | 0.0102 |
| fuel | normal_refit | held_out | 31 | 6.5% (1.8%–20.7%) | 0.72 | 0.07 | 9.7% | 0.0100 |
| osr | hist_sim | all | 115 | 8.7% (4.8%–15.3%) | 0.10 | 0.04 | 7.0% | 0.0073 |
| osr | mc | all | 115 | 6.1% (3.0%–12.0%) | 0.60 | 0.05 | 7.0% | 0.0068 |
| osr | normal_refit | all | 115 | 6.1% (3.0%–12.0%) | 0.60 | 0.05 | 7.0% | 0.0068 |
| osr | hist_sim | development | 84 | 10.7% (5.7%–19.1%) | 0.04 | 0.05 | 7.1% | 0.0070 |
| osr | mc | development | 84 | 6.0% (2.6%–13.2%) | 0.70 | 0.02 | 7.1% | 0.0070 |
| osr | normal_refit | development | 84 | 6.0% (2.6%–13.2%) | 0.70 | 0.02 | 7.1% | 0.0070 |
| osr | hist_sim | held_out | 31 | 3.2% (0.6%–16.2%) | 0.63 | 0.79 | 6.5% | 0.0080 |
| osr | mc | held_out | 31 | 6.5% (1.8%–20.7%) | 0.72 | 0.59 | 6.5% | 0.0063 |
| osr | normal_refit | held_out | 31 | 6.5% (1.8%–20.7%) | 0.72 | 0.59 | 6.5% | 0.0062 |
| wheat | hist_sim | all | 115 | 7.0% (3.6%–13.1%) | 0.36 | 0.56 | 7.8% | 0.0061 |
| wheat | mc | all | 115 | 3.5% (1.4%–8.6%) | 0.43 | 0.10 | 5.2% | 0.0056 |
| wheat | normal_refit | all | 115 | 3.5% (1.4%–8.6%) | 0.43 | 0.10 | 5.2% | 0.0057 |
| wheat | hist_sim | development | 84 | 9.5% (4.9%–17.7%) | 0.09 | 0.78 | 9.5% | 0.0068 |
| wheat | mc | development | 84 | 4.8% (1.9%–11.6%) | 0.92 | 0.15 | 6.0% | 0.0061 |
| wheat | normal_refit | development | 84 | 4.8% (1.9%–11.6%) | 0.92 | 0.15 | 6.0% | 0.0061 |
| wheat | hist_sim | held_out | 31 | 0.0% (0.0%–11.0%) | 0.07 | 1.00 | 3.2% | 0.0042 |
| wheat | mc | held_out | 31 | 0.0% (0.0%–11.0%) | 0.07 | 1.00 | 3.2% | 0.0042 |
| wheat | normal_refit | held_out | 31 | 0.0% (0.0%–11.0%) | 0.07 | 1.00 | 3.2% | 0.0044 |

## Whole farm, harvest years 2019–2025 (n = 7, descriptive only)

Forecast from August of the year before, farm held fixed and unhedged, prices anchored to today's £/t through the Defra index.

| Harvest | P5 | P50 | P95 | Realised | Outside the band? |
|---|---|---|---|---|---|
| 2019 | £6k | £113k | £246k | £16k | no |
| 2020 | £-70k | £10k | £109k | £-46k | no |
| 2021 | £-12k | £77k | £185k | £117k | no |
| 2022 | £41k | £162k | £307k | £231k | no |
| 2023 | £44k | £227k | £456k | £49k | no |
| 2024 | £-72k | £61k | £233k | £12k | no |
| 2025 | £-58k | £73k | £241k | £47k | no |

## Breach months (mc, all)

- **an**: 2017-04-01 low, 2017-05-01 low, 2020-05-01 low, 2021-01-01 high, 2021-09-01 high, 2021-10-01 high, 2022-02-01 high, 2022-03-01 high, 2022-12-01 low, 2023-01-01 low, 2023-02-01 low, 2023-04-01 low, 2023-05-01 low, 2026-03-01 high, 2026-06-01 low
- **barley**: 2018-07-01 high, 2019-01-01 low, 2019-02-01 low, 2020-12-01 high, 2021-04-01 high, 2021-06-01 low, 2021-08-01 high, 2021-09-01 high, 2021-10-01 high, 2022-02-01 high, 2022-03-01 high, 2022-05-01 low, 2022-06-01 low, 2022-11-01 low, 2024-01-01 low, 2024-03-01 high, 2024-06-01 low, 2026-07-01 high
- **fuel**: 2018-11-01 low, 2020-01-01 low, 2020-03-01 low, 2020-04-01 low, 2020-06-01 high, 2021-09-01 high, 2021-10-01 high, 2022-02-01 high, 2022-03-01 high, 2022-05-01 high, 2022-07-01 low, 2022-11-01 low, 2023-05-01 low, 2023-08-01 high, 2023-11-01 low, 2026-02-01 high, 2026-03-01 high, 2026-05-01 low, 2026-06-01 low, 2026-07-01 high
- **osr**: 2021-02-01 high, 2021-04-01 high, 2021-08-01 high, 2021-09-01 high, 2022-02-01 high, 2022-03-01 high, 2022-05-01 low, 2022-06-01 low, 2022-07-01 low, 2023-02-01 low, 2023-04-01 low, 2025-03-01 high, 2025-04-01 low, 2026-04-01 high, 2026-05-01 low
- **wheat**: 2018-07-01 high, 2021-09-01 high, 2021-10-01 high, 2022-02-01 high, 2022-03-01 high, 2022-05-01 low, 2022-06-01 low, 2022-11-01 low, 2023-02-01 low, 2024-04-01 high

Limits: the monthly test checks each factor's tails, not the joint structure. The Student-t and the nitrogen factor were chosen knowing 2022 happened.
