# agentverse

## Headwind (frontend demo)

AI risk agent for UK arable farms. Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui. All figures are fictional demo data.

```bash
bun install
bun run dev   # http://localhost:3000 → /overview
bun run test
```

### Database (Supabase)

Without `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` the app runs on in-memory demo data. With them:

1. In the Supabase SQL editor, run `supabase/migrations/0001_risk_profile.sql`, then `supabase/seed.sql`.
2. Restart the app. Until the tables exist it logs a warning and keeps using demo data.

`supabase/seed.sql` is generated from the demo data (`lib/mock.ts`, `lib/profile/fenland-ridge.ts`): change those, then run `bun run db:seed-sql`. Re-running the seed resets the demo farm.

Routes: `/overview`, `/risks/[id]`, `/what-if`, `/calendar`, `/profile`, `/documents`, `/trace/[runId]`, `/evidence`.

### Plugging in the backend

- `lib/types.ts`: shared interfaces (`Farm`, `RiskResult`, `Mitigation`, `PendingChange`, `CalendarItem`, `ProfitSummary`, …).
- `lib/data.ts`: the only data entry point for pages and components. Server functions: pages call them directly, client components call them as server actions.
- `lib/server/store.ts`: Supabase reads and writes, with the in-memory demo store as fallback.
- `lib/profile/`: the farm profile catalogue, the demo farm's profile, and the risk profile maths (exposures from a snapshot, news measured against it).
- `lib/mock.ts`: demo assessment, imported only by the data layer and the seed script.
- `lib/score.ts`: 1–10 score from bad-year hit as a % of typical profit.
- `lib/sim.ts`: client-side demo maths for the risk pages and the what-if.

### iMessage assistant (Inkbox)

A chat agent that answers the farmer's questions about the risk profile, exposures, mitigations, news, profit and deadlines over iMessage.

- `lib/agents/chat/tools.ts`: read-only tools over the data layer and simulation code. Every figure is computed by code; there is no write tool.
- `lib/agents/chat/agent.ts`: Anthropic SDK tool runner (model from `ANTHROPIC_MODEL`). Short text-message replies; it answers only what was asked and gives no figures unprompted.
- `lib/agents/chat/memory.ts`: long-term memory. After each answered message the model folds the exchange into short running notes per farm, shared by iMessage and the in-app assistant (`chat_memory`, run `supabase/migrations/0004_chat_memory.sql`). The agent sees the notes plus the last 24 messages verbatim. Notes hold no figures from past replies and never count as a source for the figure checker.
- `lib/agents/checker.ts`: every figure in a reply must appear in a tool result or the farmer's message, or the agent rewrites the reply.
- `app/api/inkbox/webhook/route.ts`: verifies the Inkbox signature, then answers in the same conversation. Every turn is logged in `chat_turns` (run `supabase/migrations/0002_chat_log.sql`).

