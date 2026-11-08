# Main risk agent: design

Status: draft v3, judge moved to Gemini 4 Argon and document/photo intake added. Date: 2026-11-08. Hackathon closes 18:00 today.

## Decisions taken

| Question | Decision |
|---|---|
| Primary user | The farmer (Fenland Ridge Farm Ltd, fictional). Banks and advisers read over MCP, including a covenant view. |
| Judge | Gemini 4 Argon (`gemini-4-argon`, `thinking_level: "medium"`) through the Interactions API (`@google/genai`), driven by our own function-calling loop. Five declared functions are the only tools; the final answer is a terminal `submit_judgement` function validated with zod in code. No agent framework, no worker process. |
| Reader | Gemini 3.8 Flash (`gemini-3.8-flash`) reads an uploaded PDF or phone photo into text plus profile fields, each with a verbatim quote; structured output (JSON schema). |
| Chat | The iMessage chat agent stays on Claude (`@anthropic-ai/sdk`, `lib/agents/chat/`), untouched. |
| Evaluation | Headline: monthly walk-forward of 1-month P5/P95 per price factor. Supporting: whole-farm table 2019–2025, n stated. Screen scored on a public dataset plus team-written text and photo attacks. |
| Decision model | Jev (TypeSafe, `@typesafe-ai/sdk`) for the injection screen only. Key verified 8 Nov 01:00. |
| Additions | DSCR covenant view over MCP (rubric 4). A forward contract photographed on a phone contradicts the profile and is caught on screen (rubric 4, 5; Gemini prize). |
| Store | Supabase (not Neon; `docs/architecture.md` §6.5 to be corrected). |
| Cut | Voice (Live API, TTS). Listed under Skipped as a next step. |

## Four kinds of model, one job each

| Layer | What | Never does |
|---|---|---|
| Computes | Our TypeScript: Monte Carlo, P&L, DSCR, backtest, thresholds, plausibility z-scores, cost from token counts | Judgement |
| Reads | Gemini 3.8 Flash: PDF or photo → verbatim text + fields with the words they came from (a field is dropped in code if its quote is not in the text) | Change anything; its text is screened before anyone acts on it |
| Decides | Jev: "does this text try to instruct the AI?", with a probability | Arithmetic, prose, the only line of defence |
| Judges and explains | Gemini 4 Argon through five declared functions, final answer via `submit_judgement` | Produce any number not returned by a function; write to the profile |

Model ids, in full, for the README and deck: `gemini-4-argon` (judge), `gemini-3.8-flash` (reader), `jev-latest` (screen), Claude via `ANTHROPIC_MODEL` (iMessage chat only).

## 1. Flow: two-phase run

```
TRIGGER  "Update risk profile" · document or photo upload · cron · new signal  →  Vercel route / server action
PHASE 1 (Vercel, ~2 s plus one Flash read on an upload, always runs)
  1 GATHER (code)    profile_fields, latest snapshot, market_data, lib/live.ts
                     each input → observations {kind, source, url, fetched_at, value, sha256}
  2 READ (Flash)     uploaded PDF or phone photo → gemini-3.8-flash, inline {type: document|image}
                     → {text (verbatim), fields: [{key, value, quote}]}; code drops any field whose
                     quote is not a substring of the text; event extract.result with the interaction id
  3 SCREEN           free text (typed documents, Flash's extracted text, news, iMessage, MCP proposals):
                     Jev Noul "tries to instruct the AI?" → quarantine; no reader available → review
                     numbers: code z-score vs market_data history, |z| > 4 → review
  4 COMPUTE (code)   simulate(asOf, profile, seed): 10,000 seeded paths
                     → per risk: mean, P5 (1-in-20), CVaR, score 1–10 (lib/score.ts), stand-alone P5
                     → options re-simulated on the same draws → £ saved net of a stated cost
                     → DSCR per path → P(DSCR < 1.25) and its main driver
                     → change-my-mind thresholds via lossPrice (lib/sim.ts)
  PUBLISH NUMBERS    assessment row (status: numbers_only), run queued for phase 2
PHASE 2 (Next.js route /api/judge/[runId], maxDuration 300 s; same function from a local script)
  5 JUDGE (Argon)    our loop over client.interactions.create, previous_interaction_id between turns
                     tools = exactly five declared functions (the allowlist):
                       get_engine_results (one bundle), get_documents (text + quoted fields),
                       get_profile, propose_change (→ pending_changes only, after code checks),
                       submit_judgement (terminal; parameters = the judgement schema)
                     judgement: ranked options with reasons citing figure ids, per-risk explanation,
                     change_my_mind citing threshold ids, conflicts between documents and profile,
                     hold_for_human; validated with zod in code
                     between every step: paused? budget? turn cap? → each call and result → agent_events
  6 VERIFY (code)    figure checker: every number in the judgement's prose must equal a value in a
                     function result (current matcher: exact at 2 dp, k/m/bn normalised);
                     untraced → status blocked, explanation not published
  7 PUBLISH          explanation attached → status published / held / blocked; farmer taps to approve proposals
```

