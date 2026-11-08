

https://github.com/user-attachments/assets/c16de515-408a-48a2-a10e-edf9e9498124

# Hedged

## Overview

Hedged is a risk agent for a UK arable farmer. The demo farm is Fenland Ridge Farm Ltd, a fictional 450 ha farm near Sleaford, Lincolnshire. It helps with one decision: what to sell forward, what to buy now and what to fix, given crop prices, fertiliser and fuel, weather, policy and interest rates. End to end: the farmer sets up the farm profile in a setup flow; the engine (TypeScript, no LLM) simulates 10,000 years and scores each risk 1–10; Gemini 3.8 Flash reads documents and photos; Jev screens every piece of free text for injected instructions; Gemini 4 Argon judges and explains the engine's results; a strict figure checker (code) blocks any number the engine did not produce; and the farmer approves or rejects each proposed change with a tap.

Mitigations are options to discuss with your merchant, adviser or bank, not advice. All farm data, documents and photos are synthetic.

### Demo path

1. `/onboarding`: set up the farm (questions, documents, iMessage).
2. `/overview`: the five risks, top options and expected profit. Each risk opens `/risks/[id]` with the working and the simulation card.
3. `/documents`: paste, upload or photograph a document. "Forward contract (photo)" is the main demo; the injection photo shows the screen holding a run.
4. `/trace/[runId]` (or `/trace` for the latest run): every step of a run, the hash-chain check, the kill switch and the "Run judgement" button.
5. `/evidence`: the evaluation results.
6. `/profile#approvals`: the farmer's approval queue for agent proposals.
7. `/activity`: the chat action log (tool calls, figure checks, decisions, snapshots).

### Architecture

A Next.js App Router frontend reads only through `lib/data.ts`. The engine in `lib/engine/` (calibration, Monte Carlo, backtest) computes every figure. Phase one (`lib/assess/phase-one.ts`) reads, screens and computes, then publishes the numbers. Phase two (`lib/agents/risk/run.ts`, route `app/api/judge/[runId]/route.ts`) runs the Gemini 4 Argon judge in our own loop with five declared functions. Every step is appended to a hash-chained trace (`lib/trace/chain.ts`) held in Supabase (`agent_events`) or in memory. Outside agents (an adviser's, a bank's) read the profile over MCP at `/api/mcp` (`get_risk_profile`, `covenant_view`, read-only). A Claude chat agent answers the farmer over iMessage with read-only tools.

| Role | Model id | May do | May not do |
|---|---|---|---|
| Compute every number | our TypeScript engine (`lib/engine`) | Monte Carlo, P&L, DSCR, backtest, thresholds | judge |
| Read documents and photos | `gemini-3.8-flash` | turn a PDF or phone photo into text and fields, each with a verbatim quote | change anything |
| Screen free text | Jev `jev-latest` (TypeSafe) | return the probability that text tries to instruct the AI | arithmetic, prose |
| Judge and explain | `gemini-4-argon` (`thinking_level: medium`, Interactions API) | rank options, explain, flag document conflicts, say what would change its mind, propose changes | produce a number, write to the profile |
| iMessage replies | Claude (`ANTHROPIC_MODEL`) | answer "what if" questions with read-only tools | change anything |

The five functions the judge may call: `get_engine_results`, `get_documents`, `get_profile` (read-only), `propose_change` (writes only to the approval queue, and only with a verbatim quote from a screened document), `submit_judgement` (ends the turn). Nothing else runs.

## Traceable reasoning (25%)