Environment (server-only): `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `INKBOX_API_KEY`, `INKBOX_AGENT_HANDLE` (default `fenland-ridge-risk`), `INKBOX_WEBHOOK_SECRET`.

```bash
bun run ask "What's my biggest risk?"   # ask from the terminal, no iMessage needed
bun run ask --eval                      # run the question set in tests/chat-questions.json (figures, length, nothing unprompted)
bun run inkbox:setup https://your-app.vercel.app
```

`inkbox:setup` creates the agent identity with iMessage on, subscribes the webhook, prints the signing key for `INKBOX_WEBHOOK_SECRET` and the number to text with its `connect @handle` command.

## Models and the verification loop

Named user: a UK arable farmer (Fenland Ridge Farm Ltd, a fictional 450 ha farm near Sleaford) deciding what to sell forward, what to buy now and what to fix, with a bank reading the same numbers over MCP.

| Role | Model id | May do | May not do |
|---|---|---|---|
| Compute every number | our TypeScript engine (`lib/engine`) | Monte Carlo, P&L, DSCR, backtest, thresholds | judge |
| Read documents and photos | `gemini-3.8-flash` | turn a PDF or phone photo into text and fields, each with a verbatim quote | change anything |
| Screen free text | Jev `jev-latest` (TypeSafe) | return the probability that text tries to instruct the AI | arithmetic, prose |
| Judge and explain | `gemini-4-argon` (`thinking_level: medium`, Interactions API) | rank options, explain, flag document conflicts, say what would change its mind, propose changes | produce a number, write to the profile |
| iMessage replies | Claude (`ANTHROPIC_MODEL`) | answer "what if" questions with read-only tools | change anything |

Loop: photo or PDF → Gemini 3.8 Flash extracts text and quoted fields → Jev screens the text (quarantine on injection) → the engine simulates 10,000 years → Gemini 4 Argon reads the results through five declared functions and submits a judgement → the figure checker (code) blocks any number the engine did not produce → the farmer approves each proposed change with a tap. Every step, with the Gemini interaction id, is appended to a hash-chained log you can verify on the Trace page.

Controls in code: function allowlist, turn cap, budget cap computed from `usage` (missing usage also stops the run), proposal cap, a 270 s overall deadline, kill switch (checked between steps and aborting the in-flight request; a missing or unreadable controls row counts as stopped), one judge per run (atomic claim, a second request gets 409), and an append-only trace where each event's hash covers `sha256(prev_hash || canonical({seq,type,actor,body}))`. The strict figure checker (NFKC-normalised, every string field of the judgement) blocks any digit that does not match an engine figure with the same unit and sign, gain words in front of a negative figure, and unknown figure ids; a blocked run's explanation is withheld. Jev screens the file name, the text and the values Flash extracted together; a price that fails the z-score check holds the run. A proposal needs a quote of at least 8 characters from this run's document that contains the value, a catalogue key and a parseable value; its label and current value come from code. The farmer's approve or reject is appended to the run's chain. Keys live only in environment variables (`GEMINI_API_KEY`, `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`); none are committed.

The five functions the judge may call: `get_engine_results`, `get_documents`, `get_profile` (read-only), `propose_change` (writes only to the approval queue, and only with a verbatim quote from a screened document), `submit_judgement` (ends the turn). Nothing else runs.

```bash
bun run agent:demo                                   # phase 1 + judge from the terminal, memory store
bun run agent:demo --file data/demo/forward-contract.png  
bun run backtest                                     # rewrites docs/eval/backtest.{json,md}
bun run screen:eval                                  # rewrites docs/eval/screen-eval.{json,md}
```

### Evidence

Full write-up with links: [`docs/eval/README.md`](docs/eval/README.md). The three headline numbers:

- **Simulation backtest** (monthly walk-forward, 2017–2026, 115 one-month-ahead forecasts per series, 5 price series): the Monte Carlo's 1-in-20 low-side breach rate is 3.5%–8.7% against a 5% target, and Kupiec does not reject it for any series. It does **not** beat a plain normal refit (pinball loss about equal); it does beat historical simulation on pinball loss for every series.
- **Input screen** (Jev, threshold 0.5 fixed before the run): on the public deepset/prompt-injections test split (n = 116) it caught 46 / 60 injections, 76.7% (95% CI 64.6%–85.6%), with 0 / 56 false alarms (0%–6.4%). Synthetic farm texts 10 / 10 caught, 0 / 10 false alarms; synthetic farm photos 5 / 5 caught, 0 / 5 false alarms.
- **Judge** (Gemini 4 Argon, live): p50 43.5 s and $0.042 per run over 6 runs that reached the judge (31–69 s, one over 60 s; the first 3 alone gave p50 43 s). All 6 ended `published`, the last 2 under the strict figure checker. The 2 injection inputs were held before any Argon call.

### Limits

- The Monte Carlo does not beat a normal refit, only historical simulation. Nitrogen (AN) breaches cluster in 2021–23 (Christoffersen p ≈ 0.00), and high-side breaches run above 5% for barley, rape and fuel. The Student-t tails and the nitrogen factor were chosen knowing 2022 happened.
- The whole-farm check (harvests 2019–2025, 0 / 7 outside P5–P95) is n = 7 and descriptive only; Defra has no 2022 East Midlands yield, so the 2022 row is price-only.
- The farm attack texts were written by an AI subagent (it did not see the screen code). The photo set is n = 10. All farm data, documents and photos are synthetic.
- Judge timing is 6 live runs; p50 43.5 s is close to Vercel Hobby's 60 s cap and one run took 69 s. `/api/judge` asks for 300 s, so it needs Vercel Pro, or run the judge locally with `bun run agent:demo`.
- On Vercel, set `AGENT_TABLES=1` and apply `supabase/migrations/0005_agent_runs.sql`: the in-memory agent store does not survive across serverless invocations.
- Every server action in `lib/data.ts` is public, so in the demo anyone can call `setPaused(false)` and restart a stopped agent. Real authentication is a next step.
- DSCR leaves out the depreciation add-back, because the profile has no depreciation field.
- The `backtest_results` table is never written; the backtest output lives in `docs/eval/backtest.json`.
- The figure checker does not parse spelled-out numbers ("one in four"), so a figure written in words is not checked.
- The `assessments` columns `run_id`, `status` and `head_hash` are not written; the assessment's run and its current head are resolved when it is read.
- `/trace` with no run id shows the latest run, which may not be the run behind the assessment on screen.
