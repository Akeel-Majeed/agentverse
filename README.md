# agentverse

## Hedged

Risk intelligence for UK arable farms. Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui. All figures are fictional demo data (see Data below).

```bash
bun install
bun run dev   # http://localhost:3000 → /overview
bun run test
```

### Database (Supabase)

Without `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` the app runs on in-memory demo data. With them:

1. In the Supabase SQL editor, run every file in `supabase/migrations/` in order (`0001` risk profile, `0002` chat log, `0003` chat channel, `0004` chat memory), then `supabase/seed.sql`.
2. Restart the app. Until the tables exist it logs a warning and keeps using demo data.

`supabase/seed.sql` is generated from the demo data (`lib/mock.ts`, `lib/profile/fenland-ridge.ts`): change those, then run `bun run db:seed-sql`. Re-running the seed resets the demo farm.

Routes: `/onboarding` (setup), `/overview`, `/risks/[id]`, `/what-if`, `/calendar`, `/profile`, `/activity` (action log).

### Controls enforced in code

- **Loss limit** (`lib/limits.ts`): the largest loss the farmer says the farm can take is checked against the whole-farm 1-in-20 bad year and each risk alone. Overview banner, live status on each risk page as options are added, and in the chat tools. Unconfirmed limits are flagged, not treated as final.
- **Input checks** (`lib/profile/values.ts`, `lib/profile/checks.ts`): believable maximum per unit, UK date order, one number per field, and checks across fields (crop area vs land farmed, forward sales vs the crop). They block saving, approving a proposed change and updating the risk profile.
- **Only the farmer changes the profile**: agents, iMessage and adviser feeds write to the approval queue; the chat agent has read-only tools.
- **Figure checker** (`lib/agents/checker.ts`): every figure in a reply must match a tool result in size and direction; one rewrite, then the reply is held back.
- **Action log** (`/activity`): every chat turn with its tool calls and checks, every approval decision, every snapshot.
- **Deployment**: `HEDGED_PASSWORD` puts the whole app behind a password; `INKBOX_ALLOWED_SENDERS` limits who the iMessage agent answers; the in-app question cap is counted from the shared log.

### Data

- **Synthetic:** Fenland Ridge Farm Ltd (450 ha near Sleaford) and everything about it: profile, positions, accounts, mitigations, calendar and the demo news items. Written by hand to be plausible for a Lincolnshire arable farm, and consistent across pages (`lib/profile/fenland-ridge.ts`, `lib/mock.ts`). No real farm, person or account.
- **Real sources** (live adapters in `lib/live.ts`, not yet wired into the figures): AHDB delivered prices and fertiliser series (AHDB terms), Bank of England Bank Rate and SONIA (BoE terms), Open-Meteo forecast and soil moisture (CC BY 4.0). Full list with endpoints and licences in `docs/architecture.md` §3.

### Model and its limits

Each risk's bad year is its exposure × a price or yield swing × 1.65 (a 1-in-20 move on a normal distribution). The farm's bad year combines this risk with the others as independent swings (√ of the sum of squares). Known limits: normal tails understate extreme years; risks are treated as independent (no natural hedge between price and yield); minimum-price contracts are modelled like forward sales; the what-if moves one driver at a time from the snapshot; one demo farm.

### Plugging in the backend

- `lib/types.ts`: shared interfaces (`Farm`, `RiskResult`, `Mitigation`, `PendingChange`, `CalendarItem`, `ProfitSummary`, …).
- `lib/data.ts`: the only data entry point for pages and components. Server functions: pages call them directly, client components call them as server actions.
- `lib/server/store.ts`: Supabase reads and writes, with the in-memory demo store as fallback.
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
