# Risk agent: morning report (8 Nov 2026)

Branch `feat/risk-agent`, not pushed, not deployed. Plan: `2026-11-08-risk-agent.md`. Spec: `docs/superpowers/specs/2026-11-08-risk-agent-design.md`. Evaluation summary: `docs/eval/README.md`.

## What was built

| Task | What | Commit(s) |
|---|---|---|
| Spec + plan | Design spec and plan; judge moved to Gemini 4 Argon, document and photo intake added | 8d9b339, bfac6b0 |
| 1 | Engine and trace contracts, dependencies (`@google/genai` 3.0.0) | ae0e110 |
| 2 | Seeded PRNG and Student-t draws, Ledoit-Wolf shrunk correlation, quantile / Wilson / Kupiec / Christoffersen / pinball | 11bf53d |
| 3 | Real history (Defra price index, Defra East Midlands yields, BoE Bank Rate) downloaded, hashed, committed as `data/history.json` | 2f77fa0 |
| 4 | Migration 0003: agent run tables, append-only trace triggers, restricted `risk_agent` role; fix so the role can create runs but not touch controls | 4e6b316, dddf3dc |
| 5 | Input screen: Jev for text, z-score for numbers; number screen fails closed | 62784af, 5154f1a |
| 6 | Calibration, profile → farm inputs, 10,000-path Monte Carlo with options, DSCR and thresholds (32 figures) | 86ca887 |
| 7 | Hash-chained trace writer and verifier; agent store (memory, Supabase, Postgres role) | c2d847c |
| 8 | Monthly walk-forward and whole-farm backtests; results frozen at config `17b55fc0fe1a0b73` | 33a2bd4, 7940353 |
| 9 | Phase one (read → screen → compute → publish) wired into "Update risk profile" and document upload | 1ffa113 |
| 10 | Phase two: Gemini 4 Argon judge, our own loop, code-enforced controls, figure checker, `/api/judge/[runId]` | 64f3b01 |
| 10b | Gemini 3.8 Flash reads PDFs and phone photos with verbatim quotes; demo and attack fixtures | ec725d2 |
| 11 | Trace page, kill switch, run-judgement button, documents page with upload and camera, simulation card on risk pages | 2592158 |
| 12 | `/api/mcp`: `get_risk_profile`, `covenant_view` (bearer `MCP_TOKEN`) | 0dd7565 |
| 13 | Screen evaluation (public dataset, farm texts, farm photos) and `/evidence` page | aa1ddc9 |
| 14 | Shared demo store across module copies, unused SDK removed, README model table and evidence, eval summary, this report | ce86236, e9276ec, this commit |
| Review fixes | Fixes from the whole-branch review (see below) | 7309be0, 11e9ea7, a9d37d0, 24ad0f7, cb4bf17, 357ed8a, 20f8b55, 2f720a4, a4e6fad, 64cabfd, 64f70b4, 470ddb0 |

## Verification (final)

- `bunx vitest run`: 199 tests in 22 files, all passing, after the review fixes (143 in 21 files before them).
- `bunx tsc --noEmit`: clean. `bunx eslint .`: clean (fixed a pre-existing `require()` in `tailwind.config.ts`). `bun run build`: passes.
- Live after the review fixes: `bun run agent:demo` (no document) and `bun run agent:demo --file data/demo/forward-contract.png`, memory agent store, proposals logged, not written: both `published` under the strict figure checker (runs 7 and 8 below).
- Live, keyless, before the review fixes (dev server in a temporary worktree, Supabase and agent-table vars removed, real Gemini and Jev keys): `/documents` → "Forward contract (photo)" → Flash read it (4.9 s), Jev passed it (p = 0.02) → "Run judgement" → `published` in 69.0 s, 3 turns, $0.042, checker "all 26 figures match a function result", chain intact (35 events) → the proposal `sales.wheat_2027_forward_t` 0 → 200 ("200 tonnes") appeared in the approval queue (`/profile#approvals`; there is no `/approvals` route) → "Update risk profile" → `/risks/output_prices` shows the simulation card from the new run. Screenshots: `docs/eval/screenshots/approvals-agent-proposal.png`, `risk-simulation-check.png`. Nothing was written to live Supabase.

## Headline numbers