- **Calculation is separate from judgement.** Every figure comes from `lib/engine/` (seed and config hash on each run). Gemini 4 Argon reads results only through the five functions above and cannot produce a number. The trace page labels each event Computed (code), Decided (Jev), Read (Gemini 3.8 Flash) or Judged (Gemini 4 Argon).
- **From raw data to output.** On `/trace/[runId]` each cited £ figure links to its function result, then the observation, then the source. A risk page's "View trace" link lands on the figure's row with its formula, inputs and source (`docs/eval/screenshots/trace-figure-anchor.png`). The risk page keeps a hand-checkable closed-form working beside the simulation's 1-in-20 figure, with seed and path count (`risk-simulation-check.png`).
- **The model's text is checked by code.** `checkFiguresStrict` in `lib/agents/checker.ts` NFKC-normalises every string field of the judgement and blocks any digit that does not match an engine figure with the same unit and sign, gain words in front of a negative figure, and unknown figure ids. A blocked run's explanation is withheld on the trace page. In the 2 live runs under the strict checker, it passed every figure (`docs/eval/run-timings.md`, runs 7 and 8).
- **Documents are quoted, not paraphrased.** Gemini 3.8 Flash returns each field with a quote; `lib/agents/documents/extract.ts` keeps a field only if the quote is in the document text. A proposal needs a quote from this run's document that contains the value.
- **What would change its mind.** The judgement schema (`lib/agents/risk/schema.ts`) has a required `change_my_mind` list; each entry must name an engine threshold id, and the strict checker rejects unknown ids. Each risk page also shows, worked out in code, the exposure at which the risk's score moves or the farm comes back inside its loss limit (`lib/what-would-change.ts`).
- **Every step is recorded.** Each event's hash is `sha256(prev_hash || canonical({seq,type,actor,body}))`; the trace page recomputes the chain and shows whether it is intact, with the Gemini interaction id on every model turn (`trace-published.png`, `trace-published-judgement.png`).

## Testing on unseen data (25%)

All results were produced on 8 Nov 2026 from committed code and data. Full write-up: [`docs/eval/README.md`](docs/eval/README.md). Nothing here is real-world trading or lending performance.

### Simulation backtest ([`docs/eval/backtest.md`](docs/eval/backtest.md), raw `backtest.json`)

Config hash `17b55fc0fe1a0b73`. One-month-ahead 5th and 95th percentiles, one forecast a month after a 36-month warm-up, each fitted only on data up to its month. 115 forecasts per series (2017–2026); origins from 2024 are held out (n = 31). Target: 5% breaches each side. Benchmarks: a normal distribution refitted each month (`normal_refit`) and historical simulation (`hist_sim`). Real market history (Defra, Bank of England).

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
- Held-out origins (n = 31) have wide intervals, for example wheat 0.0% (0.0%–11.0%) and barley 6.5% (1.8%–20.7%); see the table in `backtest.md`.
- Whole farm, harvests 2019–2025: 0 / 7 realised profits fell outside P5–P95. That is n = 7 and descriptive only, and the 2022 row is price-only because Defra has no 2022 East Midlands yield.

### Input screen ([`docs/eval/screen-eval.md`](docs/eval/screen-eval.md), raw `screen-eval.json`)

Jev `jev-latest`, injection probability ≥ 0.5 → quarantined. The threshold was fixed before the run and not tuned on these results. 95% Wilson intervals.

| Set | n | Caught | False alarms |
|---|---|---|---|
| Public: deepset/prompt-injections test split (Apache-2.0) | 116 | 46 / 60 = 76.7% (64.6%–85.6%) | 0 / 56 = 0% (0%–6.4%) |
| Farm text (synthetic) | 20 | 10 / 10 = 100% (72.2%–100%) | 0 / 10 = 0% (0%–27.8%) |
| Farm photos (synthetic, read by Gemini 3.8 Flash first) | 10 | 5 / 5 = 100% (56.6%–100%) | 0 / 5 = 0% (0%–43.4%) |
| All | 146 | 61 / 75 = 81.3% (71.1%–88.5%) | 0 / 71 = 0% (0%–5.1%) |

- **Misses:** Jev missed 14 / 60 deepset injections, all listed in `screen-eval.md`. The closest is deepset-111 (misspelt "igmre", p = 0.42).
- The farm attack texts were written by an AI subagent that did not see the screen code, and they are mostly overt. The photo set is only n = 10, so its intervals are wide. The images are rendered documents, not real phone photos.
- **A bad input caught on screen:** a contract photo with a printed instruction is read out by Flash, caught by Jev, and the run is held before any judge call (`docs/eval/screenshots/trace-held-injection-photo.png`).

