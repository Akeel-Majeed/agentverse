# Main risk agent: design

Status: draft v2, after adversarial review. Date: 2026-11-08. Hackathon closes 18:00 today.

## Decisions taken

| Question | Decision |
|---|---|
| Primary user | The farmer (Fenland Ridge Farm Ltd, fictional). Banks and advisers read over MCP, including a covenant view. |
| Harness | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), built-in tools off (`tools: []`), our engine exposed as in-process tools, run as a worker. |
| Evaluation | Headline: monthly walk-forward of 1-month P5/P95 per price factor. Supporting: whole-farm table 2019–2025, n stated. |
| Decision model | Jev (TypeSafe, `@typesafe-ai/sdk`) for the injection screen only. Cut if the key does not work within 30 minutes. |
| Additions | DSCR covenant view over MCP (rubric 4). One document/profile conflict caught on screen (rubric 5). |
| Store | Supabase (not Neon; `docs/architecture.md` §6.5 to be corrected). |

## Three kinds of model, one job each

| Layer | What | Never does |
|---|---|---|
| Computes | Our TypeScript: Monte Carlo, P&L, DSCR, backtest, thresholds, plausibility z-scores | Judgement |
| Decides | Jev: "does this text try to instruct the AI?", with a probability | Arithmetic, prose, the only line of defence |
| Judges and explains | Claude via Agent SDK | Produce any number not returned by a tool |

## 1. Flow: two-phase run

```
TRIGGER  "Update risk profile" · cron · new signal  →  Vercel route
PHASE 1 (Vercel, ~2 s, always runs)
  1 GATHER (code)    profile_fields, latest snapshot, market_data, lib/live.ts
                     each input → observations {kind, source, url, fetched_at, value, sha256}
  2 SCREEN           free text (documents, news, iMessage, MCP proposals):
                     Jev Noul "tries to instruct the AI?" (option order randomised) → quarantine
                     numbers: code z-score vs market_data history, |z| > 4 → review
  3 COMPUTE (code)   simulate(asOf, profile, seed): 10,000 seeded paths
                     → per risk: mean, P5 (1-in-20), CVaR, score 1–10 (lib/score.ts), stand-alone P5
                     → options re-simulated on the same draws → £ saved net of a stated cost
                     → DSCR per path → P(DSCR < 1.25) and its main driver
                     → change-my-mind thresholds via lossPrice (lib/sim.ts)
  PUBLISH NUMBERS    assessment row (status: numbers_only), run queued for phase 2
PHASE 2 (Agent SDK worker, target p50 < 60 s)
  4 JUDGE (Claude)   tools: [], allowedTools mcp__risk__* only
                     get_engine_results (one bundle), get_documents, get_observation,
                     propose_change (always_ask → pending_changes)
                     outputFormat JSON: ranked options with reasons citing result ids,
                     per-risk explanation, change_my_mind citing threshold ids,
                     conflicts between documents and profile, hold_for_human
  5 VERIFY (code)    figure checker: every number must equal a value in a cited tool result
                     or observation (current matcher: exact at 2 dp, k/m/bn normalised);
                     untraced → status blocked, explanation not published
  6 PUBLISH          explanation attached → status published / held / blocked
```

Rules:
- The backtest calls the same `simulate()` the farmer sees.
- With no worker running, phase 1 still publishes full numbers, labelled "explanation pending". The app stays runnable without keys.
- A held run (quarantined key input, or `hold_for_human`) publishes "needs farmer", not a guess.

### Hosting and run time

The Agent SDK spawns a `claude` CLI subprocess (about 1 GiB RAM and its own disk per session), so phase 2 runs in a long-lived worker (bun script; laptop or small container for the demo). The worker calls `startup()` to pre-warm and polls `agent_runs` for queued rows.

| Stage | Time | Basis |
|---|---|---|
| Gather (live adapters, parallel) | 0.6 s | measured |
| Monte Carlo, 8 factors × 10k paths × 12 sims | 65–85 ms | measured (bun benchmark) |
| Jev screen, one batched request | ~1 s | TypeSafe docs |
| Claude judge | 30–90 s | estimate, not yet measured |
| Checker rewrite turn, if fired | +15–30 s | estimate |

