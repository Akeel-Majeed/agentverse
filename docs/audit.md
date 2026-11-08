# Hedged: product audit, 8 Nov 2026

Everything below was checked against the code on `claude/optimistic-cray-ytj349` (commit 61e1693). Checks run: `tsc`, `npm test` (82/82 pass), `npm run lint` (clean), `npm run build` (ok), a script driving `lib/data.ts` on the demo store, and a browser walk-through of every route at desktop and phone width.

The build is solid: it's green, the maths is in code, there's an approval queue and an action log, and the figure checker is a good idea. The problems are mostly where the rubric gives its marks. **Half the score (Testing on unseen data, 25%; Traceable reasoning, 25%) isn't evidenced yet, and the one hard limit the farm profile collects (`ins.max_loss`) is never enforced.**

Rubric weights: (1) Traceable reasoning 25%, (2) Testing on unseen data 25%, (3) Risk controls 15%, (4) Relevance and impact 20%, (5) Ambition and quality 15%.

---

## Part A: ranked improvements (best return on the remaining hours first)

| # | Improvement | Criteria | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **Backtest the bad-year figure on held-out price history** | 2 (25%) | 3–4 h | There's no evaluation at all today, so criterion 2 scores 1/5. This is the biggest single gain. |
| 2 | **Enforce the farm's loss limit in code, and fire it on screen** | 3, 4 | 1–2 h | `ins.max_loss` (£60k) is collected and never used. Wiring it up gives you "one control triggers on screen". |
| 3 | **Catch bad and manipulative inputs on screen** | 2, 3 | 1–2 h | Today 85 t/ha wheat on 99,999 ha is accepted and gives a £275m bad-year hit. |
| 4 | **Make the agent's text follow the numbers (no stale reasoning)** | 1 | 2 h | After a profile update the figures change but the summary, driver, reasoning and mitigations don't. |
| 5 | **"What would change this" on every risk and option, computed in code** | 1 | 1–2 h | The rubric names this explicitly. It isn't on screen anywhere. |
| 6 | **Make the figure checker fail closed, and close its gaps** | 1, 3 | 1–2 h | Untraced figures are still sent after one rewrite. Sign flips, bare "840k", p/L, points and litres all get through. |
| 7 | **Evidence page: action log + checker catches + eval results** | 2, 3 | 1–2 h | `chat_turns` already logs every tool call and every checker catch, but nothing shows them. |
| 8 | **One consistent model across overview, what-if and weekly change** | 1 | 1–2 h | What-if uses hard-coded constants and leaves out the 1,028 t in store. "Vs last week" is hard-coded. |
| 9 | **Rank the top 3 mitigations in code** | 1 | 30 min | `topMitigationIds` is a fixed list, but the UI says "biggest cut in risk for the money". |
| 10 | **README, data licences, honest limits** | 1, 2, 4 | 1 h | The brief requires labelled synthetic data, how it was made, and every dataset's licence. The README still says "Headwind". |
| 11 | Lock down the deployed demo | 3 | 1 h | Anyone with the URL can approve changes, update the profile and read the iMessage log. |
| 12 | Model upgrades (correlation, fat tails, use yield-swing fields) | 5 | 3+ h | Real gains, but they matter less than evidencing what already exists. Say them as limits in the deck instead. |

Everything in 1–10 must also go into the **pitch deck**: judges score every team from the deck.

### 1. Backtest the bad-year figure (criterion 2)

- **What:** add `scripts/backtest.ts`. Use 10+ years of AHDB delivered feed wheat, AN fertiliser and Bank Rate (`lib/live.ts` already fetches the AHDB xlsx and the BoE series). At each historical date, estimate the price SD from the trailing window only. Predict the 1-in-20 move over the holding period, then check the realised move. Hold out the most recent 2–3 years, which you don't look at while tuning.
- **Report:** exceedance rate vs the 5% target, with a Kupiec POF test or a binomial interval; average shortfall when breached; one named benchmark (e.g. a "last year's move" naive forecast, or historical simulation). Show the misses as plainly as the hits: list each breach date and its size.
- **Also:** score the alert rule (£5k threshold) on held-out signals for precision and recall. Publish `bun run ask --eval` results (pass rate, checker catch rate, untraced-after-rewrite rate) with N and a confidence interval.
- **Where:** write the results to `docs/evaluation.md` and a JSON file, and render them on an `/evidence` page. Put the headline chart in the deck.