### Judge runs ([`docs/eval/run-timings.md`](docs/eval/run-timings.md))

Gemini 4 Argon, `thinking_level: medium`, live calls; cost computed in code from each interaction's `usage`.

- p50 43.5 s and $0.042 per run over the 6 live runs that reached the judge (31.3, 33.6, 43.0, 44.0, 57.4 and 69.0 s; 2–3 turns each). The first 3 alone gave p50 43 s, $0.043.
- All 6 ended `published`; the last 2 ran under the strict figure checker and it passed them. The 2 injection inputs were held at the screen: no Argon call, $0.
- One run took 69.0 s, over Vercel Hobby's 60 s route limit. Six runs is a small sample.

## Risk controls and oversight (15%)

### Controls enforced in code

None of these rely on the prompt. Tests with scripted clients are in `tests/risk-agent.test.ts`, `tests/judge-route.test.ts`, `tests/trace.test.ts`, `tests/screen.test.ts`, `tests/migration.test.ts`, `tests/chat-agent.test.ts` and `tests/middleware.test.ts`.

| Control | Enforced in |
|---|---|
| Kill switch: checked between steps and before each function call; aborts the in-flight Gemini request; run ends `killed` | `lib/agents/risk/run.ts` |
| Kill switch fails closed: a missing or unreadable controls row counts as paused | `lib/server/agent-store.ts` |
| Function allowlist: only the five declared functions run; any other name gets `tool.denied` | `lib/agents/risk/tools.ts` (`TOOL_DECLARATIONS`, `TOOL_NAMES`), `lib/agents/risk/run.ts` |
| Turn cap, budget cap from the API's `usage` (missing usage also stops the run), 270 s overall deadline | `lib/agents/risk/run.ts` |
| Proposal cap; a proposal needs a quote of at least 8 characters from this run's document that contains the value, a catalogue key and a parseable value; label and current value come from code | `lib/agents/risk/tools.ts` |
| One judge per run: atomic claim, a second request gets 409 | `lib/server/agent-store.ts` (`claimRun`), `app/api/judge/[runId]/route.ts` |
| Strict figure checker: untraced figure → run `blocked`, explanation withheld | `lib/agents/checker.ts` (`checkFiguresStrict`), `lib/agents/risk/run.ts` |
| Judgement shape validated with zod | `lib/agents/risk/schema.ts` |
| Input screen: Jev on file name, text and extracted values together; a price that fails the z-score check holds the run | `lib/screen/screen.ts`, `lib/assess/phase-one.ts` |
| Reader quote check: a field is kept only if its quote is in the document text | `lib/agents/documents/extract.ts` |
| No agent writes the profile: proposals go to `pending_changes`; the `risk_agent` database role has no write grant on `profile_fields` | `lib/agents/risk/tools.ts`, `supabase/migrations/0005_agent_runs.sql` |
| Append-only trace: triggers reject update, delete and truncate on `agent_events` and `observations` | `supabase/migrations/0005_agent_runs.sql` |
| Hash chain over every event, verified on read | `lib/trace/chain.ts` (`verifyChain`) |
| iMessage and in-app chat agent is read-only; every figure in a reply must match a tool result or the farmer's message in size and direction; one rewrite, then the reply is held back and the turn logged `blocked` (fails closed) | `lib/agents/chat/tools.ts`, `lib/agents/chat/agent.ts`, `lib/agents/checker.ts` |
| Loss limit: the largest loss the farmer says the farm can take is checked against the whole-farm 1-in-20 bad year and each risk alone; shown on the overview, each risk page and in the chat tools; an unconfirmed limit is flagged, not treated as final | `lib/limits.ts` |
| Input checks: believable maximum per unit, UK date order, one number per field, and checks across fields (crop area vs land farmed, forward sales vs the crop); they block saving, approving a proposed change and updating the risk profile | `lib/profile/values.ts`, `lib/profile/checks.ts`, `lib/data.ts` |
| Password lock: with `HEDGED_PASSWORD` set, every page, server action and API route asks for it (HTTP Basic); the Inkbox webhook and `/api/mcp` keep their own checks (signature, bearer `MCP_TOKEN`) | `middleware.ts` |
| Sender allow-list: with `INKBOX_ALLOWED_SENDERS` set, the iMessage agent answers only those senders | `lib/agents/chat/imessage.ts` |
| In-app question cap, counted from the shared chat log so it holds across serverless instances | `lib/agents/chat/web.ts` |
| Chat action log at `/activity`: every chat turn with its tool calls and figure checks, every approval decision, every snapshot | `lib/data.ts` (`getActivity`), `app/activity/page.tsx` |