Targets: numbers on screen < 5 s; explanation p50 < 60 s. Step 6 measures both over 3 runs. If Opus 5.5 misses the target, the user decides on Sonnet 5.5. The worker's model is set by `RISK_AGENT_MODEL` (default `claude-opus-5-5`, effort set explicitly); the chat agent keeps `ANTHROPIC_MODEL`.

## 2. Schema: migration `0003_agent_runs.sql`

New tables:

| Table | Purpose |
|---|---|
| `agent_runs` | id, farm_id, trigger, as_of, seed, engine_version, config_hash, prompt_version, model, status (`numbers_only / queued / running / published / held / blocked / killed / failed`), total_cost_usd, tokens, turns, stage timings, started_at, ended_at, error |
| `observations` | run_id, kind (`market / profile / document / news / message`), source, url, fetched_at, value jsonb, sha256, screen_status (`passed / quarantined / review`), screen jsonb |
| `agent_events` | run_id, seq, type, actor (`code / jev / claude / human`), body text (canonical JSON, stored as text so the hash is stable), prev_hash, hash. Unique (run_id, seq). |
| `agent_controls` | One row: paused, max_turns, max_budget_usd, max_proposals_per_run, jev_threshold, z_threshold |
| `backtest_results` | One row per forecast: series, origin, horizon, model (`mc / normal_refit / hist_sim`), p5, p95, realised, breach_low, breach_high, pinball, config_hash |

Changes to existing tables:
- `pending_changes.source` allows `'agent'`; add `run_id`, `evidence jsonb`, `resolved_by`.
- `assessments` adds `run_id`, `status`, `head_hash` (the last `agent_events.hash` of the run).
- `profile_fields` catalogue gains the debt-service fields DSCR needs (annual capital repayment), if not already present.
- `signals` unchanged (triage cut).

Integrity:
- Triggers reject UPDATE, DELETE and TRUNCATE on `agent_events` and `observations`.
- The worker connects as a Postgres role `risk_agent` (direct connection string `RISK_AGENT_DATABASE_URL`) with INSERT on `agent_events`, `observations`, `pending_changes`, UPDATE on `agent_runs` and `assessments`, SELECT elsewhere, and no grant on `profile_fields`. The secret key stays with the Vercel app.
- One writer per run: the worker appends events in sequence.
- `head_hash` is published on the assessment and returned over MCP, so a bank holding an earlier head hash can detect a rewritten chain.
- Known limit: the database owner can still disable triggers. Stated, not hidden.

## 3. Observability and controls

### What is recorded

| Source | Table | Contents |
|---|---|---|
| Run lifecycle | `agent_runs` | Times per stage, versions, config hash, seed, status, cost, tokens, turns (from the SDK result message) |
| Inputs | `observations` | Source, url, fetched_at, value, sha256, screen result |
| Agent SDK hooks: SessionStart, PreToolUse, PostToolUse, PostToolUseFailure, Stop, StopFailure | `agent_events` | Tool, input, output id and hash, ms, error |
| `propose_change` decisions | `agent_events`, `pending_changes` | Proposed value, evidence, "queued for farmer" |
| Jev and z-score screen decisions | `agent_events` | Question, probability, threshold, action |
| Figure checker | `agent_events` | Each number → the tool result or observation it matched, or UNTRACED |
| Human approvals | `agent_events`, `pending_changes.resolved_by` | Who, what, when |

`verify-chain` recomputes `sha256(prev_hash || body)` over the stored text and compares with `head_hash`. The Trace page shows the result.

### Regulatory framing

- EU AI Act: logging is designed to Article 12(1)–(2) (automatic recording over the lifetime; traceability for risk situations and monitoring). The system is not claimed to be high-risk: Article 12(3) applies only to Annex III point 1(a) (remote biometric identification), Annex III 5(b) covers natural persons while Fenland Ridge is a Ltd, and the Act does not reach a UK farm and UK bank directly.
- For the bank audience, map to PRA SS1/23 model risk management principles:

| SS1/23 theme | Where |
|---|---|
| Model identification and inventory | `engine_version`, `config_hash` on every run |
| Development and validation | Walk-forward backtest vs two benchmarks, frozen config |
| Ongoing monitoring | `backtest_results` breaches, run status, screen quarantines |
| Governance and use | Farmer approval of every change, kill switch, hard limits, action log |

### Controls enforced in code

1. Kill switch: the worker polls `agent_controls.paused` every 2 s and aborts the SDK query; PreToolUse also denies with `continue: false`; status is re-checked before publishing. Run ends `killed`. Fired live in the demo.
2. Limits: `maxTurns`, `maxBudgetUsd`, max proposals per run, from `agent_controls`.
3. Isolation: `tools: []`, allowedTools `mcp__risk__*` only, `settingSources: []`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
4. Approvals: `propose_change` is `always_ask`; in the headless worker the `canUseTool` callback writes `pending_changes` and returns "queued for farmer". The human gate is the `pending_changes` approval UI, and the deck says so. The worker's database role has no write access to `profile_fields`.
5. Screen: Jev injection probability above threshold → quarantine; z-score outlier → review.
6. Figure checker: untraced number → `blocked`.
7. Hold: `hold_for_human` or a quarantined key input → `held`.

Fallbacks: without `TYPESAFE_API_KEY`, free-text inputs from outside sources are held for review and structured market data passes on the z-score check alone; the screen is labelled "Jev unavailable". Without `ANTHROPIC_API_KEY` or a worker, phase 1 publishes numbers only.

### Trace page and risk page

- Trace page (built early, step 4): a timeline per run, each event labelled Computed (code), Decided (Jev, p=…) or Judged (Claude). Each £ figure links to its tool result, then the observation, then the source URL. Shows `head_hash` and the verify-chain result.
- Risk page: the existing closed-form working (`riskWorking`, lib/sim.ts) stays visible as a hand-checkable "quick check"; the simulation P5 is shown beside it with its seed and path count. This adds an optional field to `RiskResult`; approving this spec approves that type change.

## 4. Engine and backtest

### Data (real history; the farm is synthetic and labelled so)