### 2. Enforce the loss limit (criterion 3: "one control triggers on screen")

- `ins.max_loss` is in `lib/profile/catalogue.ts` and the demo farm (£60k, "check"). `rg max_loss` shows nothing reads it.
- In `lib/profile/assess.ts` (code, not prompt), compare each risk's `badYear`, and the farm's bad-year loss (`profit.badYear < 0`), with `max_loss`. Store a `breaches[]` on the assessment.
- In the UI, show a red "Over your £60k limit" badge on output prices (£149k) and weather (£58k → near the limit). On the overview, show a banner: "A 1-in-20 year loses £90k, past the £60k you said the farm can take".
- The agent should **hold**: if the limit field is unconfirmed, the banner asks the farmer to confirm it rather than guessing. Add a test.
- Demo: approve the "sold 200 t" change, press "Update risk profile", and the breach shrinks live.

### 3. Catch bad and manipulative inputs (criteria 2 and 3)

The probe found:

| Input | Result today |
|---|---|
| wheat yield `85` t/ha, area `99999` ha | saved; output-price bad-year hit **£274,939,000**, score 10 |
| date `03/04/2027` (UK: 3 April) | stored as **4 March** (US parse) |
| date `31/03/2027` | rejected, though it's the normal UK format |
| date `2027-13-45` | **accepted** as valid |
| number `1e3` | stored as **3** |
| number `12,5` | stored as **125** |
| `about 12 or 13` | silently stored as 12 |
| `1.2k` t | stored as 1.2 (the k is ignored for non-money fields) |

**Fix** in `lib/profile/values.ts` and `catalogue.ts`:
- Give each field a `min` and `max` plus a "plausible" band (yield 0–15 t/ha, crop areas summing to ≤ farmed area, AN £150–£1,500/t, Bank Rate margin 0–10%).
- Hard-reject anything impossible. Plausible-but-unusual values save with an "Unusual: check" flag that blocks "Update risk profile" until confirmed.
- Parse dates as dd/mm/yyyy, and validate ISO dates by round-tripping them.
- Reject scientific notation and ambiguous text, and treat `12,5` as an error.
- Apply the same gate to `approveChange`, so a pending change from iMessage, MCP or a document goes through it too. This is where a "manipulative input" would arrive.
- Do the same for signals: a news value that moves a price more than, say, 4 SD in a day gets held for review, not measured.
- Demo it: have a pending change propose "wheat yield 85 t/ha" and show it being caught.

### 4. Keep the agent's text in step with the numbers (criterion 1)

The probe set all crop as sold and pressed "Update risk profile". Output prices went to a £0 bad-year hit and score 1, but:
- `driver` still says "£793k of wheat, barley and rape unsold", and the summary says "Almost none of your crop is sold".
- The first `reasoning` line still says "Unsold crop is worth £793k".
- Every mitigation still says it "cuts the bad-year hit by £31k / £19k / …" on a risk with nothing left to hedge. "Minimum-price contract on half the 2027 wheat" is still the #1 top mitigation.

Because `get_risk` returns `reasoning` to the chat agent, **the stale £793k counts as a traced figure**, so the checker passes it.

**Fix** (`lib/profile/assess.ts`, `rebuildRisk`):
- Rebuild `driver` and `summary` from `exposure.summary` with a template.
- Cap each mitigation's `unitsRemoved` at the remaining exposure and recompute `badYearReduction`. Hide or grey options with nothing left to act on.
- Until the writer agent exists, mark carried-over reasoning "written for snapshot v1, figures may be out of date" and leave it out of `get_risk`.
- Label every block in the UI as **Calculated** (code) or **Agent's explanation** (model). The brief asks the UI to show which is which.

### 5. "What would change this" (criterion 1)

For each risk, compute in code: the price or exposure at which the score moves a band, and the price at which the crop crosses break-even (wheat £178 vs £185). For each option, the deadline after which it's gone (20 Nov movement date, 15 Jan OSR offer). Show it as a line on the risk page, e.g. "Score drops to High if you sell 310 t more wheat, or if wheat rises above £x/t". Return it from `get_risk` so the chat agent can quote it.

### 6. Figure checker: fail closed, close the gaps (criteria 1 and 3)

The probe, with a tool result containing "−£17k" and "£149k":