**Human in the loop.** The farmer approves or rejects each proposed change with a tap at `/profile#approvals` (`docs/eval/screenshots/approvals-agent-proposal.png`). The approve or reject is appended to the run's chain.

**A control firing on screen.** The kill switch stopped a live run mid-judgement; the run ended `killed` with the chain intact (`docs/eval/screenshots/kill-switch-fired.png`, `kill-switch-fired-events.png`). The injection photo was held before any judge call (`trace-held-injection-photo.png`). The loss limit fires in the UI: the overview banner turns red when the whole-farm 1-in-20 bad year is past the farmer's limit, and each risk page shows whether the options added bring it back inside (`lib/limits.ts`). The other controls (budget, turn and proposal caps, 270 s deadline, denied function, figure checker block, non-verbatim quote, second judge request) fire only in the scripted tests; none fired in the live runs.

### EU AI Act record-keeping

Hedged is not claimed to be a high-risk system. Article 12(3) applies only to Annex III point 1(a) (remote biometric identification); Annex III 5(b) covers natural persons, while Fenland Ridge is a Ltd; and the Act does not reach a UK farm and UK bank directly. The logging is still designed to Article 12(1)–(2).

| Article 12 | What the trace stores |
|---|---|
| 12(1) automatic recording of events over the system's lifetime | Every run writes `agent_runs` (stage times, model, prompt version, config hash, seed, status, cost, tokens, turns) and appends each step to `agent_events` with a timestamp. Nothing is written by hand. |
| 12(2)(a) identifying situations that may present a risk | Screen decisions (question, probability, threshold, action), `checker.result` (each number and the result it matched, or untraced), and every `control.*` event (kill switch, budget, turn, proposal caps, deadline) |
| 12(2)(b) post-market monitoring | Run status (`published`, `held`, `blocked`, `killed`, `failed`), screen quarantines, the engine config hash and seed on every run |
| 12(2)(c) monitoring operation | Every model call (model id, Gemini interaction id, usage and running cost), every function call and result or refusal, the reader's fields and quotes, and each human approval or rejection |
| Integrity | `agent_events` is append-only and hash-chained: DB triggers forbid update, delete and truncate; `verifyChain` recomputes the chain and the trace page shows the result |

**Persistence.** On Vercel the trace persists only with `supabase/migrations/0005_agent_runs.sql` applied and `AGENT_TABLES=1`; otherwise runs are held in memory and do not survive across serverless invocations. **Retention** is indefinite by design: the tables are append-only and there is no delete path. That is designed to exceed the 6-month minimum in Articles 19 and 26(6); we do not claim compliance.

## Relevance and impact (20%)

- **Named user:** a UK arable farmer (Fenland Ridge Farm Ltd, fictional) deciding what to sell forward, what to buy now and what to fix, with a bank reading the same numbers over MCP (`covenant_view` gives the debt-service cover view).
- **The decision it supports:** each risk is shown as the £ hit in a 1-in-20 bad year and a 1–10 score from that hit as a share of typical profit (`lib/score.ts`), with the options that would reduce it.
- **A failure handled on screen:** a forward contract the profile does not know about. The farmer photographs it at `/documents`; Flash reads "Quantity: 200 tonnes"; Jev passes it; the judge flags the conflict with the profile (0 t) and proposes `sales.wheat_2027_forward_t` 0 → 200; the farmer approves it at `/profile#approvals` (runs 4, 6 and 8 in `docs/eval/run-timings.md`).
- **A second failure handled on screen:** a manipulated document (an email or a photo with an injected instruction) is held before the judge runs, and nothing changes in the profile.
- The farmer can also ask over iMessage ("what if…?") and get answers computed by code.

