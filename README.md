# agentverse

## Headwind (frontend demo)

AI risk agent for UK arable farms. Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui. All figures are fictional demo data.

```bash
npm install
npm run dev   # http://localhost:3000
npm test      # model, score and overall-score tests (Vitest)
```

Routes:

| Route | Page |
| --- | --- |
| `/` | Landing page: what Headwind does, how it works, link into the demo |
| `/overview` | Dashboard: expected profit, combined risk circle, next actions |
| `/risks`, `/risks/[id]` | Risk index with filter; one risk with options, comparison and working |
| `/what-if` | Scenarios |
| `/calendar` | Agenda and 12-month timeline |
| `/actions` | Freshness checks and proposed updates waiting for a decision |
| `/profile` | Farm setup (`/profile#approvals` jumps to proposed changes) |

Everything runs on fictional sample data in the browser. Approvals, the assessment re-run, document uploads and reminders are simulated: nothing is stored, sent or processed, and a reload restores the sample state.

### Plugging in the backend

- `lib/types.ts`: shared interfaces (`Farm`, `RiskResult`, `Mitigation`, `PendingChange`, `CalendarItem`, `ProfitSummary`, …).
- `lib/data.ts`: the only data entry point for pages and components. Every function is async; replace the bodies with API calls.
- `lib/mock.ts`: demo data, imported only by `lib/data.ts`.
- `lib/score.ts`: 1–10 score from bad-year hit as a % of typical profit, plus ring geometry.
- `lib/overall.ts`: the overall farm score. Category swings are combined as independent normal risks plus a calibrated unattributed swing, then scored with the same bands as a category. See "How the overall score works" on the dashboard and `tests/overall.test.ts`.
- `lib/sim.ts`: client-side demo maths for the risk pages and the what-if.