| Reply | Caught? |
|---|---|
| "Profit **rose** £17k" (it fell) | no: signs are ignored |
| "Rates could cost 840k" | no: no £ sign |
| "a hundred and fifty thousand pounds" | no |
| "diesel is 75p/L", "2.5 points", "2,000 L" | no: units not covered |
| "£150k" | yes |
| "300t" | yes |

**Fix** in `lib/agents/checker.ts` and `agent.ts`:
- Keep the sign in the key, and check direction words (rose/fell/up/down) against it.
- Add patterns for bare `\d+k`, `p/L`, `L`, `points`, `months` and number words.
- **Fail closed:** if a figure is still untraced after the rewrite, don't send it. Send a safe reply ("I couldn't confirm that figure; here's what I can show: …") and log `blocked: true`. Today `agent.ts` only does `console.warn` and sends it anyway.

### 7. Evidence page (criteria 2 and 3)

`chat_turns` already holds every question, tool call, timing, checker catch and rewrite. Add an `/evidence` page (or a tab in the assistant panel) showing:
- the action log
- "checker caught N figures in M replies"
- approvals and rejections with who and when
- snapshot history
- backtest results from #1

It's cheap, and it shows "every action logged" and "one control visibly firing".

### 8. One model everywhere (criterion 1)

- `lib/sim.ts:whatIf` hard-codes `WHEAT_T = 1870`, `OTHER_CROPS_K = 277`, `AN_T = 166`, `VARIABLE_DEBT_K = 840` and `BASE_PROFIT_K = 85`. It ignores the profile and snapshot, so after an approval or update the what-if is out of step with every other page.
- It also leaves out the **1,028 t of 2026 wheat in store**. A −£4/t wheat move is **−£7.5k** in what-if but **−£11.6k** in the overview's "vs last week" (2,898 t). Build the what-if from `snapshot.exposures[].sensitivities`.
- `weekMoves` in `lib/profile/fenland-ridge.ts` is a hard-coded `{ wheat −4, AN +18 }`, re-applied on every re-assessment, so "change vs last week" is invented after any update. Derive it from the signals in the last 7 days.
- There are two different "what changed" numbers (news since snapshot −£28k; vs last week −£15k). Explain how they relate, or keep one.
- Weather and yield uses `hectares × £78/ha` in the assessment but `£610k of crop revenue` in the risk profile. The `crop.*.yield_sd_t_ha` fields are collected and never used. Use one exposure and drive the SD from the yield-swing fields.

### 9. Rank top mitigations in code

`mock.topMitigationIds` is a fixed list. Rank by `badYearReduction ÷ cost` (or by score change). Cost needs a numeric field; today `cost` is free text like "Premium ~£7.5k". Show the ranking formula in the working sheet. Don't put the profit-type option (lender margin, +£10.9k/yr) in the same ranking as risk cuts without saying so.

### 10. README, data, honest limits

- `README.md` still says **"Headwind"** and `package.json` is named `headwind`. `docs/architecture.md` is titled "Headwind". It also describes components that don't exist (verifier agent, Neon, Langfuse traces, `/api/refresh` cron), which a judge reading the repo will notice. Mark them "planned", or remove them.
- The brief requires synthetic data to be labelled, with how it was made, and every dataset referenced with its licence. Add a Data section: what's synthetic (the farm, the 2026 signals), what's real (AHDB, BoE, Open-Meteo), and the licences (AHDB terms, OGL for Defra and BoE, CC-BY 4.0 for Open-Meteo).
- Add a "Limits" section, also for the deck:
  - normal distribution and 1.65 SD (fat tails understate)
  - risks treated as independent, with a fixed `otherSdK` chosen so pages reconcile
  - no output-price/yield natural hedge
  - minimum-price contracts modelled the same as forward sales
  - one farm hard-coded (`FARM_ID`, and the system prompt names Fenland Ridge)

### 11. Lock down the deployed demo

