# Farm risk agent

AI risk agent for UK arable farms (hackathon project, no product name yet: don't invent one in code or UI). It builds a risk profile of a farm from its own documents, tracks crop prices, fertiliser, weather, interest rates and policy, and shows in pounds what each risk could cost and which options would reduce it.

## Goal for the demo

One fictional farm (Fenland Ridge Farm Ltd, 450 ha near Sleaford, Lincolnshire), end to end:
1. The farmer onboards by answering questions or dropping documents; an agent pre-fills the profile; the farmer confirms.
2. The engine simulates 10,000 possible years and scores each risk 1–10.
3. The dashboard shows risks, top mitigations and expected profit, with the working and sources behind every number.
4. When something moves, the farmer gets an iMessage alert with a suggested option and can reply "what if…?".
5. Outside agents (an adviser's, a bank's) can read the risk profile over MCP and propose updates.

## Architecture

```
Frontend (Next.js App Router) ── reads only through lib/data.ts
        │
Server actions + API routes (Vercel)
 ├─ lib/engine/        simulation engine: scenarios → risk modules → aggregation (pure TypeScript, no LLM)
 ├─ lib/agents/        Claude agents: writer (explains + ranks), onboarding (reads documents),
 │                     chat (iMessage replies with tools), checker (blocks untraceable numbers)
 ├─ /api/assess        run the engine, store a new assessment version
 ├─ /api/documents     document → extracted fields → approval queue
 ├─ /api/inkbox/*      iMessage in/out via Inkbox
 ├─ /api/mcp           MCP server for outside agents
 └─ /api/jobs/*        cron: market data, policy scan, calendar, freshness checks
        │
Supabase (Postgres + Storage), server-side access only
```

**Five risks** (module ids): `wheat_price`, `fertiliser`, `weather_yield`, `rates`, `schemes`.

**Data model** (Supabase, all tables keyed by `farm_id`): `farms`, `profile_fields` (one row per field with value, source, confidence, last confirmed, valid until), `documents`, `pending_changes` (approval queue), `market_data` (cached prices, rates, odds), `policy_items`, `assessments` (one row per engine run: `summary` + `risks` JSON matching `lib/types.ts`), `mitigations` (status: suggested / planned / done / dismissed), `calendar_items`, `alerts`. View `latest_assessment`.

## Rules

- **Numbers come from code, never from the LLM.** Claude extracts, explains and ranks; the engine computes every figure.
- **Only the farmer changes the profile.** Agents, freshness checks, iMessage and MCP only write to `pending_changes`.
- **Don't change the UI's types or layout** unless asked. Components import data only from `lib/data.ts`.
- **Secrets server-side only:** `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, Inkbox keys. Never `NEXT_PUBLIC_`.
- **Keep the app runnable without keys:** fall back to mock data if env vars are missing.
- **Mitigations are options, not advice:** "options to discuss with your merchant, adviser or bank".
- Work in small steps, one commit per step, `npm run build` must pass before moving on.

## Stack

Next.js (App Router, TypeScript), Tailwind, shadcn/ui, Supabase (`@supabase/supabase-js`), Anthropic SDK (`@anthropic-ai/sdk`, model from `ANTHROPIC_MODEL`), Inkbox for iMessage, MCP TypeScript SDK, Vercel (hosting + cron).

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
```

## Build order

1. Database + data layer: schema, seed, `lib/data.ts` reads Supabase
2. Engine + `/api/assess`
3. Writer agent + checker
4. Onboarding agent (documents)
5. iMessage chat agent + alerts (Inkbox)
6. MCP server
7. Data fetchers + cron jobs

## Judging criteria

This is a judged hackathon entry. Before proposing or building a feature, say which rubric criterion it moves; if it moves none, flag it and skip it. Full brief, rubric and submission rules:

@docs/hackathon/BRIEF.md
