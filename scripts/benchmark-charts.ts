/** Run: bun run eval:charts (after eval:benchmark). Renders docs/eval/benchmark-chart.png and forecast-chart.png from benchmark.json with headless Chrome. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const d = JSON.parse(readFileSync("docs/eval/benchmark.json", "utf8"));
const k = (x: number) => `${x < 0 ? "−" : x > 0 ? "+" : ""}£${Math.abs(Math.round(x / 1000))}k`;
const kk = (x: number) => `${x < 0 ? "−" : ""}£${Math.abs(Math.round(x / 1000))}k`;
const W = 1600, H = 900;

const page = (title: string, subtitle: string, body: string, pill: string, foot: string) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@300;400;500&family=Inter:wght@300;400;500&display=block" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box} body{width:${W}px;height:${H}px;overflow:hidden;font-family:"Google Sans Flex","Google Sans","Product Sans",Inter,Roboto,sans-serif;color:#1f1f1f;
background:radial-gradient(1100px 600px at 85% -10%,#dbe7ff 0%,transparent 60%),radial-gradient(900px 500px at -10% 110%,#e6f0ff 0%,transparent 55%),#f8fafd}
h1{position:absolute;left:72px;top:58px;font-weight:300;font-size:50px;letter-spacing:-1px;line-height:1.1;max-width:1460px;white-space:nowrap}
.sub{position:absolute;left:74px;top:128px;font-size:21px;color:#5f6368;font-weight:400}
.pill{position:absolute;right:72px;top:172px;background:#fff;border-radius:999px;padding:16px 28px;box-shadow:0 10px 30px rgba(26,115,232,.16),0 1px 3px rgba(0,0,0,.06);font-size:22px;font-weight:500;color:#174ea6;max-width:640px;line-height:1.25}
.foot{position:absolute;left:74px;right:72px;bottom:34px;font-size:15px;color:#80868b;display:flex;justify-content:space-between}
svg{position:absolute;left:0;top:0} text{font-family:inherit}
</style></head><body><h1>${title}</h1><div class="sub">${subtitle}</div><div class="pill">${pill}</div>${body}<div class="foot"><span>Synthetic farm · real Defra prices &amp; yields · walk-forward harvest years (2025–26 strictly held out)</span><span>${foot}</span></div></body></html>`;

const defs = `<defs>
<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c8df6"/><stop offset="1" stop-color="#a8c7fa"/></linearGradient>
<linearGradient id="blueDeep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a73e8"/><stop offset="1" stop-color="#6ea2f5"/></linearGradient>
<linearGradient id="pale" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2d7fb"/><stop offset="1" stop-color="#e3ecfd"/></linearGradient>
<linearGradient id="red" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e8710a"/><stop offset="1" stop-color="#f6b26b"/></linearGradient>
</defs>`;
/** Rounded bar from y0 (zero line) to y1, rounding only the far end. */
const bar = (x: number, w: number, y0: number, y1: number, fill: string) => {
  const r = Math.min(10, w / 2, Math.abs(y1 - y0));
  const top = Math.min(y0, y1), h = Math.abs(y1 - y0);
  return y1 < y0
    ? `<path d="M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y0} Z" fill="url(#${fill})"/>`
    : `<path d="M${x},${y0} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + w - r} Q${x + w},${top + h} ${x + w},${top + h - r} V${y0} Z" fill="url(#${fill})"/>`;
};
const T = (x: number, y: number, s: string, o = "") => `<text x="${x}" y="${y}" ${o}>${s}</text>`;

