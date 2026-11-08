# Hedged

Risk intelligence for UK farmers (hackathon project). The product is called **Hedged**; use that name in the UI. Look and feel: `docs/design-system.md` (tokens in `tailwind.config.ts` and `app/globals.css`). It builds a farm's risk profile from its own data, tracks prices, inputs, weather, rates and policy, and shows in £ what each risk could cost and which options would reduce it. Demo farm: Fenland Ridge Farm Ltd (fictional, 450 ha near Sleaford, Lincolnshire).

## Codebase

```
app/                    pages: onboarding (setup flow), overview, risks, risks/[id], what-if, profile, calendar, activity (action log)
                        api/inkbox/webhook   iMessage in → chat agent → reply
                        api/assistant        in-app "Ask Hedged" panel, same agent
components/headwind/    app components; ui/ = shadcn
lib/data.ts             the only data import for components (server functions + actions)
lib/server/store.ts     Supabase if configured and seeded, else in-memory demo data
lib/profile/            catalogue (field → risks), risk-profile (exposure × news, no LLM),
                        assess (stand-in engine: rescales the demo assessment to a new snapshot)
lib/sim.ts, score.ts    simulation, what-if and 1–10 scoring maths
lib/figures.ts          the working behind every clickable £ figure
lib/limits.ts           the farm's loss limit (ins.max_loss) checked in code
lib/what-would-change.ts   exposure at which a risk's score moves or the farm is back inside its limit
lib/profile/checks.ts   cross-field input checks; block saves, approvals and snapshots
middleware.ts           optional HEDGED_PASSWORD for a deployed demo
lib/live.ts             live market/rate/weather adapters (not wired in yet; check: bun scripts/live-check.ts)
lib/agents/checker.ts   blocks reply figures no tool or user message contains
lib/agents/chat/        iMessage agent: tools (read-only), agent (prompt + checker retry),
                        memory (shared running notes), history, imessage + inkbox + web (wiring)
lib/mock.ts, profile/fenland-ridge.ts   demo data, also the source of supabase/seed.sql
scripts/                ask (chat CLI + eval: bun run ask --eval), generate-seed, inkbox-setup
lib/engine/             Monte Carlo risk engine (10k paths, seed 42, no LLM), backtest; run by assess() via lib/assess/phase-one.ts
lib/agents/risk/        judge (Gemini 4 Argon, Interactions API): allowlisted tools, caps, strict figure checker; POST /api/judge/[runId]
lib/agents/documents/   document reader (Gemini 3.8 Flash); lib/screen/ Jev injection screen + number z-score
lib/trace/              hash-chained append-only run log; pages trace, documents, evidence
app/api/mcp             MCP server for outside agents (get_risk_profile, covenant_view, bearer MCP_TOKEN, read-only)
```

**Five risks** (ids): `output_prices`, `input_prices`, `weather_yield`, `regulation`, `interest_rates`.

**Supabase** (keyed by `farm_id`, migrations in `supabase/migrations/`, run in order; seed via `bun run db:seed-sql`): `farms`, `profile_fields`, `profile_sections`, `profile_snapshots`, `assessments`, `pending_changes`, `market_data`, `signals`, `signal_impacts`, views `latest_assessment`/`latest_snapshot`, `chat_turns` (chat action log, both channels), `chat_memory` (chat notes per farm; context only, never a figure source).

**Risk profile flow:** farmer edits profile → "Update risk profile" freezes a snapshot → assessment built from it → each signal measured against the snapshot in code → impacts over £5k become alerts.

**Chat agent:** one conversation across iMessage and the in-app panel. Short replies, answers only what was asked, no figures unprompted. Sees shared memory notes + last 24 messages from `chat_turns`. Every figure from a tool; checker forces a rewrite otherwise. Its only write: propose a profile change (`propose_profile_change`), applied by `confirm_profile_change` only after the farmer's plain YES, checked in code (`lib/agents/chat/confirm.ts`).

## Status and next steps

Done: data layer + Supabase, profile/onboarding UI, risk profile + snapshots, approval queue, what-if, iMessage chat agent with memory, live data adapters.
Next, in order: real engine + `/api/assess` (replace `lib/profile/assess.ts`) → writer agent → onboarding agent (documents → `pending_changes`) → iMessage alerts → MCP server → wire `lib/live.ts` into cron jobs.

## Rules

- **Numbers come from code, never the LLM.** Claude extracts, explains and ranks.
- **Only the farmer changes the profile.** Agents, iMessage and MCP write only to `pending_changes`. The chat agent applies a change only after the farmer's plain YES to that exact change, shown in an earlier message; this is checked in code (`lib/agents/chat/confirm.ts`), never left to the model.
- **Don't change UI types or layout** unless asked. Components import data only from `lib/data.ts`.
- **Secrets server-side only** (`SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, Inkbox keys). Never `NEXT_PUBLIC_`.
- **Runs without keys:** fall back to demo data.
- **Mitigations are options, not advice:** "options to discuss with your merchant, adviser or bank".
- Small steps, one commit each; `npm run build` and `npm test` must pass.

## Stack and env

Next.js 14 (App Router, TS), Tailwind, shadcn/ui, Supabase, Anthropic SDK (model from `ANTHROPIC_MODEL`), Inkbox (iMessage), Vercel. Env vars in `.env.example`; `INKBOX_AGENT_HANDLE` defaults to `fenland-ridge-risk` (the live identity is `diddy`).

## Judging criteria

Judged hackathon entry. Before building a feature, say which rubric criterion it moves; if none, flag it and skip it.

@docs/hackathon/BRIEF.md
