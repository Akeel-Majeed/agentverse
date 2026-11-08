# Evaluation

Everything here was produced on 8 Nov 2026 from committed code and data. All farm data, documents and photos are synthetic; the market history is real (Defra Agricultural Price Index and cereal yields, OGL v3; Bank of England Bank Rate). Nothing here is real-world trading or lending performance.

| File | What it holds |
|---|---|
| [`backtest.md`](backtest.md) (raw: `backtest.json`) | Monthly walk-forward backtest of the simulation's 1-in-20 bands against two benchmarks, plus the whole-farm check |
| [`screen-eval.md`](screen-eval.md) (raw: `screen-eval.json`) | Input screen (Jev) on a public injection dataset, synthetic farm texts and synthetic photos, every miss listed |
| [`run-timings.md`](run-timings.md) | Live Gemini 4 Argon judge runs: time, turns, cost, outcome |
| [`screenshots/`](screenshots/) | The app showing each control and result (list below) |

## Headline numbers for the deck

### 1. Simulation backtest: breach rate vs benchmark

Config hash `17b55fc0fe1a0b73`. One-month-ahead 5th and 95th percentiles, one forecast a month after a 36-month warm-up, each fitted only on data up to its month. 115 forecasts per series (2017–2026); origins from 2024 are held out (n = 31). Target: 5% breaches each side. Benchmarks: a normal distribution refitted each month (`normal_refit`) and historical simulation (`hist_sim`).

| Series | Monte Carlo low breaches, all (95% CI) | Kupiec p | normal_refit | hist_sim |
|---|---|---|---|---|
| Wheat | 3.5% (1.4%–8.6%) | 0.43 | 3.5% | 7.0% |
| Barley | 7.0% (3.6%–13.1%) | 0.36 | 6.1% | 5.2% |
| Oilseed rape | 6.1% (3.0%–12.0%) | 0.60 | 6.1% | 8.7% |
| Nitrogen (AN) | 7.8% (4.2%–14.2%) | 0.20 | 6.1% | 8.7% |
| Diesel | 8.7% (4.8%–15.3%) | 0.10 | 7.0% | 8.7% |

- Kupiec does not reject the Monte Carlo for any series.
- **It does not beat the normal refit**: pinball loss is about equal. It beats historical simulation on pinball loss for every series.
- **Losses:** nitrogen breaches cluster in 2021–23 (Christoffersen p ≈ 0.00), so the model misses regime shifts. High-side breaches run above 5% for barley (8.7%), rape (7.0%) and fuel (8.7%). The Student-t tails and the nitrogen factor were chosen knowing 2022 happened.
- Whole farm, harvests 2019–2025: 0 / 7 realised profits fell outside P5–P95. That is n = 7 and descriptive only, and the 2022 row is price-only because Defra has no 2022 East Midlands yield.

### 2. Input screen: catch rate and false alarms

Jev `jev-latest`, injection probability ≥ 0.5 → quarantined; threshold fixed before the run. 95% Wilson intervals.

| Set | n | Caught | False alarms |
|---|---|---|---|
| Public: deepset/prompt-injections test split (Apache-2.0) | 116 | 46 / 60 = 76.7% (64.6%–85.6%) | 0 / 56 = 0% (0%–6.4%) |
| Farm text (synthetic) | 20 | 10 / 10 | 0 / 10 |
| Farm photos (synthetic, read by Gemini 3.8 Flash first) | 10 | 5 / 5 | 0 / 5 |
| All | 146 | 61 / 75 = 81.3% (71.1%–88.5%) | 0 / 71 = 0% (0%–5.1%) |

- **Misses:** 14, all in the public set; the closest is deepset-111 (misspelt "igmre", p = 0.42). All 14 are listed in `screen-eval.md`.
- The farm attack texts were written by an AI subagent that did not see the screen code. The photo set is only n = 10, so its intervals are wide (56.6%–100% caught).

### 3. Judge: time and cost per run

Gemini 4 Argon, `thinking_level: medium`, live calls, cost computed in code from each interaction's `usage`.

- **p50 43.5 s, $0.042 per run** over the 6 live runs that reached the judge (31.3, 33.6, 43.0, 44.0, 57.4 and 69.0 s; 2–3 turns each). The first 3 alone gave p50 43 s, $0.043. All 6 ended `published` with no untraced figures; the last 2 (33.6 s and 44.0 s) ran after the review fixes, under the strict figure checker, and it passed them.
- The 2 injection inputs (merchant email, photo with a printed instruction) were held at the screen: no Argon call, $0.
- One run (keyless dev server, forward-contract photo) took **69.0 s**, over Vercel Hobby's 60 s route limit: `/api/judge` asks for 300 s, which needs Vercel Pro, or run the judge locally with `bun run agent:demo`.
- Six runs is a small sample.

## Controls seen firing

- Kill switch stopping a live run mid-judgement: `screenshots/kill-switch-fired.png`, `kill-switch-fired-events.png`.
- Injection photo held before any judge call: `screenshots/trace-held-injection-photo.png`.
- The other controls (budget, turn and proposal caps, 270 s deadline, denied function, strict figure checker block, non-verbatim quote, second judge request on the same run) are tested with scripted clients in `tests/`; none fired in the live runs.

## Screenshots

| File | Shows |
|---|---|
| `documents.png` | Documents page: paste, upload or photograph a document; demo documents |
| `trace-published.png`, `trace-published-judgement.png` | A published run: chain intact, Gemini interaction ids, the judgement with every cited figure linked |
| `trace-figure-anchor.png` | A risk page's "View trace" link landing on the figure's row: formula, inputs, source |
| `trace-held-injection-photo.png` | Printed instruction read by Flash, caught by Jev, run held for the farmer |
| `kill-switch-fired.png`, `kill-switch-fired-events.png` | Kill switch pressed during a judgement; run ends `killed` |
| `approvals-agent-proposal.png` | The judge's proposal (2027 wheat sold forward 0 → 200 t, from the contract photo) waiting in the farmer's approval queue |
| `risk-simulation-check.png` | The risk page's simulation card: 1-in-20 hit from 10,000 simulated years, seed and config hash, link to the trace |

## Known limits

- Every server action in `lib/data.ts` is public, so in the demo anyone can call `setPaused(false)`. Real authentication is a next step.
- DSCR leaves out the depreciation add-back, because the profile has no depreciation field.
- The `backtest_results` table is never written; the backtest output lives in `backtest.json`.
- The figure checker does not parse spelled-out numbers ("one in four").
- The `assessments` columns `run_id`, `status` and `head_hash` are not written; the run and its current head are resolved when the assessment is read.
- `/trace` with no run id shows the latest run, which may not be the run behind the assessment on screen.
- On Vercel the agent tables must be in Supabase (`AGENT_TABLES=1`, migration `0003_agent_runs.sql` applied): the in-memory agent store does not survive across serverless invocations.
- The monthly backtest checks each factor's tails, not their joint structure. Regulation is not backtested.
