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

Routes: `/overview`, `/risks/[id]`, `/what-if`, `/calendar`, `/profile`.

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
