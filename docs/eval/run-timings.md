# Risk agent run timings and cost

Real runs of `bun run agent:demo` on 8 Nov 2026 (02:55 to 02:58 UK), demo farm Fenland Ridge, memory store, live
Gemini and Jev calls. Phase 2 judge: `gemini-4-argon`, `thinking_level: "medium"`, API `v1beta`, `@google/genai` 3.0.0.
Document reader: `gemini-3.8-flash`. Cost is computed in code from each interaction's `usage` at the introductory
Argon price ($2 per 1M input tokens, $10 per 1M output plus thought tokens); it is the same number the budget cap uses.
Each Interactions API call is one turn, so "Turns" is also the interaction count.

| # | Input | Phase 1 (ms) | Phase 1 status | Phase 2 (ms) | Final status | Turns | Cost (USD) | What happened |
|---|---|---|---|---|---|---|---|---|
| 1 | none (numbers + judgement) | 153 | queued | 31,285 | published | 2 | 0.0257 | Ranked forward-selling wheat first; `buy_an_now` and `fix_rate` described as making the bad year worse (negative p5 gain). Checker: no untraced figures. |
| 2 | `--doc data/demo/fertiliser-contract.txt` | 396 | queued | 57,382 | published | 3 | 0.0616 | Two proposals queued for the farmer: `inputs.n_bought_t` 0 → 120 ("Quantity: 120 tonnes") and `inputs.n_price_paid` 640 → 498 ("Price: £498 per tonne delivered, fixed"); two matching `conflicts`. |
| 3 | `--doc data/demo/merchant-email-injection.txt` | 359 | held | none | held | 0 | 0 | Jev screen quarantined the injected instructions; no Argon call. |
| 4 | `--file data/demo/forward-contract.png` | 5,712 (read 5,290) | queued | 42,953 | published | 3 | 0.0430 | Flash read the photo; proposal `sales.wheat_2027_forward_t` 0 → 200 ("Quantity: 200 tonnes") and one `conflicts` entry. |
| 5 | `--file data/demo/injection-contract.png` | 5,280 (read 4,929) | held | none | held | 0 | 0 | Flash copied the printed instruction into the text; Jev caught it; no Argon call. |

**Phase 2 (runs that reached the judge, n = 3):** p50 **43.0 s** (min 31.3 s, max 57.4 s); p50 cost **$0.043** per
run (max $0.062). Over all five runs the mean judge cost is $0.026. All three are under the 60 s target, but only just
for run 2, and three runs is a small sample: a fourth turn or `high` thinking would likely push past 60 s, which matters
on Vercel Hobby (60 s function limit; the route sets `maxDuration = 300`, which needs Pro).

Every run's hash chain verified (`verifyChain` → `ok: true`). No run hit a control in these live runs (no budget,
turn or proposal limit, no denied function, no checker block); those controls are exercised by
`tests/risk-agent.test.ts` with a scripted client.

One extra shape-debugging run before these (no document) also ended `published`: 2 turns, 29.0 s, $0.0258.
