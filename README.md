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