## Ambition and technical quality (15%)

- **A phone photo becomes a checked, approvable profile change:** Flash reads, Jev screens, code computes, Argon judges, code checks, the farmer taps. A conventional program cannot read the photo or explain the trade-off; here the LLM does only those parts.
- **Engine built for this:** seeded PRNG and Student-t draws, Ledoit-Wolf shrunk correlation, quantile, Wilson, Kupiec, Christoffersen and pinball statistics (`lib/engine/rng.ts`, `linalg.ts`, `stats.ts`), a 10,000-path Monte Carlo with options, DSCR and thresholds (`lib/engine/simulate.ts`), and a monthly walk-forward backtest that calls the same simulation (`lib/engine/backtest.ts`).
- **Our own agent loop** over the Gemini Interactions API, with the controls above, rather than a framework.
- **Two modalities in one loop:** vision (Gemini 3.8 Flash on PDFs and photos) and reasoning over function results (Gemini 4 Argon).
- **Read access for outside agents** over MCP (`/api/mcp`, bearer `MCP_TOKEN`, read-only).

## Limits

- The Monte Carlo does not beat a normal refit, only historical simulation. Nitrogen (AN) breaches cluster in 2021–23 (Christoffersen p ≈ 0.00), and high-side breaches run above 5% for barley, rape and fuel. The Student-t tails and the nitrogen factor were chosen knowing 2022 happened.
- The monthly backtest checks each factor's tails, not their joint structure. Regulation is not backtested.
- The whole-farm check (harvests 2019–2025, 0 / 7 outside P5–P95) is n = 7 and descriptive only; Defra has no 2022 East Midlands yield, so the 2022 row is price-only.
- The farm attack texts were written by an AI subagent (it did not see the screen code). The photo set is n = 10. All farm data, documents and photos are synthetic.
- Jev catches injected instructions, not a forged figure with no instruction. The reader's quote check and the farmer's approval step cover those.
- Judge timing is 6 live runs; p50 43.5 s is close to Vercel Hobby's 60 s cap and one run took 69 s. `/api/judge` asks for 300 s, so it needs Vercel Pro, or run the judge locally with `bun run agent:demo`.
- Live, only the kill switch and the screen hold have fired. The other controls fire only in scripted tests.
- On Vercel, set `AGENT_TABLES=1` and apply `supabase/migrations/0005_agent_runs.sql`: the in-memory agent store does not survive across serverless invocations.
- Unless `HEDGED_PASSWORD` is set, every server action in `lib/data.ts` is public, so anyone can call `setPaused(false)` and restart a stopped agent. The password is one shared secret, not per-user authentication; that is a next step.
- DSCR leaves out the depreciation add-back, because the profile has no depreciation field.
- The `backtest_results` table is never written; the backtest output lives in `docs/eval/backtest.json`.
- The judge's strict checker does not parse spelled-out numbers ("one in four"). The chat checker flags some worded amounts ("a hundred and fifty thousand pounds", "twenty per cent"), not every form.
- The `assessments` columns `run_id`, `status` and `head_hash` are not written; the assessment's run and its current head are resolved when it is read.
- `/trace` with no run id shows the latest run, which may not be the run behind the assessment on screen.
- The closed-form working on each risk page (exposure × a price or yield swing × 1.65, risks combined as independent swings, √ of the sum of squares) uses normal tails, which understate extreme years, and no natural hedge between price and yield. Minimum-price contracts are modelled like forward sales; the what-if moves one driver at a time from the snapshot; there is one demo farm.
- This README cites no survey or interviews of farmers; the user need is stated, not measured here.

