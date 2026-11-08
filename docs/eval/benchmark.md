# Benchmarks: the hedge decision and the whole-farm forecast

Run `bun run eval:benchmark`. Engine config hash `17b55fc0fe1a0b73` (DEFAULT_CONFIG, unchanged). Data cutoff: prices 2026-08-01, yields 2026, Bank Rate 2026-11-01 (data/history.json).

**Synthetic farm, real data.** The farm is the fictional Fenland Ridge Farm Ltd (lib/profile/fenland-ridge.ts: 220 ha wheat at 8.5 t/ha, etc.). Prices are the Defra Agricultural Price Index (feed wheat, feed barley, OSR, AN fertiliser, motor fuel), anchored to today's £/t through the index. Yields are Defra East Midlands regional yields, applied as the year's deviation from a trend fitted only on earlier years. Bank Rate is the Bank of England series. These are backtests on history, not real-world trading results.

Every harvest year is walk-forward: the origin is 1 August of the year before, and each year uses only data dated on or before its origin (the realised outcome is read at 1 August of the harvest year). Nothing here was tuned on these results, but the engine's design (Student-t, ν = 5, the nitrogen factor) was chosen knowing 2022 happened. Strictly held out (origins from 2024-01, the same cut as backtest.md): harvest years 2025 and 2026 only.

## 1. The hedge decision vs benchmarks, with costs

Decision: sell 50% of expected wheat (220 ha × 8.5 t/ha × 50% = 935 t) forward at the origin, cost £3/t. **Forward-price proxy:** we have no historical forward curve, so the forward price is the spot index price at the origin (August). A real new-crop forward price differs from spot by the basis and carry; this proxy is the main limit of this test. The rest is sold at the realised August harvest-year price. Benchmarks: do nothing (all at harvest) and sell 100% forward (if the harvest falls short, the shortfall is bought back at the harvest price). Other costs, yields and rates are realised values and are the same across the three strategies.

Harvest years 2017–2026: **n = 10 years, descriptive.** Intervals are 95% percentile bootstraps (10,000 resamples, seed 42); with n this small they are rough. With 10 years, the P5 is an interpolation between the two worst years.

| Strategy | Mean profit (95% CI) | Spread (SD across years) | Worst year | P5 across years | Mean of worst 2 years | Hedge cost a year (total) | Mean gain vs doing nothing (95% CI) | Years it lost money vs doing nothing |
|---|---|---|---|---|---|---|---|---|
| Do nothing (sell all at harvest) | £70k (£25k to £119k) | £82k | −£46k (2020) | −£20k | −£17k | £0k (£0k) | — | — |
| Sell 50% forward (the agent's option) | £61k (£19k to £102k) | £71k | −£73k (2020) | −£37k | −£32k | £3k (£28k) | −£9k (−£28k to £12k) | 7 of 10: 2017, 2018, 2020, 2021, 2022, 2024, 2026 |
| Sell 100% forward | £52k (£5k to £95k) | £76k | −£100k (2020) | −£57k | −£53k | £6k (£56k) | −£19k (−£56k to £25k) | 7 of 10: 2017, 2018, 2020, 2021, 2022, 2024, 2026 |

**Read plainly:** over these 10 years the 50% forward sale lowered mean profit by £9k a year and made the worst year worse (−£73k vs −£46k, harvest 2020); it lost money against doing nothing in 7 of 10 years. It narrowed the spread across years (SD £71k vs £82k). Wheat rose from August to August in 6 of the 10 years, so selling at the August price lost money then; the forward sale paid off in 2019, 2023, 2025, when prices fell by more than the £3/t cost. The worst year (2020) was a poor yield with a rising price: for an unhedged farm the two partly offset, and a forward sale removes that natural offset. This is one 10-year price path, not a test of whether the hedge narrows the simulated 1-in-20 year. It is the evidence that should temper the agent when prices are expected to rise.

Per year (profit, £k):

| Harvest | Wheat £/t at origin → harvest | Do nothing | Sell 50% forward | Sell 100% forward | Note |
|---|---|---|---|---|---|
| 2017 | £109 → £120 | £21k | £8k | −£6k |  |
| 2018 | £120 → £163 | £86k | £43k | £0k |  |
| 2019 | £163 → £120 | £16k | £53k | £90k |  |
| 2020 | £120 → £146 | −£46k | −£73k | −£100k |  |
| 2021 | £146 → £168 | £117k | £94k | £71k |  |
| 2022 | £168 → £224 | £231k | £175k | £119k | yields missing in Defra data, set to trend |
| 2023 | £224 → £163 | £49k | £104k | £159k |  |
| 2024 | £163 → £162 | £12k | £10k | £8k |  |
| 2025 | £162 → £151 | £47k | £55k | £62k |  |
| 2026 | £151 → £178 | £167k | £139k | £111k |  |

## 2. Whole-farm forecast vs baselines

For each harvest year, each model forecasts the farm's profit P5/P50/P95 at the origin; the farm is held fixed and unhedged. Models: **ours** (correlated Student-t Monte Carlo, ν = 5, 10,000 paths, seed 42, with the 10% scheme-cut event); **normal** (the same calibration and seed with near-Gaussian shocks, ν = 200); **historical simulation** (every 12-month price and rate move before the origin crossed with every past year's yield deviations, price and yield taken as independent, no scheme-cut event). Target: 90% of realised years inside P5–P95. Coverage intervals are Wilson 95%; pinball-loss intervals are bootstrap 95%.

