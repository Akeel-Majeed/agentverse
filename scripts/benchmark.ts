/** Run: bun run eval:benchmark. Writes docs/eval/benchmark.json and docs/eval/benchmark.md. */
import { writeFileSync } from "node:fs";
import { bootMean, forecastBenchmark, hedgeBacktest } from "../lib/engine/benchmark";
import { loadHistory } from "../lib/engine/history";
import { mean } from "../lib/engine/linalg";
import { configHash } from "../lib/engine/simulate";
import { DEFAULT_CONFIG } from "../lib/engine/types";

const HELD_OUT_FROM = "2024-01-01"; // same cut as docs/eval/backtest.json
const h = loadHistory();
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const hedge = hedgeBacktest(h, DEFAULT_CONFIG, range(2017, 2026));
const forecast = forecastBenchmark(h, DEFAULT_CONFIG, range(2018, 2026), HELD_OUT_FROM);
// Paired: per-year pinball(P5) of each baseline minus ours. Positive = ours lower (better).
const paired = (["normal_refit", "hist_sim"] as const).map((b) => {
  const d = forecast.rows.filter((r) => r.model === "mc").map((r) => forecast.rows.find((x) => x.model === b && x.harvestYear === r.harvestYear)!.pinballP5 - r.pinballP5);
  return { baseline: b, n: d.length, meanBaselineMinusMc: mean(d), ci: bootMean(d), mcBetterYears: d.filter((x) => x > 0).length };
});
const dataCutoff = { prices: h.wheat.points.at(-1)!.date, yields: h.yield_wheat.points.at(-1)!.date, bankRate: h.bank_rate.points.at(-1)!.date };
const out = { configHash: configHash(DEFAULT_CONFIG), heldOutFrom: HELD_OUT_FROM, dataCutoff, generatedAt: new Date().toISOString(), hedge, forecast: { ...forecast, pairedPinballP5: paired } };
writeFileSync("docs/eval/benchmark.json", JSON.stringify(out, null, 1));