## Run it

Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui.

```bash
bun install
bun run dev        # http://localhost:3000 → /overview
bun run test       # vitest run
```

Without keys the app runs on in-memory demo data; without `GEMINI_API_KEY`, phase one publishes numbers only and uploads are held for the farmer.

### Database (Supabase)

Without `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` the app runs on in-memory demo data. With them:

1. In the Supabase SQL editor, run the migrations in order, then `supabase/seed.sql`:
   - `supabase/migrations/0001_risk_profile.sql`: farm profile, snapshots, assessments, approval queue, market data, signals
   - `supabase/migrations/0002_chat_log.sql`: `chat_turns`, the chat agent's action log
   - `supabase/migrations/0003_chat_channel.sql`: one chat history across iMessage and the in-app assistant
   - `supabase/migrations/0004_chat_memory.sql`: `chat_memory`
   - `supabase/migrations/0005_agent_runs.sql`: agent runs, observations, the append-only trace, controls, the restricted `risk_agent` role (renumbered from 0003)
2. For the restricted role, set a password: `alter role risk_agent with login password '<strong password>';`. Check that `update agent_events set type='x'` fails with "append-only".
3. Restart the app. Until the tables exist it logs a warning and keeps using demo data.

`supabase/seed.sql` is generated from the demo data (`lib/mock.ts`, `lib/profile/fenland-ridge.ts`): change those, then run `bun run db:seed-sql`. Re-running the seed resets the demo farm.

Routes: `/onboarding` (setup), `/overview`, `/risks/[id]`, `/what-if`, `/calendar`, `/profile`, `/activity` (chat action log), `/documents`, `/trace/[runId]` (agent runs), `/evidence`.

### Plugging in the backend

- `lib/types.ts`: shared interfaces (`Farm`, `RiskResult`, `Mitigation`, `PendingChange`, `CalendarItem`, `ProfitSummary`, …).
- `lib/data.ts`: the only data entry point for pages and components. Server functions: pages call them directly, client components call them as server actions.
- `lib/server/store.ts`: Supabase reads and writes, with the in-memory demo store as fallback. `lib/server/agent-store.ts`: the agent run store (memory, Supabase, or the `risk_agent` Postgres role).
- `lib/profile/`: the farm profile catalogue, the demo farm's profile, and the risk profile maths (exposures from a snapshot, news measured against it).
- `lib/mock.ts`: demo assessment, imported only by the data layer and the seed script.
- `lib/score.ts`: 1–10 score from bad-year hit as a % of typical profit.
- `lib/sim.ts`: the risk simulation and the what-if (built from the snapshot).
- `lib/what-would-change.ts`: the exposure at which each risk's score moves, or the farm comes back inside its loss limit.
- `lib/limits.ts`, `lib/profile/checks.ts`: the loss limit and the input checks (see Controls).

### iMessage assistant (Inkbox)

A chat agent that answers the farmer's questions about the risk profile, exposures, mitigations, news, profit and deadlines over iMessage.

- `lib/agents/chat/tools.ts`: read-only tools over the data layer and simulation code. Every figure is computed by code; there is no write tool.
- `lib/agents/chat/agent.ts`: Anthropic SDK tool runner (model from `ANTHROPIC_MODEL`). Short text-message replies; it answers only what was asked and gives no figures unprompted.
- `lib/agents/chat/memory.ts`: long-term memory. After each answered message the model folds the exchange into short running notes per farm, shared by iMessage and the in-app assistant (`chat_memory`, migration `0004_chat_memory.sql`). The agent sees the notes plus the last 24 messages verbatim. Notes hold no figures from past replies and never count as a source for the figure checker.
- `lib/agents/checker.ts`: every figure in a reply must appear in a tool result or the farmer's message, or the agent rewrites the reply.
- `app/api/inkbox/webhook/route.ts`: verifies the Inkbox signature, then answers in the same conversation. Every turn is logged in `chat_turns` (migration `0002_chat_log.sql`).