- Defra Agricultural Price Index (OGL v3), monthly from 2014-01: feed wheat, feed barley, oilseed rape, nitrogen fertiliser, motor fuels. One licence-clean file covering all five price factors; replaces the AHDB XLSX sheets (AHDB's clean nitrogen series only starts in 2017).
- Defra East Midlands yields: wheat, barley, oilseed rape (1999 on)
- Bank of England Bank Rate (monthly, from 2010)
- Downloaded by `scripts/load-history.ts`, hashed, and committed as `data/history.json` so the backtest is reproducible. Prices are indices; whole-farm figures anchor them to today's £/t.

### Model: `simulate(asOf, profile, seed)`

- Factors: log-changes in wheat, barley, rape and AN prices; yield shocks; change in Bank Rate.
- Vols and price correlations estimated from monthly log-changes dated on or before `asOf`, scaled to the horizon, covariance shrunk (Ledoit-Wolf). Student-t with ν = 5 fixed in advance (not fitted). Yield vol fitted separately from 1999, with the trend fitted inside each fold.
- Regulation: an event scenario (probability p of a scheme payment cut of £X), stated as an assumption and not backtested.
- P&L per path: Σ area × yield × price (sold tonnage at contract price) − fertiliser − diesel − sprays − floating-rate interest + scheme income.
- DSCR per path: (profit before interest + depreciation) ÷ (interest + capital repayment).
- Per-risk figures: one factor at a time (stand-alone P5 and CVaR, labelled stand-alone; they do not sum to the whole-farm figure when factors are correlated).
- Options: re-simulated on the same draws, net of a stated cost input (no Black-76; UK feed wheat options are thin).

### Walk-forward backtest (`bun run backtest`)

Headline: monthly, per factor.
- Series: wheat, barley, rape (from 2014), AN (from 2017). Origin each month after a 36-month warm-up; horizon 1 month, so forecasts do not overlap. About 100 forecasts for the crops and 80 for AN.
- Models: `mc` (Student-t, shrunk vol) vs `normal_refit` (the closed-form normal refitted per origin on the same data, not the hand-set 2026 sd values in lib/mock.ts) vs `hist_sim` (empirical 5th/95th percentile of the last 36 months).
- Metrics per series and model: P5 and P95 breach rates with Wilson intervals, Kupiec test, Christoffersen independence test, pinball loss. Every breach month listed.
- What it tests: the tails of each factor. It does not test the joint structure; the whole-farm table is the only evidence for that, and the deck says so.

Supporting: whole-farm table.
- Harvest years 2019–2025, fit on data up to August of the year before, farm held fixed and unhedged (no 2026 forward sales). Forecast P5/P50/P95 vs realised, breach years named. n = 7, descriptive only, no test statistics.

Honesty rules:
- Config committed to git and its hash recorded before the first backtest run.
- The choice of Student-t and an AN factor was made knowing 2022 happened; disclosed in the deck.

### Screen evaluation

- Public injection dataset the team has not seen (candidate: deepset/prompt-injections; licence checked before use) plus about 10 farm-specific attacks written against the screener by a teammate who did not write the screen prompt.
- Report catch rate and false-alarm rate with Wilson intervals; misses listed.

## 5. Build order

| # | Step | Verify |
|---|---|---|
| 0 | Confirm the TypeSafe key works (30-minute limit, else cut Jev) | Done 8 Nov 01:00: injection test returned 0.98 in 0.24 s |
| 1 | Migration 0003, `risk_agent` role, triggers, store functions | UPDATE/DELETE/TRUNCATE on `agent_events` rejected; role cannot write `profile_fields` |
| 2 | History loader → `market_data` | Row counts and date ranges; each row has source and hash |
| 3 | `lib/engine/simulate.ts` + phase 1 in a Vercel route | vitest: same seed → same output; no data after `asOf`; P&L and DSCR match a worked example; numbers on screen < 5 s |
| 4 | Trace page | Click a £ figure → tool result → observation → source URL |
| 5 | `bun run backtest` → `backtest_results`, `docs/eval/backtest.json` | Breach rates, Kupiec, Christoffersen, pinball vs both benchmarks; breach months listed |
| 6 | Agent SDK worker (phase 2): tools, hooks, controls, checker, publish | Full run; verify-chain passes; kill switch → killed; untraced number → blocked; p50 timing over 3 runs recorded |
| 7 | Jev screen + document conflict demo + screen eval | Manipulated document quarantined on screen; conflicting document produces a pending change; catch and false-alarm rates |
| 8 | MCP route with `get_risk_profile` and `covenant_view` (P(DSCR < 1.25), main driver, run id, head_hash) | Called from an MCP client; values match the assessment |
| 9 | UI: kill-switch toggle, backtest panel with misses | Toggle mid-run → killed shown |

Tracks that can run in parallel once step 1 lands: engine and backtest (2, 3, 5); agent (6, 7); trace, MCP and UI (4, 8, 9).

## 6. Deck evidence map

| Rubric row | Evidence |
|---|---|
| 1 Traceable (25%) | Trace page: £ → tool result → observation → AHDB URL; hand-checkable quick check beside the simulation; change-my-mind thresholds; Computed / Decided / Judged labels |
| 2 Unseen data (25%) | Monthly walk-forward: about 100 out-of-sample forecasts per series vs two benchmarks, Kupiec and Christoffersen, breach months listed; whole-farm 2019–2025 table with n = 7 stated; screen scored on a public dataset with misses; manipulated document quarantined on screen |
| 3 Controls (15%) | Kill switch fired live; hard limits; farmer approval UI; agent database role without profile write access; head hash and verify-chain; PRA SS1/23 mapping |
| 4 Impact (20%) | Fenland Ridge's worst failure (fertiliser and wheat squeeze) handled on screen; a bank reads P(DSCR < 1.25) over MCP; a cited statistic on cereal-farm losses |
| 5 Ambition (15%) | Claude spots a document that contradicts the profile and proposes a change for the farmer to approve; code computes, Jev screens, Claude judges |

## Skipped

OpenTelemetry export, live forward log, Jev triage, proposal gate and claim check, `documents` table (documents are observations of kind `document`), backtesting regulation risk, Black-76 option pricing, reliability plots, bootstrap CIs on small samples.