| Model | Period | n | Inside P5–P95 (95% CI) | Below P5 | Above P95 | Pinball at P5 (95% CI) | Pinball P50 | Pinball P95 |
|---|---|---|---|---|---|---|---|---|
| Ours (Student-t Monte Carlo) | all 9 years | 9 | 100% (70%–100%) | none | none | £5k (£3k to £8k) | £39k | £8k |
| Normal, same calibration | all 9 years | 9 | 100% (70%–100%) | none | none | £5k (£3k to £8k) | £38k | £9k |
| Historical simulation | all 9 years | 9 | 89% (56%–98%) | 2023 | none | £7k (£5k to £10k) | £42k | £11k |
| Ours (Student-t Monte Carlo) | held out (2025–26) | 2 | 100% (34%–100%) | none | none | £9k (£5k to £12k) | £35k | £6k |
| Normal, same calibration | held out (2025–26) | 2 | 100% (34%–100%) | none | none | £9k (£6k to £12k) | £35k | £7k |
| Historical simulation | held out (2025–26) | 2 | 100% (34%–100%) | none | none | £10k (£7k to £13k) | £35k | £9k |

Paired comparison of pinball loss at P5 (baseline minus ours, per year; positive means ours was better):

- vs Normal, same calibration: mean £286 (95% CI £249 to £334), ours better in 9 of 9 years.
- vs Historical simulation: mean £2280 (95% CI £701 to £5110), ours better in 9 of 9 years.

| Harvest | Model | P5 | P50 | P95 | Realised | Outside? |
|---|---|---|---|---|---|---|
| 2018 | Ours (Student-t Monte Carlo) | −£65k | £19k | £125k | £86k | no |
| 2018 | Normal, same calibration | −£70k | £18k | £133k | £86k | no |
| 2018 | Historical simulation | −£80k | £28k | £186k | £86k | no |
| 2019 | Ours (Student-t Monte Carlo) | £6k | £113k | £246k | £16k | no |
| 2019 | Normal, same calibration | £1k | £112k | £259k | £16k | no |
| 2019 | Historical simulation | −£8k | £124k | £307k | £16k | no |
| 2020 | Ours (Student-t Monte Carlo) | −£70k | £10k | £109k | −£46k | no |
| 2020 | Normal, same calibration | −£76k | £10k | £116k | −£46k | no |
| 2020 | Historical simulation | −£77k | £24k | £161k | −£46k | no |
| 2021 | Ours (Student-t Monte Carlo) | −£12k | £77k | £185k | £117k | no |
| 2021 | Normal, same calibration | −£17k | £76k | £194k | £117k | no |
| 2021 | Historical simulation | −£26k | £85k | £241k | £117k | no |
| 2022 | Ours (Student-t Monte Carlo) | £41k | £162k | £307k | £231k | no (yields set to trend) |
| 2022 | Normal, same calibration | £35k | £160k | £317k | £231k | no (yields set to trend) |
| 2022 | Historical simulation | £29k | £195k | £392k | £231k | no (yields set to trend) |
| 2023 | Ours (Student-t Monte Carlo) | £44k | £227k | £456k | £49k | no |
| 2023 | Normal, same calibration | £35k | £225k | £477k | £49k | no |
| 2023 | Historical simulation | £63k | £278k | £530k | £49k | below P5 |
| 2024 | Ours (Student-t Monte Carlo) | −£72k | £61k | £233k | £12k | no |
| 2024 | Normal, same calibration | −£78k | £59k | £248k | £12k | no |
| 2024 | Historical simulation | −£95k | £95k | £284k | £12k | no |
| 2025 (held out) | Ours (Student-t Monte Carlo) | −£58k | £73k | £241k | £47k | no |
| 2025 (held out) | Normal, same calibration | −£63k | £71k | £257k | £47k | no |
| 2025 (held out) | Historical simulation | −£94k | £96k | £295k | £47k | no |
| 2026 (held out) | Ours (Student-t Monte Carlo) | −£71k | £54k | £213k | £167k | no |
| 2026 (held out) | Normal, same calibration | −£77k | £52k | £224k | £167k | no |
| 2026 (held out) | Historical simulation | −£98k | £76k | £261k | £167k | no |

## Caveats

- The farm is synthetic; only the prices, yields and rates are real. Its costs and areas are held at today's values for every year.
- Defra has no 2022 regional yields in our data: 2022 yields are set to trend (no yield shock) in both tests, so 2022 shows only the price shock.
- Forward price = spot price at the origin (no historical forward curve). Basis, carry and counterparty risk are not modelled. £3/t is an assumed cost.
- Harvest prices are the August index month; real sales spread over the year.
- n is 9–10 years and only 2 are strictly held out. Every figure is descriptive; none is a claim about future performance.
- The latest year's yields and prices are whatever data/history.json holds and may be revised by Defra.