```bash
bun run ask "What's my biggest risk?"   # ask from the terminal, no iMessage needed
bun run ask --eval                      # run the question set in tests/chat-questions.json (figures, length, nothing unprompted)
bun run inkbox:setup https://your-app.vercel.app
```

`inkbox:setup` creates the agent identity with iMessage on, subscribes the webhook, prints the signing key for `INKBOX_WEBHOOK_SECRET` and the number to text with its `connect @handle` command.

### Risk agent and evaluation

```bash
bun run agent:demo                                   # phase 1 + judge from the terminal, memory store
bun run agent:demo --file data/demo/forward-contract.png
bun run backtest                                     # rewrites docs/eval/backtest.{json,md}
bun run screen:eval                                  # rewrites docs/eval/screen-eval.{json,md}
```

### Environment

Copy `.env.example` to `.env.local`. Everything except `NEXT_PUBLIC_*` is server-side only. No key is committed.

| Variable | Use |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) | Chat agent |
| `INKBOX_API_KEY`, `INKBOX_AGENT_HANDLE` (default `fenland-ridge-risk`), `INKBOX_WEBHOOK_SECRET` | iMessage |
| `GEMINI_API_KEY` | Document reader and judge |
| `RISK_AGENT_MODEL` (default `gemini-4-argon`), `RISK_READER_MODEL` (default `gemini-3.8-flash`) | Model overrides |
| `AGENT_TABLES` | Set to `1` only after `0005_agent_runs.sql` is applied; required on Vercel |
| `RISK_AGENT_DATABASE_URL` | Optional Postgres URL for the restricted `risk_agent` role |
| `TYPESAFE_API_KEY` | Jev input screen. Without it, free text from outside sources is held for review |
| `MCP_TOKEN` | Bearer token for `/api/mcp`; unset disables the route |
| `HEDGED_PASSWORD` | Optional password for the whole deployed app (HTTP Basic, any username); unset = open |
| `INKBOX_ALLOWED_SENDERS` | Optional comma-separated senders the iMessage agent answers; unset = anyone who connects |

## Data and licences

| Data | Source | Licence | Real or synthetic |
|---|---|---|---|
| Price indices for feed wheat, feed barley, oilseed rape, nitrogen fertiliser and motor fuels, monthly from 2014 | Defra Agricultural Price Index | Open Government Licence v3.0 | Real, committed with URL and sha256 in `data/history.json` |
| Wheat, barley and oilseed rape yields, East Midlands | Defra cereal and oilseed production | Open Government Licence v3.0 | Real, in `data/history.json` |
| Bank Rate, month-end | Bank of England IADB (IUDBEDR) | Bank of England, free reuse with attribution | Real, in `data/history.json` |
| Prompt-injection test split (116 rows) | deepset/prompt-injections, Hugging Face | Apache-2.0 | Public dataset, labels as published |
| Fenland Ridge Farm Ltd profile and demo assessment | `lib/profile/fenland-ridge.ts`, `lib/mock.ts`, `supabase/seed.sql` | made for this project | Synthetic, written by the team; the farm is fictional |
| Demo documents and photos (`data/demo/`) | Generated by `scripts/make-demo-docs.py` (Pillow) | made for this project | Synthetic |
| Farm attack and clean texts (`data/eval/farm-attacks.json`) | Written by an AI subagent that did not see the screen code | made for this project | Synthetic |
| Farm photo cases (`data/eval/image-attacks/`) | 10 rendered documents made by the team, 5 with a printed instruction | made for this project | Synthetic |
| Live adapters, not yet wired into the figures (`lib/live.ts`) | AHDB delivered prices and fertiliser series; Bank of England Bank Rate and SONIA; Open-Meteo forecast and soil moisture | AHDB terms; Bank of England terms; CC BY 4.0 | Real; endpoints and licences in `docs/architecture.md` §3 |

The history is loaded by `scripts/load-history.ts`. No real financial records, account details or logins are used.
