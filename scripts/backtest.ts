/** Run: bun run backtest. Writes docs/eval/backtest.json and docs/eval/backtest.md. */
import { mkdirSync, writeFileSync } from "node:fs";
import { BACKTEST_SERIES, monthlyBacktest, summarise, wholeFarmBacktest } from "../lib/engine/backtest";
import { loadHistory } from "../lib/engine/history";
import { configHash } from "../lib/engine/simulate";
import { DEFAULT_CONFIG } from "../lib/engine/types";

const HELD_OUT_FROM = "2024-01-01";
const h = loadHistory();
const rows = BACKTEST_SERIES.flatMap((s) => monthlyBacktest(h, s, DEFAULT_CONFIG));
const summary = summarise(rows, HELD_OUT_FROM);
const wholeFarm = wholeFarmBacktest(h, DEFAULT_CONFIG);
mkdirSync("docs/eval", { recursive: true });
writeFileSync("docs/eval/backtest.json", JSON.stringify({ configHash: configHash(DEFAULT_CONFIG), heldOutFrom: HELD_OUT_FROM, generatedAt: new Date().toISOString(), summary, wholeFarm, rows }, null, 1));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const lines = [
  "# Walk-forward backtest",
  "",
  `Config hash \`${configHash(DEFAULT_CONFIG)}\`. 1-month-ahead 5th/95th percentiles, one forecast per month after a 36-month warm-up, fitted only on data up to each origin. Held out: origins from ${HELD_OUT_FROM}. Target breach rate 5% each side.`,
  "",
  "| Series | Model | Period | n | Low breaches (95% CI) | Kupiec p | Christoffersen p | High breaches | Pinball |",
  "|---|---|---|---|---|---|---|---|---|",
  ...summary
    .sort((a, b) => a.series.localeCompare(b.series) || a.period.localeCompare(b.period) || a.model.localeCompare(b.model))
    .map((s) => `| ${s.series} | ${s.model} | ${s.period} | ${s.n} | ${pct(s.breachLowRate)} (${pct(s.breachLowCI[0])}–${pct(s.breachLowCI[1])}) | ${s.kupiecLowP.toFixed(2)} | ${s.christoffersenLowP.toFixed(2)} | ${pct(s.breachHighRate)} | ${s.pinballMean.toFixed(4)} |`),
  "",
  "## Whole farm, harvest years 2019–2025 (n = 7, descriptive only)",
  "",
  "Forecast from August of the year before, farm held fixed and unhedged, prices anchored to today's £/t through the Defra index.",
  "",
  "| Harvest | P5 | P50 | P95 | Realised | Outside the band? |",
  "|---|---|---|---|---|---|",
  ...wholeFarm.map((r) => `| ${r.harvestYear} | £${Math.round(r.p5 / 1000)}k | £${Math.round(r.p50 / 1000)}k | £${Math.round(r.p95 / 1000)}k | £${Math.round(r.realised / 1000)}k | ${r.breachLow ? "below P5" : r.breachHigh ? "above P95" : "no"} |`),
  "",
  "## Breach months (mc, all)",
  "",
  ...summary.filter((s) => s.model === "mc" && s.period === "all").map((s) => `- **${s.series}**: ${s.breachMonths.join(", ") || "none"}`),
  "",
  "Limits: the monthly test checks each factor's tails, not the joint structure. The Student-t and the nitrogen factor were chosen knowing 2022 happened.",
];
writeFileSync("docs/eval/backtest.md", lines.join("\n") + "\n");
console.log(lines.slice(0, 40).join("\n"));