const k = (x: number) => `${x < 0 ? "−" : ""}£${Math.abs(Math.round(x / 1000))}k`;
const ci = ([a, b]: number[]) => `${k(a)} to ${k(b)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const name: Record<string, string> = { mc: "Ours (Student-t Monte Carlo)", normal_refit: "Normal, same calibration", hist_sim: "Historical simulation" };
const hs = hedge.summary;
const lines = [
  "# Benchmarks: the hedge decision and the whole-farm forecast",
  "",
  `Run \`bun run eval:benchmark\`. Engine config hash \`${configHash(DEFAULT_CONFIG)}\` (DEFAULT_CONFIG, unchanged). Data cutoff: prices ${dataCutoff.prices}, yields ${dataCutoff.yields}, Bank Rate ${dataCutoff.bankRate} (data/history.json).`,
  "",
  "**Synthetic farm, real data.** The farm is the fictional Fenland Ridge Farm Ltd (lib/profile/fenland-ridge.ts: 220 ha wheat at 8.5 t/ha, etc.). Prices are the Defra Agricultural Price Index (feed wheat, feed barley, OSR, AN fertiliser, motor fuel), anchored to today's £/t through the index. Yields are Defra East Midlands regional yields, applied as the year's deviation from a trend fitted only on earlier years. Bank Rate is the Bank of England series. These are backtests on history, not real-world trading results.",
  "",
  "Every harvest year is walk-forward: the origin is 1 August of the year before, and each year uses only data dated on or before its origin (the realised outcome is read at 1 August of the harvest year). Nothing here was tuned on these results, but the engine's design (Student-t, ν = 5, the nitrogen factor) was chosen knowing 2022 happened. Strictly held out (origins from 2024-01, the same cut as backtest.md): harvest years 2025 and 2026 only.",
  "",
  "## 1. The hedge decision vs benchmarks, with costs",
  "",
  `Decision: sell 50% of expected wheat (220 ha × 8.5 t/ha × 50% = ${Math.round(hs[1].hedgeCostPerYear / DEFAULT_CONFIG.optionCosts.forwardGbpT)} t) forward at the origin, cost £${DEFAULT_CONFIG.optionCosts.forwardGbpT}/t. **Forward-price proxy:** we have no historical forward curve, so the forward price is the spot index price at the origin (August). A real new-crop forward price differs from spot by the basis and carry; this proxy is the main limit of this test. The rest is sold at the realised August harvest-year price. Benchmarks: do nothing (all at harvest) and sell 100% forward (if the harvest falls short, the shortfall is bought back at the harvest price). Other costs, yields and rates are realised values and are the same across the three strategies.`,
  "",
  `Harvest years ${hedge.rows[0].harvestYear}–${hedge.rows.at(-1)!.harvestYear}: **n = ${hedge.rows.length} years, descriptive.** Intervals are 95% percentile bootstraps (10,000 resamples, seed 42); with n this small they are rough. With ${hedge.rows.length} years, the P5 is an interpolation between the two worst years.`,
  "",
  "| Strategy | Mean profit (95% CI) | Spread (SD across years) | Worst year | P5 across years | Mean of worst 2 years | Hedge cost a year (total) | Mean gain vs doing nothing (95% CI) | Years it lost money vs doing nothing |",
  "|---|---|---|---|---|---|---|---|---|",
  ...hs.map((s) => `| ${s.label} | ${k(s.meanProfit)} (${ci(s.meanProfitCI)}) | ${k(s.sdAcrossYears)} | ${k(s.worstYear)} (${s.worstYearHarvest}) | ${k(s.p5)} | ${k(s.tailMeanWorst2)} | ${k(s.hedgeCostPerYear)} (${k(s.hedgeCostTotal)}) | ${s.strategy === "do_nothing" ? "—" : `${k(s.meanGainVsNothing)} (${ci(s.meanGainVsNothingCI)})`} | ${s.strategy === "do_nothing" ? "—" : `${s.yearsWorseThanNothing.length} of ${s.n}: ${s.yearsWorseThanNothing.join(", ") || "none"}`} |`),
  "",
  `**Read plainly:** over these ${hedge.rows.length} years the 50% forward sale lowered mean profit by ${k(-hs[1].meanGainVsNothing)} a year and made the worst year worse (${k(hs[1].worstYear)} vs ${k(hs[0].worstYear)}, harvest ${hs[0].worstYearHarvest}); it lost money against doing nothing in ${hs[1].yearsWorseThanNothing.length} of ${hs[1].n} years. It narrowed the spread across years (SD ${k(hs[1].sdAcrossYears)} vs ${k(hs[0].sdAcrossYears)}). Wheat rose from August to August in ${hedge.rows.filter((r) => r.wheatHarvestGbpT > r.wheatOriginGbpT).length} of the ${hedge.rows.length} years, so selling at the August price lost money then; the forward sale paid off in ${hedge.rows.filter((r) => r.profit.forward_50 > r.profit.do_nothing).map((r) => r.harvestYear).join(", ")}, when prices fell by more than the £3/t cost. The worst year (2020) was a poor yield with a rising price: for an unhedged farm the two partly offset, and a forward sale removes that natural offset. This is one 10-year price path, not a test of whether the hedge narrows the simulated 1-in-20 year. It is the evidence that should temper the agent when prices are expected to rise.`,
  "",
  "Per year (profit, £k):",
  "",
  "| Harvest | Wheat £/t at origin → harvest | Do nothing | Sell 50% forward | Sell 100% forward | Note |",
  "|---|---|---|---|---|---|",
  ...hedge.rows.map((r) => `| ${r.harvestYear} | £${Math.round(r.wheatOriginGbpT)} → £${Math.round(r.wheatHarvestGbpT)} | ${k(r.profit.do_nothing)} | ${k(r.profit.forward_50)} | ${k(r.profit.forward_100)} | ${r.yieldsImputedAtTrend ? "yields missing in Defra data, set to trend" : ""} |`),
  "",
  "## 2. Whole-farm forecast vs baselines",
  "",
  "For each harvest year, each model forecasts the farm's profit P5/P50/P95 at the origin; the farm is held fixed and unhedged. Models: **ours** (correlated Student-t Monte Carlo, ν = 5, 10,000 paths, seed 42, with the 10% scheme-cut event); **normal** (the same calibration and seed with near-Gaussian shocks, ν = 200); **historical simulation** (every 12-month price and rate move before the origin crossed with every past year's yield deviations, price and yield taken as independent, no scheme-cut event). Target: 90% of realised years inside P5–P95. Coverage intervals are Wilson 95%; pinball-loss intervals are bootstrap 95%.",
  "",
  "| Model | Period | n | Inside P5–P95 (95% CI) | Below P5 | Above P95 | Pinball at P5 (95% CI) | Pinball P50 | Pinball P95 |",
  "|---|---|---|---|---|---|---|---|---|",
  ...forecast.summary.map((s) => `| ${name[s.model]} | ${s.period === "all" ? `all ${s.n} years` : "held out (2025–26)"} | ${s.n} | ${pct(s.coverage)} (${pct(s.coverageCI[0])}–${pct(s.coverageCI[1])}) | ${s.breachLowYears.join(", ") || "none"} | ${s.breachHighYears.join(", ") || "none"} | ${k(s.pinballP5)}${Number.isNaN(s.pinballP5CI[0]) ? "" : ` (${ci(s.pinballP5CI)})`} | ${k(s.pinballP50)} | ${k(s.pinballP95)} |`),
  "",
  "Paired comparison of pinball loss at P5 (baseline minus ours, per year; positive means ours was better):",
  "",
  ...paired.map((p) => `- vs ${name[p.baseline]}: mean £${Math.round(p.meanBaselineMinusMc)} (95% CI £${Math.round(p.ci[0])} to £${Math.round(p.ci[1])}), ours better in ${p.mcBetterYears} of ${p.n} years.`),
  "",
  "| Harvest | Model | P5 | P50 | P95 | Realised | Outside? |",
  "|---|---|---|---|---|---|---|",
  ...forecast.rows.map((r) => `| ${r.harvestYear}${r.heldOut ? " (held out)" : ""} | ${name[r.model]} | ${k(r.p5)} | ${k(r.p50)} | ${k(r.p95)} | ${k(r.realised)} | ${r.breachLow ? "below P5" : r.breachHigh ? "above P95" : "no"}${r.yieldsImputedAtTrend ? " (yields set to trend)" : ""} |`),
  "",
  "## Caveats",
  "",
  "- The farm is synthetic; only the prices, yields and rates are real. Its costs and areas are held at today's values for every year.",
  "- Defra has no 2022 regional yields in our data: 2022 yields are set to trend (no yield shock) in both tests, so 2022 shows only the price shock.",
  "- Forward price = spot price at the origin (no historical forward curve). Basis, carry and counterparty risk are not modelled. £3/t is an assumed cost.",
  "- Harvest prices are the August index month; real sales spread over the year.",
  "- n is 9–10 years and only 2 are strictly held out. Every figure is descriptive; none is a claim about future performance.",
  "- The latest year's yields and prices are whatever data/history.json holds and may be revised by Defra.",
];
writeFileSync("docs/eval/benchmark.md", lines.join("\n") + "\n");
console.log(lines.join("\n"));