Rules:
- The backtest calls the same `simulate()` the farmer sees.
- Without `GEMINI_API_KEY`, phase 1 still publishes full numbers, labelled "explanation pending", and any uploaded file is held for the farmer (no reader). The app stays runnable without keys.
- A held run (quarantined key input, no reader, or `hold_for_human`) publishes "needs farmer", not a guess.
- Nothing on screen is a mocked model call: when a model did not run, the page says so.

### Hosting and run time

Phase 2 is plain server code: no subprocess, no worker, no pre-warming. It runs in a Next.js route with `maxDuration = 300` (the trace page's "Run judgement" button POSTs to it and waits), and `scripts/risk-agent.ts` calls the same `runPhaseTwo()` locally for the demo runs and timings. The Interactions API keeps the conversation state server-side (`previous_interaction_id`), so each turn sends only the new function results.

| Stage | Time | Basis |
|---|---|---|
| Gather (live adapters, parallel) | 0.6 s | measured |
| Flash read of one page (photo or PDF) | 3–8 s | estimate, measured in Task 10b |
| Monte Carlo, 8 factors × 10k paths × 12 sims | 65–85 ms | measured (bun benchmark) |
| Jev screen, one batched request | ~1 s | TypeSafe docs |
| Argon judge, medium thinking, 4–6 turns (3 reads in one turn, proposals, submit) | 30–90 s | estimate: 5–20 s per turn, measured over 5 runs in Task 10 |
| Retry turn if `submit_judgement` fails validation | +10–20 s | estimate |

Targets: numbers on screen < 5 s; explanation p50 < 60 s. Task 10 records both over the demo runs in `docs/eval/run-timings.md`. If Argon misses the target, Akeel decides whether the demo runs on `gemini-3.8-flash` (`RISK_AGENT_MODEL`); the reader model is `RISK_READER_MODEL`; the chat agent keeps `ANTHROPIC_MODEL`.

## 2. Schema: migration `0003_agent_runs.sql`

New tables:

| Table | Purpose |
|---|---|
| `agent_runs` | id, farm_id, trigger, as_of, seed, engine_version, config_hash, prompt_version, model, status (`numbers_only / queued / running / published / held / blocked / killed / failed`), total_cost_usd, tokens, turns, stage timings, started_at, ended_at, error |
| `observations` | run_id, kind (`market / profile / document / news / message`), source, url, fetched_at, value jsonb, sha256, screen_status (`passed / quarantined / review`), screen jsonb |
| `agent_events` | run_id, seq, type, actor (`code / jev / gemini / human`), body text (canonical JSON, stored as text so the hash is stable), prev_hash, hash. Unique (run_id, seq). Gemini interaction ids live in the bodies of `extract.result`, `judge.turn` and `tool.call` events. |
| `agent_controls` | One row: paused, max_turns, max_budget_usd (default 3), max_proposals_per_run, jev_threshold, z_threshold |
| `backtest_results` | One row per forecast: series, origin, horizon, model (`mc / normal_refit / hist_sim`), p5, p95, realised, breach_low, breach_high, pinball, config_hash |

Changes to existing tables:
- `pending_changes.source` allows `'agent'`; add `run_id`, `evidence jsonb`, `resolved_by`.
- `assessments` adds `run_id`, `status`, `head_hash` (the last `agent_events.hash` of the run).
- `profile_fields` catalogue gains the debt-service fields DSCR needs (annual capital repayment), if not already present.
- `signals` unchanged (triage cut).

Integrity:
- Triggers reject UPDATE, DELETE and TRUNCATE on `agent_events` and `observations`.
- The agent store can connect as a Postgres role `risk_agent` (direct connection string `RISK_AGENT_DATABASE_URL`) with INSERT on `agent_events`, `observations`, `pending_changes`, UPDATE on `agent_runs` and `assessments`, SELECT elsewhere, and no grant on `profile_fields`. When it is set, phases 1 and 2 write through that role; the farmer's approval path uses the app's store.
- One writer per run: `TraceWriter` appends events in sequence; phase 2 resumes the chain from the last stored event.
- `head_hash` is published on the assessment and returned over MCP, so a bank holding an earlier head hash can detect a rewritten chain.
- Known limit: the database owner can still disable triggers. Stated, not hidden.

## 3. Observability and controls

### What is recorded

| Source | Table | Contents |
|---|---|---|
| Run lifecycle | `agent_runs` | Times per stage (gather, read, screen, compute, judge), versions, prompt version, model, config hash, seed, status, cost (code: `usage` tokens × Argon price), tokens, turns (Interactions API calls) |
| Inputs | `observations` | Source, url, fetched_at, value (for a document: text, fields with quotes, mime type), sha256 of the file or text, screen result |
| Reader | `agent_events` `extract.result` (actor `gemini`) | Model, interaction id, fields with quotes, sha256 of the text |
| Judge loop, wrapped before and after every function call | `agent_events` `judge.start`, `judge.turn`, `tool.call`, `tool.result`, `tool.denied`, `judge.output`, `run.end` | Interaction id, usage and running cost per turn; function name and arguments; result (or the refusal) |
| `propose_change` decisions | `agent_events`, `pending_changes` | Proposed value, evidence (observation id + verbatim quote), "queued for farmer", or why it was refused (`control.proposal_limit`, `control.quote_not_verbatim`) |
| Jev and z-score screen decisions | `agent_events` | Question, probability, threshold, action |
| Figure checker | `agent_events` `checker.result` | Each number → the function result it matched, or UNTRACED |
| Controls firing | `agent_events` `control.*` | Kill switch (where it fired), budget cap, turn cap, proposal cap |
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

All in `lib/agents/risk/run.ts` and `tools.ts` unless stated; none rely on the prompt.

1. Kill switch: `agent_controls.paused` is read before every Interactions call and before every function execution; a 2 s poller also aborts the in-flight request through an `AbortController` (passed as the request `signal`); status is re-checked before publishing. Run ends `killed` with a `control.kill_switch` event saying where it fired. Fired live in the demo from the trace page toggle.
2. Allowlist: `TOOL_DECLARATIONS` is the only set of functions sent to Gemini and `TOOL_NAMES` the only names `run.ts` executes; any other name gets `tool.denied` and an error result. No built-in tools (no search, no code execution, no URL context).
3. Turn cap: at most `maxTurns` Interactions calls per run (default 8) → `control.turn_limit`, status `failed`.
4. Budget cap: after every call, cost = `usage.total_input_tokens` × $2/M + (`total_output_tokens` + `total_thought_tokens`) × $10/M (Argon introductory price to 30 Nov 2026); above `maxBudgetUsd` (default $3) → `control.budget_limit`, status `failed`. Computed in code from the API's token counts, not estimated by the model.
5. Approvals: `propose_change` writes only `pending_changes` (source `agent`, with the run id and evidence), after three code checks: proposal cap per run, the observation id is one of this run's passed documents, the quote is verbatim text from that document. The human gate is the `pending_changes` approval UI (one tap), and the deck says so. The `risk_agent` database role has no write grant on `profile_fields`.
6. Screen: Jev injection probability above threshold → quarantine; z-score outlier → review; an upload with no reader → review. Flash's extracted text is screened before the judge can read it.
7. Figure checker: untraced number in the judgement → `blocked`, explanation withheld.
8. Hold: `hold_for_human` or a quarantined key input → `held`.
9. Output shape: `submit_judgement` arguments are validated with zod; invalid → the error goes back to the model as the function result and it may retry within the turn cap.

Fallbacks: without `TYPESAFE_API_KEY`, free-text inputs from outside sources are held for review and structured market data passes on the z-score check alone; the screen is labelled "Jev unavailable". Without `GEMINI_API_KEY`, phase 1 publishes numbers only and uploads are held for the farmer.

### Trace page and risk page

- Trace page (built early, step 4): a timeline per run, each event labelled Computed (code), Decided (Jev, p=…), Read (Gemini 3.8 Flash) or Judged (Gemini 4 Argon), with the Gemini interaction id on every model turn. Each £ figure links to its function result, then the observation, then the source URL. Shows `head_hash` and the verify-chain result, the kill switch, and a "Run judgement" button on a queued run.
- Risk page: the existing closed-form working (`riskWorking`, lib/sim.ts) stays visible as a hand-checkable "quick check"; the simulation P5 is shown beside it with its seed and path count. This adds an optional field to `RiskResult`; approving this spec approves that type change.
- Documents page: paste text, or drop a PDF or take a photo (`<input type="file" accept="application/pdf,image/*" capture>`); lists each document with its screen status and the fields Flash read with their quotes; demo buttons load the committed fixtures.

### Document and photo intake

- `lib/agents/documents/extract.ts`: `gemini-3.8-flash`, inline `{ type: "document" | "image", data, mime_type }`, `response_format` JSON schema `{ text, fields: [{ key ∈ catalogue keys, value, quote }] }`, `thinking_level: "low"`. Returns the model and interaction id for the trace.
- Code check on the reader: a field is kept only if its `quote` is a substring of `text` (case and whitespace normalised). Flash can misread; it cannot invent a quote that passes.
- The text goes through Jev like any typed document. The farmer's uploaded injection photo (a contract with "ignore your previous instructions…" printed on it) is read out by Flash and quarantined by Jev: a manipulative input caught on screen (rubric 2).
- Fixtures, generated once by `scripts/make-demo-docs.py` (Pillow) and committed: `data/demo/forward-contract.{png,pdf}` (200 t feed wheat sold forward at £185/t while the profile says 0 t), `data/demo/injection-contract.png`, and ten image cases under `data/eval/image-attacks/` for the screen evaluation. Labelled synthetic documents.
- Demo: photo → Flash extracts `sales.wheat_2027_forward_t = 200` with the quote "Quantity: 200 tonnes" → Jev passes → engine recomputes → Argon flags the conflict with the profile (0 t) and calls `propose_change` → the checker verifies the explanation → the farmer taps approve on `/approvals`.

### Modalities and the Gemini prize

Google DeepMind's "Best Use of Gemini" criteria (builder guide p.12) and where each is met:

| Criterion | Where |
|---|---|
| Two or more modalities in one connected loop | Vision (PDF and phone photo, Gemini 3.8 Flash) and reasoning over tool results (Gemini 4 Argon) in a single run: photo → Flash → Jev → engine → Argon → checker → farmer's tap |
| Gemini 4 Argon output verified by a real check | The figure checker (code) matches every number in Argon's judgement against function results; zod validates the judgement shape; `propose_change` quotes must be verbatim; the engine, not Argon, produces every figure |
| Interactive, people in control of real-world actions | Drop a photo, tap "Run judgement", approve or reject each proposal with a tap, stop the agent with the kill switch; MCP read-only for the bank |
| Guide checklist | README lists the exact model ids and the loop; no mocked Gemini screens (a run without a key says "explanation pending"); keys only in env vars; 3-minute demo rehearsed with a screen recording as backup |

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

- Public injection dataset the team has not seen (deepset/prompt-injections test split, Apache-2.0) plus about 10 farm-specific text attacks and 10 clean texts written against the screener by a teammate who did not write the screen prompt, plus 10 image cases (5 photos with a printed instruction, 5 clean) that go through Flash first, so the evaluation covers the real path a photo takes.
- Report catch rate and false-alarm rate with Wilson intervals per set; misses listed; the image set's n = 10 stated as small.

## 5. Build order

| # | Step | Verify |
|---|---|---|
| 0 | Confirm the TypeSafe key works (30-minute limit, else cut Jev) | Done 8 Nov 01:00: injection test returned 0.98 in 0.24 s |
| 1 | Migration 0003, `risk_agent` role, triggers, store functions | UPDATE/DELETE/TRUNCATE on `agent_events` rejected; role cannot write `profile_fields` |
| 2 | History loader → `market_data` | Row counts and date ranges; each row has source and hash |
| 3 | `lib/engine/simulate.ts` + phase 1 in a Vercel route | vitest: same seed → same output; no data after `asOf`; P&L and DSCR match a worked example; numbers on screen < 5 s |
| 4 | Trace page | Click a £ figure → tool result → observation → source URL |
| 5 | `bun run backtest` → `backtest_results`, `docs/eval/backtest.json` | Breach rates, Kupiec, Christoffersen, pinball vs both benchmarks; breach months listed |
| 6 | Gemini 4 Argon judge (phase 2): declared functions, our loop, controls, `submit_judgement`, checker, publish, `/api/judge` route | Full run; verify-chain passes; kill switch → killed; unknown function → denied; budget and turn caps fire in tests; untraced number → blocked; p50 timing over 5 real runs recorded |
| 6b | Gemini 3.8 Flash reader: PDF and photo → text + quoted fields; fixtures generated and committed | Fixture photo yields `sales.wheat_2027_forward_t = 200` with a verbatim quote; injection photo's text contains the printed instruction |
| 7 | Jev screen + document conflict demo + screen eval (text and image) | Manipulated photo quarantined on screen; conflicting contract photo produces a pending change; catch and false-alarm rates per set |
| 8 | MCP route with `get_risk_profile` and `covenant_view` (P(DSCR < 1.25), main driver, run id, head_hash) | Called from an MCP client; values match the assessment |
| 9 | UI: kill-switch toggle, run-judgement button, document upload, backtest panel with misses, README model table | Toggle mid-run → killed shown |

Tracks that can run in parallel once step 1 lands: engine and backtest (2, 3, 5); reader (6b, new files only); agent (6, 7); trace, MCP and UI (4, 8, 9).

## 6. Deck evidence map

| Rubric row | Evidence |
|---|---|
| 1 Traceable (25%) | Trace page: £ → function result → observation → Defra/BoE URL; Gemini interaction id on every model turn; hand-checkable quick check beside the simulation; change-my-mind thresholds; Computed / Decided / Read / Judged labels; the checker's UNTRACED list when it fires |
| 2 Unseen data (25%) | Monthly walk-forward: about 100 out-of-sample forecasts per series vs two benchmarks, Kupiec and Christoffersen, breach months listed; whole-farm 2019–2025 table with n = 7 stated; screen scored on a public dataset plus farm text and farm photos, misses listed; a photo with a printed instruction quarantined on screen |
| 3 Controls (15%) | Kill switch fired live mid-judgement; allowlist, turn, budget and proposal caps in code with tests; farmer approval UI; agent database role without profile write access; head hash and verify-chain; PRA SS1/23 mapping |
| 4 Impact (20%) | Fenland Ridge's worst failure (fertiliser and wheat squeeze) handled on screen; a forgotten forward contract photographed and reconciled against the profile; a bank reads P(DSCR < 1.25) over MCP; a cited statistic on cereal-farm losses |
| 5 Ambition (15%) | A phone photo of a contract becomes a verified, approvable profile change: Flash reads, Jev screens, code computes, Argon judges, code checks, the farmer taps; no conventional program reads the photo |
| Gemini prize | Table in §3 "Modalities and the Gemini prize": two modalities in one loop, Argon verified by the figure checker, interactive with people in control; README with exact model ids |

## Limits and data governance

- Interactions are stored by Google for 55 days by default (`store: true`), which is what lets `previous_interaction_id` carry the conversation and thought signatures server-side. Fine for the fictional demo farm. A production deployment would set `store: false` and use stateless function calling (resend the full step history, including `thought` steps, each turn), and would review Google's data terms for the paid tier.
- Argon's introductory price ends 30 Nov 2026 (then $4/M in, $20/M out); the budget cap constant is dated in code.
- The reader is only as good as the photo: blurry or rotated pages lower extraction quality; the quote check drops fields, it does not fix them.
- Argon with medium thinking may exceed 60 s; the measured figure is reported, not the target.
- Synthetic farm and synthetic documents, labelled as such; real Defra and Bank of England history.

## Skipped

OpenTelemetry export, live forward log, Jev triage, proposal gate and claim check, `documents` table (documents are observations of kind `document`), backtesting regulation risk, Black-76 option pricing, reliability plots, bootstrap CIs on small samples, structured output combined with function calling on Argon (preview, Gemini 3 series only, so the terminal function carries the schema instead), voice. Next step if time allowed: a one-way spoken briefing of the published judgement with `gemini-3.8-flash-tts` (text already verified by the checker; no Live API, no voice input).
