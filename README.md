# agentverse

## Headwind (frontend demo)

AI risk agent for UK arable farms. Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui. All figures are fictional demo data.

```bash
npm install
npm run dev   # http://localhost:3000 → /overview
```

Routes: `/overview`, `/risks/[id]`, `/what-if`, `/calendar`, `/profile`.

### Plugging in the backend

- `lib/types.ts`: shared interfaces (`Farm`, `RiskResult`, `Mitigation`, `PendingChange`, `CalendarItem`, `ProfitSummary`, …).
- `lib/data.ts`: the only data entry point for pages and components. Every function is async; replace the bodies with API calls.
- `lib/mock.ts`: demo data, imported only by `lib/data.ts`.
- `lib/score.ts`: 1–10 score from bad-year hit as a % of typical profit.
- `lib/sim.ts`: client-side demo maths for the risk pages and the what-if.