**Backtest** (`docs/eval/backtest.md`). 115 monthly one-month-ahead forecasts per series, 2017–2026, 31 held out from 2024. Monte Carlo low-side breach rate 3.5%–8.7% vs the 5% target; Kupiec rejects no series. Against benchmarks: about equal to a refitted normal on pinball loss (does **not** beat it), better than historical simulation on every series. Misses: nitrogen breaches cluster in 2021–23 (Christoffersen p ≈ 0.00); high-side breaches above 5% for barley (8.7%), rape (7.0%), fuel (8.7%). Whole farm 2019–2025: 0 / 7 outside P5–P95, n = 7, descriptive; 2022 row price-only (no 2022 East Midlands yield).

**Input screen** (`docs/eval/screen-eval.md`, threshold 0.5 fixed before the run). deepset/prompt-injections test split, n = 116: caught 46 / 60 = 76.7% (64.6%–85.6%), false alarms 0 / 56 (0%–6.4%). Farm texts 10 / 10 caught, 0 / 10 false alarms (texts written by an AI subagent that did not see the screen code). Farm photos 5 / 5 caught, 0 / 5 false alarms (n = 10). All sets: 61 / 75 = 81.3%, 0 / 71 false alarms. All 14 misses are in the public set; nearest miss deepset-111 (misspelt "igmre", p = 0.42).

**Judge runs** (`docs/eval/run-timings.md`). Each Interactions API call is one turn.

| Run | Input | Turns | Judge time | Cost | Ended |
|---|---|---|---|---|---|
| 1 | none | 2 | 31.3 s | $0.0257 | published |
| 2 | fertiliser contract (text) | 3 | 57.4 s | $0.0616 | published (2 proposals) |
| 3 | merchant email with injection | 0 | none | $0 | held (Jev) |
| 4 | forward contract (photo) | 3 | 43.0 s | $0.0430 | published (1 proposal) |
| 5 | contract photo with printed instruction | 0 | none | $0 | held (Flash copied it, Jev caught it) |
| 6 | forward contract (photo), keyless dev server, Task 14 check | 3 | 69.0 s | $0.0420 | published (1 proposal) |
| 7 | none, after the review fixes (strict checker) | 2 | 33.6 s | $0.0254 | published |
| 8 | forward contract (photo), after the review fixes (strict checker) | 3 | 44.0 s | $0.0422 | published (1 proposal, "Quantity: 200 tonnes") |
| 9 | kill-switch demo (Task 11) | n/a | n/a | n/a | killed (`control.kill_switch`, chain intact) |

Over the six runs that reached the judge: p50 43.5 s (31–69 s), p50 cost $0.042; the first three alone gave 43 s and $0.043. One run (69 s) went over 60 s. No run ended `blocked`: the strict checker passed runs 7 and 8 without a prompt change. Live, only the kill switch has fired; the budget, turn and proposal caps, denied function, checker block and non-verbatim quote controls fire in `tests/risk-agent.test.ts` with a scripted client.

## Gemini API details that differed from the plan

- `@google/genai` 3.0.0 defaults to API `/v1`, which rejects bare content parts in `input`. Every client is built with `httpOptions: { apiVersion: "v1beta" }`.
- Request options are `timeout_ms` plus the RequestInit `signal`; a set signal overrides `timeout_ms`, so the judge passes `AbortSignal.any([kill, AbortSignal.timeout(240_000)])`. Aborting mid-request throws `APIUserAbortError`.
- `@typesafe-ai/sdk` 0.7.0 throws "Body already used" under Bun, so the screen calls Jev with plain `fetch`; the SDK was removed from `package.json` in Task 14.

## What failed, changed or was skipped

- Keyless demo bug (found in Task 11, fixed in Task 14, ce86236): the in-memory demo store was module-scoped, so in dev the judge route and server actions saw a different copy from the pages; a re-run assessment or an agent proposal did not show. It now lives on `globalThis`, as the agent store does.
- Market history comes from the Defra Agricultural Price Index (one OGL file for all five price factors), not AHDB.
- Pre-existing eslint error in `tailwind.config.ts` (`require()`) fixed with an ESM import.
- Not built (kept out on purpose): OpenTelemetry export, a live forward log, Jev triage, a regulation backtest, voice.

## Known limits (also in README and `docs/eval/README.md`)

