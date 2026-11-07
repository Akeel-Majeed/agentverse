# AgentVerse 2026: Finance Track Brief

Source of truth for what judges reward. Check every feature against this before building it.

- Event: UCL AI Society, 7 Nov 09:00 to 8 Nov 18:00 (London). Teams of 3 to 5. Site: https://agentverse.uclai.co.uk/
- Sponsors: Google DeepMind (main AI), Jane Street (finance track), NVIDIA, Canva. £150k in giveaways across 4 tracks.
- Originals: [opening deck](agentverse-2026-opening-deck.pdf) (slides 15 to 19 are finance), [judging rubric](finance-judging-criteria.jpeg)

## The challenge

**"Agents you would let near your own money."** Help people make better money decisions. Pick a busy person (compliance analyst with 400 alerts, a trader testing a hunch, a small business owner wondering if payroll clears), find a decision they get wrong or make too slowly, and build an agent that helps **without hiding the reasoning or the risk**.

Where to aim: risk and compliance, market agents, financial inclusion, scam and fraud, regulation, or your own idea.

Hard rule: **a human in the loop for anything that moves money or affects a person, and reasoning a professional could check.**

## What to submit

| Item | Detail |
|---|---|
| Code | Public repo with a short README. Ideally a demo that runs, even a rough one. |
| Pitch deck | Problem, who it helps, your data, how you evaluated it against a benchmark, the agent's limits and risk controls, key statistics. |
| Live pitch | **Top three teams only.** Up to 4 min plus 2 min questions. |

**Judges score every team from the deck, so put the evidence there.** No leaderboard: an honest result that misses its benchmark can still score top marks.

## Judging rubric

| # | Criterion | Weight | 5: Strong | 3: Adequate | 1: Weak |
|---|---|---|---|---|---|
| 1 | **Traceable reasoning** | 25% | A judge can pick any decision and trace it from raw data to output. Calculations kept separate from the model's judgement. The agent says what would change its mind. | Each decision shows its source data; numbers reproducible from what's on screen. | A plausible explanation, no data or calculation a judge can check. |
| 2 | **Testing on unseen data** | 25% | Tested on data the team never saw (kit's hidden test or a live feed), with costs, a benchmark that fits the strategy, and stated uncertainty. Losses, false alarms and misses shown as plainly as wins. Bad or manipulative inputs caught. | Held-out results against a declared benchmark, standard metrics (returns after costs, Sharpe, drawdown, or precision/recall). Errors reported. | Only rehearsed examples on the team's own data, no metric or benchmark. |
| 3 | **Risk controls and oversight** | 15% | Limits enforced in code, not just the prompt (position limits, drawdown stop, kill switch, paper trading only). Every action logged. Agent holds or asks a human when unsure. **One control triggers on screen.** | A human approves anything consequential and can stop the agent at any time. | Agent moves money or decides about a person with no checkpoint or limits, or permissions not stated. |
| 4 | **Relevance and impact** | 20% | Well-evidenced need for a specific user (retail investor, compliance analyst, small business owner), and **the failure that would hurt them most is handled on screen**. | Clearly defined user and plausible use case. | No clear user or problem. |
| 5 | **Ambition and technical quality** | 15% | Original approach to a hard problem, built to a high standard, where the agent clearly does something a conventional program couldn't. | Competent build with a novel element. | Tutorial or starter project with surface changes. Wrapping the kit's example code counts as weak. |

## Data and rules

Synthetic data is allowed, but:
- Label it and say how you made it.
- Never present synthetic results or backtests as real-world performance.
- No real financial records, account details or logins.
- Paper trading only. Never connect to real money.
- Reference every dataset and check its licence.

Suggested sources: AgentVerse finance kit (synthetic cases, real price history, **hidden test mode**), FRED, Bank of England, ECB, ONS, SEC EDGAR, Companies House API, Binance public API, Polymarket API, IBM AMLSim, PaySim, Elliptic, ULB card fraud, World Bank Findex, FCA Financial Lives, FCA Handbook, legislation.gov.uk.

## Ship-or-skip checklist

Before building anything, ask which row of the rubric it moves. If none, skip it. Half the marks (1 and 2) are about evidence, not features.

- [ ] Every number on screen links back to its raw input and the formula that produced it (1)
- [ ] Deterministic maths lives in code; the LLM only explains and judges, and the UI shows which is which (1)
- [ ] Each recommendation states what would change it (1)
- [ ] An evaluation on held-out or live data, with a named benchmark, metrics, and uncertainty (2)
- [ ] Misses and false alarms shown next to the wins (2)
- [ ] A bad or manipulative input gets caught on screen (2)
- [ ] Hard limits in code, an action log, a human approval step, and one control visibly firing in the demo (3)
- [ ] One named user with evidence of the need, and their worst failure handled on screen (4)
- [ ] All of the above evidenced **in the pitch deck**, since that's what every team is scored from