- Server actions (`approveChange`, `saveSection`, `updateRiskProfile`, `rerunAssessment`) and `/api/assistant` have no auth. Anyone with the URL can change the farm, and `GET /api/assistant` returns the whole shared chat log, including iMessage turns.
- The assistant rate limit is an in-memory array per serverless instance, so it doesn't hold on Vercel. Use a Supabase counter, or a simple shared demo passcode in a cookie.
- iMessage answers anyone who texts the identity. Add a sender allowlist (the farmer's handle) before claiming the turn.

### 12. Model upgrades (only after 1–10)

Correlated risks (a covariance matrix, or a joint Monte Carlo over the five drivers); a fat-tailed (t) shock or historical simulation; yield-swing fields driving weather risk; option payoff for minimum-price contracts. Saying these clearly as limits is worth more marks today than building them.

---

## Part B: problems found, by severity

### Demo-breaking or misleading

1. **Stale explanations after a profile update** (`lib/profile/assess.ts:rebuildRisk`). See A4.
2. **Mitigations promise reductions on exposure that no longer exists** (`assess.ts`: `badYearReduction` is carried over unchanged). See A4.
3. **No plausibility checks on profile values or approvals** (`lib/profile/values.ts:parseValue`, `lib/data.ts:approveChange`). See A3.
4. **UK dates misparsed** (`parseValue`: `Date.parse` treats `03/04/2027` as US-style 4 March, and accepts `2027-13-45`). See A3.
5. **Figure checker sends untraced figures after the rewrite** (`lib/agents/chat/agent.ts`, end of `runChatAgent`). See A6.
6. **What-if inconsistent with the rest of the app** (`lib/sim.ts:whatIf` constants). See A8.

### Traceability gaps

7. "Change vs last week" comes from hard-coded `weekMoves` (`lib/profile/fenland-ridge.ts:121`) and is recomputed from them on every assessment.
8. Top-3 mitigations are a fixed list (`lib/mock.ts: topMitigationIds`), not ranked in code.
9. The lender-margin working in `lib/figures.ts:mitigationDetail` has hard-coded strings ("3.1%", "1.3–1.8%"), not values from the profile (`fin.loan_margin_pct` exists).
10. The profit sheet title hard-codes "2027 harvest year" (`lib/figures.ts:profitDetail`) instead of `meta.harvestYear`.
11. The "Sell 20% more of the 2026 wheat in store" mitigation moves **374 t**, which is 20% of the **2027** crop (1,870 t), not of the 1,028 t in store (20% = 206 t) (`lib/mock.ts`). A judge checking the working would catch it.
12. Weather and yield exposure is measured two different ways (ha × £78 vs £610k revenue), and the yield-swing fields are unused. See A8.
13. `get_risk` hands static reasoning text to the agent, which then counts as a source for the checker (laundering stale figures).
14. The checker matches by absolute value only, so any tool's "£11k" licenses "£11k" anywhere, with either sign.
15. Signal summaries (news text) are tool output, so numbers inside external news count as traced.

### Controls and safety

16. `ins.max_loss` and `fin.cash_buffer` are collected but never used (no hard limit in code). See A2.
17. No auth on mutating server actions, or on the chat log endpoint. See A11.
18. The rate limit is per instance and in memory only (`lib/agents/chat/web.ts`).
19. No sender allowlist on iMessage (`lib/agents/chat/imessage.ts:inboundText`).
20. Chat memory has a read-modify-write race: two messages close together, and the last write wins (`inkbox.ts`, `api/assistant`). Low impact.

### Model limitations (state them; fix only if time allows)

21. Normal shocks at 1.65 SD; no fat tails.
22. Risks treated as independent, with `otherSdK` back-solved so every page reconciles (`lib/mock.ts:otherSdFor`). The farm bad year (−£90k, i.e. a £175k swing) is less than the sum of the per-risk hits (£269k). The UI should say why. The agent prompt already does.
23. `otherSdK` is fixed at the demo value, so after a big update the whole-farm bad year doesn't fully respond.
24. Interest-rate exposure counts as variable only if the text contains "variable" (`risk-profile.ts:interestRates`), so "tracker" or "base-linked" loans count as £0.
25. Single farm hard-coded (`FARM_ID`, system prompts in `agent.ts` and `memory.ts`).

### Docs and naming

26. "Headwind" in `README.md`, `package.json`, `docs/architecture.md` and the `components/headwind/` folder (the folder name is fine; the user-facing text isn't).
27. The architecture doc describes things not built (verifier agent, Langfuse, Neon, cron).
28. No dataset licences and no "how the synthetic data was made" (a brief requirement).
29. The README's Database steps say to run `0001` and then the seed. The chat migrations `0002` and `0004` are mentioned further down, and `0003` (channel column) isn't mentioned at all. One ordered list ("run every file in `supabase/migrations/` in order") avoids a half-migrated demo.

### UI walk-through findings

See Part C.