- Every server action in `lib/data.ts` is public: in the demo anyone can call `setPaused(false)`. Real authentication is a next step.
- DSCR leaves out the depreciation add-back (no depreciation field in the profile).
- The `backtest_results` table is never written; backtest output lives in `docs/eval/backtest.json`.
- The figure checker does not parse spelled-out numbers ("one in four").
- The `assessments` columns `run_id`, `status` and `head_hash` are not written; the run and its current head are resolved when the assessment is read.
- `/trace` with no run id shows the latest run.
- `/api/judge` asks for 300 s: Vercel Pro, or run the judge locally with `bun run agent:demo`.
- On Vercel, `AGENT_TABLES=1` with migration 0003 applied is required: the in-memory agent store does not survive across serverless invocations.

## Whole-branch review

A reviewer subagent read the spec, the plan and `git diff master...feat/risk-agent`; two fixer agents resolved its findings (commits in the table above). After the fixes: 199 / 199 tests, tsc, eslint and build clean, and two live judge runs published under the new checker.

| Severity | Finding | Resolution |
|---|---|---|
| Critical | Figure checker could be bypassed: sign flips, "per cent", "pounds", "GBP", unitless numbers | New `checkFiguresStrict` for the judge: text NFKC-normalised; every digit (Unicode included) must match an engine figure with the same unit and sign; gain words before a negative figure flagged; dotted ids count only if known; every string field scanned, conflicts included; all cited, option and threshold ids must exist |
| Critical | Blocked runs still showed their explanation | `checker.result` is now appended before `judge.output`; the trace shows the explanation only when nothing is untraced, otherwise the raw event sits behind "unverified, withheld" |
| Other | Injection via the file name or Flash's field values | Jev screens name, text and field values together |
| Other | `propose_change` took model-written values | Quote must come from this run's document text, be ≥ 8 characters and contain the proposed value; value parsed with `parseValue`; key must be in the catalogue; label and current value come from code; strict checker runs on the reason |
| Other | z-score check never held a run | A failing number now holds the run for the farmer |
| Other | Judge could start twice; kill switch could collide with it | Atomic `claimRun`, 409 for a second request; human events appended only when the chain is idle |
| Other | Hash covered only the body | Hash is `sha256(prev_hash || canonical({seq,type,actor,body}))` |
| Other | MCP heads did not match the assessment | Assessment meta and both MCP tools read the assessment's run and its current verified head |
| Other | No overall deadline | 270 s, fires `control.deadline` |
| Other | Missing `usage` meant the budget cap never fired | Fires `control.budget_limit` |
| Other | A failed controls read let the run continue; a missing controls row read as not paused | Both treated as paused (fail closed) |
| Other | Exceptions left runs stuck `running` | Run ends `failed` |
| Other | Farmer approvals were not logged | `proposal.approved` / `proposal.rejected` human event on the run's chain; `resolved_by` written when `AGENT_TABLES=1` |
| Other | "£NaN/t" and a bogus rate threshold | Shown as "not applicable" |

Not fixed, stated as limits in the README and `docs/eval/README.md`: the `assessments` `run_id` / `status` / `head_hash` columns are not written (resolved at read time); `backtest_results` is never written; DSCR has no depreciation add-back; spelled-out numbers are not parsed; server actions are public; `/trace` with no run id shows the latest run.

## Human steps for Akeel

- [ ] Review this report and the branch. Judge p50 is 43.5 s over 6 runs but one took 69 s: decide whether to set `RISK_AGENT_MODEL=gemini-3.8-flash` for the live demo (the README would then say so).
- [ ] Supabase SQL editor: run `supabase/migrations/0003_agent_runs.sql`, then `alter role risk_agent with login password '<strong password>';`. Check that `update agent_events set type='x'` fails with "append-only".
- [ ] Vercel env: `GEMINI_API_KEY`, `AGENT_TABLES=1`, `TYPESAFE_API_KEY`, `MCP_TOKEN`, `RISK_AGENT_MODEL` (if changing). Optional: `RISK_AGENT_DATABASE_URL=postgresql://risk_agent.<project-ref>:<password>@<pooler-host>:5432/postgres`. Hobby caps a route at 60 s; `/api/judge` needs Pro, or use the local runner (`bun run agent:demo`) for the demo.
- [ ] Dry-run the 3-minute demo on the deployed app: `/documents` → "Forward contract (photo)" → trace → "Run judgement" → approval queue (`/profile#approvals`) → kill switch mid-run on a second run. Keep a screen recording as the Wi-Fi backup.
- [ ] Push the branch, open a PR, deploy with `! vercel --prod`.
- [ ] Rotate the API keys that were pasted into chat, after the hackathon.