function render(name: string, html: string) {
  const dir = mkdtempSync(join(tmpdir(), "hedged-chart-"));
  writeFileSync(join(dir, "c.html"), html);
  const r = spawnSync("google-chrome", ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--window-size=${W},${H}`, "--force-device-scale-factor=2", "--virtual-time-budget=5000", `--screenshot=${resolve("docs/eval", name)}`, `file://${join(dir, "c.html")}`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  console.log(`wrote docs/eval/${name}`);
}

// Chart 1: strategies, then the 50% sale vs doing nothing, year by year.
{
  const hs = d.hedge.summary, rows = d.hedge.rows, half = hs[1];
  const y = (v: number) => 560 - v * (230 / 240_000); // £240k ↔ 230px, zero line at 560
  let s = `<svg width="${W}" height="${H}">${defs}`;
  // Left: three strategies × (mean, P5 across years, worst year)
  s += T(74, 300, "Profit across the 10 years, by strategy", 'font-size="20" fill="#3c4043" font-weight="500"');
  s += `<line x1="74" x2="740" y1="${y(0)}" y2="${y(0)}" stroke="#dadce0"/>`;
  const series = [["meanProfit", "Mean", "blueDeep"], ["p5", "P5 across years", "blue"], ["worstYear", "Worst year", "pale"]] as const;
  hs.forEach((st: any, i: number) => {
    const gx = 100 + i * 215;
    series.forEach(([key, , fill], j) => {
      const v = st[key], x = gx + j * 58;
      s += bar(x, 46, y(0), y(v), fill);
      s += T(x + 23, v >= 0 ? y(v) - 10 : y(v) + 24, kk(v), 'text-anchor="middle" font-size="16" fill="#3c4043"');
    });
    s += T(gx + 81, 735, ["Do nothing", "Sell 50% forward", "Sell 100% forward"][i], 'text-anchor="middle" font-size="18" fill="#1f1f1f" font-weight="500"');
    s += T(gx + 81, 759, st.hedgeCostPerYear ? `cost ${kk(st.hedgeCostPerYear)} a year` : "no hedge cost", 'text-anchor="middle" font-size="15" fill="#80868b"');
  });
  series.forEach(([, label, fill], j) => {
    s += `<rect x="${80 + j * 190}" y="800" width="16" height="16" rx="5" fill="url(#${fill})"/>` + T(104 + j * 190, 814, label, 'font-size="16" fill="#5f6368"');
  });
  // Right: per-year gain of the 50% sale vs doing nothing
  const yg = (v: number) => 500 - v * (170 / 60_000);
  s += T(840, 300, "Sell 50% forward minus do nothing, each harvest year", 'font-size="20" fill="#3c4043" font-weight="500"');
  s += `<line x1="840" x2="1530" y1="${yg(0)}" y2="${yg(0)}" stroke="#dadce0"/>`;
  rows.forEach((r: any, i: number) => {
    const g = r.profit.forward_50 - r.profit.do_nothing, x = 852 + i * 68;
    s += bar(x, 44, yg(0), yg(g), g >= 0 ? "blueDeep" : "red");
    s += T(x + 22, g >= 0 ? yg(g) - 10 : yg(g) + 24, k(g), `text-anchor="middle" font-size="15" fill="${g >= 0 ? "#174ea6" : "#b06000"}"`);
    s += T(x + 22, 759, String(r.harvestYear), 'text-anchor="middle" font-size="16" fill="#5f6368"');
  });
  s += `<rect x="840" y="800" width="16" height="16" rx="5" fill="url(#blueDeep)"/>` + T(864, 814, "hedge helped", 'font-size="16" fill="#5f6368"');
  s += `<rect x="990" y="800" width="16" height="16" rx="5" fill="url(#red)"/>` + T(1014, 814, "hedge lost money (incl. £3/t cost)", 'font-size="16" fill="#5f6368"');
  s += "</svg>";
  const lost = half.yearsWorseThanNothing.length;
  render("benchmark-chart.png", page(
    `Selling half the wheat forward lost money in ${lost} of ${half.n} years`,
    `Fenland Ridge Farm (fictional) · harvest ${rows[0].harvestYear}–${rows.at(-1).harvestYear} · forward price = August spot, £3/t cost · n = ${half.n}, descriptive`,
    s,
    `${k(half.meanGainVsNothing)} a year vs doing nothing<br><span style="font-weight:400;font-size:17px;color:#5f6368">95% CI ${k(half.meanGainVsNothingCI[0])} to ${k(half.meanGainVsNothingCI[1])} · worst year ${kk(half.worstYear)} vs ${kk(hs[0].worstYear)}</span>`,
    "docs/eval/benchmark.json · bun run eval:benchmark",
  ));
}

// Chart 2: whole-farm forecast bands vs realised, ours with the baselines.
{
  const rows = d.forecast.rows, years: number[] = Array.from(new Set(rows.map((r: any) => r.harvestYear)));
  const at = (yr: number, m: string) => rows.find((r: any) => r.harvestYear === yr && r.model === m);
  const y = (v: number) => 760 - (v + 110_000) * (450 / 650_000);
  const x0 = 170, step = 150;
  let s = `<svg width="${W}" height="${H}">${defs}`;
  const firstHeld = years.findIndex((yr) => at(yr, "mc").heldOut);
  s += `<rect x="${x0 + firstHeld * step - 30}" y="290" width="${(years.length - firstHeld) * step}" height="480" rx="22" fill="#e8f0fe" opacity=".7"/>`;
  s += T(x0 + firstHeld * step - 12, 316, "strictly held out", 'font-size="15" fill="#1967d2" font-weight="500"');
  for (const v of [-100_000, 0, 200_000, 400_000]) {
    s += `<line x1="110" x2="1530" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#bdc1c6" : "#eceff1"}"/>` + T(100, y(v) + 5, kk(v), 'text-anchor="end" font-size="15" fill="#80868b"');
  }
  years.forEach((yr, i) => {
    const cx = x0 + i * step, mc = at(yr, "mc"), nr = at(yr, "normal_refit"), hs = at(yr, "hist_sim");
    s += `<rect x="${cx - 26}" y="${y(mc.p95)}" width="52" height="${y(mc.p5) - y(mc.p95)}" rx="26" fill="url(#blue)" opacity=".9"/>`;
    s += `<line x1="${cx + 40}" x2="${cx + 40}" y1="${y(nr.p95)}" y2="${y(nr.p5)}" stroke="#9aa0a6" stroke-width="4" stroke-linecap="round"/>`;
    s += `<line x1="${cx + 54}" x2="${cx + 54}" y1="${y(hs.p95)}" y2="${y(hs.p5)}" stroke="#f6b26b" stroke-width="4" stroke-linecap="round"/>`;
    s += `<line x1="${cx - 18}" x2="${cx + 18}" y1="${y(mc.p50)}" y2="${y(mc.p50)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    const miss = mc.breachLow || mc.breachHigh;
    s += `<circle cx="${cx}" cy="${y(mc.realised)}" r="9" fill="${miss ? "#d93025" : "#202124"}" stroke="#fff" stroke-width="3"/>`;
    if (hs.breachLow || hs.breachHigh) s += T(cx + 54, y(hs.p5) + 24, "miss", 'text-anchor="middle" font-size="14" fill="#b06000" font-weight="500"');
    s += T(cx + 10, 796, String(yr) + (mc.yieldsImputedAtTrend ? "*" : ""), 'text-anchor="middle" font-size="17" fill="#5f6368"');
  });
  const lg = [["url(#blue)", "Ours: P5–P95 band (white tick = P50)"], ["#9aa0a6", "Normal, same calibration"], ["#f6b26b", "Historical simulation"], ["#202124", "Realised profit"]];
  lg.forEach(([c, l], i) => {
    const lx = 110 + i * 330;
    s += i === 3 ? `<circle cx="${lx + 8}" cy="826" r="8" fill="${c}"/>` : `<rect x="${lx}" y="818" width="16" height="16" rx="5" fill="${c}"/>`;
    s += T(lx + 26, 832, l, 'font-size="16" fill="#5f6368"');
  });
  s += "</svg>";
  const sm = (m: string) => d.forecast.summary.find((x: any) => x.model === m && x.period === "all");
  const mc = sm("mc"), nr = sm("normal_refit"), hsim = sm("hist_sim");
  const inside = Math.round(mc.coverage * mc.n);
  render("forecast-chart.png", page(
    `Whole-farm profit: ${inside} of ${mc.n} harvests inside our 90% band`,
    `Forecast each August for the next harvest · ${years[0]}–${years.at(-1)} · ${inside}/${mc.n} inside a 90% band may mean our bands are too wide`,
    s,
    `About a tie with the normal baseline<br><span style="font-weight:400;font-size:17px;color:#5f6368">pinball at P5 £${(mc.pinballP5 / 1000).toFixed(1)}k vs £${(nr.pinballP5 / 1000).toFixed(1)}k  (lower is better)<br>historical simulation £${(hsim.pinballP5 / 1000).toFixed(1)}k, missed ${hsim.breachLowYears.concat(hsim.breachHighYears).join(", ") || "none"}</span>`,
    "* 2022 yields missing, set to trend · docs/eval/benchmark.json",
  ));
}
