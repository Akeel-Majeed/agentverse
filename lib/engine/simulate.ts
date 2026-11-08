import { createHash } from "node:crypto";
import { scoreFromBadYear } from "../score";
import type { RiskId } from "../types";
import { calibrate, type Calibrated } from "./calibrate";
import { figure } from "./display";
import { quantile } from "./stats";
import { mean } from "./linalg";
import { mulberry32, normalSampler, tScale } from "./rng";
import {
  CROPS, DEFAULT_CONFIG, ENGINE_VERSION, FACTORS, RISK_FACTORS,
  type FactorId, type FarmInputs, type Figure, type History, type OptionFigures, type PriceFactor, type RiskFigures, type SimConfig, type SimResult, type YieldFactor,
} from "./types";

type Shock = Partial<Record<FactorId, number>>;

/** One year's P&L. Shocks: log-change for prices, relative change for yields, pp for Bank Rate. */
export function farmPnl(f: FarmInputs, s: Shock, schemeCut = 0): { profit: number; interest: number; dscr: number } {
  const g = (k: FactorId) => s[k] ?? 0;
  const price = (c: PriceFactor) => f.priceToday[c] * Math.exp(g(c));
  let revenue = 0;
  for (const c of CROPS) {
    const crop = f.crops[c];
    const produced = crop.areaHa * crop.yieldTHa * (1 + g(`yield_${c}` as YieldFactor));
    revenue += crop.forwardT * f.priceToday[c] + (produced - crop.forwardT) * price(c);
    revenue += f.stockT[c] * (price(c) - f.priceToday[c]);
  }
  const anCost = f.anBoughtT * f.anPricePaid + Math.max(0, f.anNeedT - f.anBoughtT) * price("an");
  const bought = f.dieselBoughtPct / 100;
  const fuelCost = (f.dieselL * (bought * f.priceToday.fuel + (1 - bought) * price("fuel"))) / 100;
  const rate = f.loanVariable ? f.bankRatePct + g("bank_rate") : f.bankRatePct;
  const interest = (f.loan * Math.max(0, rate + f.loanMarginPct)) / 100;
  const profit = revenue + f.sfiAnnual * (1 - schemeCut) - anCost - fuelCost - f.sprayGbp - f.fixedCosts - interest;
  return { profit, interest, dscr: (profit + interest) / (interest + f.capitalRepayment) };
}

export const configHash = (cfg: SimConfig) =>
  createHash("sha256").update(JSON.stringify({ cfg, ENGINE_VERSION })).digest("hex").slice(0, 16);

/** Correlated Student-t shocks, path-major in FACTORS order. Common random numbers for every scenario. */
export function drawShocks(cal: Calibrated, cfg: SimConfig): Float64Array {
  const K = FACTORS.length;
  const out = new Float64Array(cfg.paths * K);
  const normal = normalSampler(mulberry32(cfg.seed));
  const z = new Array<number>(K);
  for (let p = 0; p < cfg.paths; p++) {
    for (let k = 0; k < K; k++) z[k] = normal();
    const s = tScale(normal, cfg.nu);
    for (let i = 0; i < K; i++) {
      let v = 0;
      for (let j = 0; j <= i; j++) v += cal.chol[i][j] * z[j];
      out[p * K + i] = v * s * cal.sigma[FACTORS[i]];
    }
  }
  return out;
}

const sorted = (a: Float64Array) => Float64Array.from(a).sort();
const cvar5 = (s: Float64Array) => mean(s.subarray(0, Math.max(1, Math.floor(s.length * 0.05))));

export function simulate(h: History, farm: FarmInputs, asOf: string, cfg: SimConfig = DEFAULT_CONFIG): SimResult {
  const cal = calibrate(h, asOf, cfg);
  const shocks = drawShocks(cal, cfg);
  const regRand = mulberry32(cfg.seed + 1);
  const cut = Float64Array.from({ length: cfg.paths }, () => (regRand() < cfg.regulation.prob ? cfg.regulation.cutShare : 0));
  const K = FACTORS.length;
  const hash = configHash(cfg);
  const figures: Record<string, Figure> = {};
  const add = (f: Figure) => ((figures[f.id] = f), f);

  const shockOf = (p: number, only?: FactorId[]): Shock => {
    const s: Shock = {};
    for (let i = 0; i < K; i++) if (!only || only.includes(FACTORS[i])) s[FACTORS[i]] = shocks[p * K + i];
    return s;
  };
  const run = (f: FarmInputs, only?: FactorId[], withCut = true) => {
    const profit = new Float64Array(cfg.paths);
    const dscr = new Float64Array(cfg.paths);
    for (let p = 0; p < cfg.paths; p++) {
      const r = farmPnl(f, shockOf(p, only), withCut ? cut[p] : 0);
      profit[p] = r.profit;
      dscr[p] = r.dscr;
    }
    return { profit, dscr };
  };

  const base = run(farm);
  const bs = sorted(base.profit);
  const meanProfit = mean(base.profit);
  const p5 = quantile(bs, 0.05);
  const profit = {
    mean: add(figure("profit.mean", "Expected profit", meanProfit, "gbp", "mean of simulated profit", ["profile", "history"])),
    p5: add(figure("profit.p5", "Profit in a 1-in-20 bad year", p5, "gbp", "5th percentile of simulated profit", ["profit.mean"])),
    p50: add(figure("profit.p50", "Median profit", quantile(bs, 0.5), "gbp", "50th percentile of simulated profit", [])),
    p95: add(figure("profit.p95", "Profit in a 1-in-20 good year", quantile(bs, 0.95), "gbp", "95th percentile of simulated profit", [])),
    cvar5: add(figure("profit.cvar5", "Average of the worst 1-in-20 years", cvar5(bs), "gbp", "mean of the lowest 5% of simulated profit", [])),
    lossProb: add(figure("profit.loss_prob", "Chance of a loss", base.profit.filter((v) => v < 0).length / cfg.paths, "prob", "share of paths with profit < 0", [])),
  };

  const risks: RiskFigures[] = (Object.keys(RISK_FACTORS) as RiskId[]).map((riskId) => {
    const factors = RISK_FACTORS[riskId];
    const r = run(farm, riskId === "regulation" ? [] : factors, riskId === "regulation");
    const s = sorted(r.profit);
    const m = mean(r.profit);
    const hit = m - quantile(s, 0.05);
    const p5Hit = add(figure(`risk.${riskId}.p5_hit`, "Stand-alone hit in a 1-in-20 bad year", hit, "gbp", "mean − 5th percentile with only this risk's factors varying", factors));
    return {
      riskId,
      factors,
      p5Hit,
      cvar5Hit: add(figure(`risk.${riskId}.cvar5_hit`, "Stand-alone average hit in the worst 1-in-20 years", m - cvar5(s), "gbp", "mean − mean of lowest 5%", factors)),
      score: add(figure(`risk.${riskId}.score`, "Risk score", scoreFromBadYear(hit, Math.max(1, meanProfit)), "score", "lib/score.ts bands on hit ÷ expected profit", [p5Hit.id, "profit.mean"])),
    };
  });

  const c = cfg.optionCosts;
  const expectedWheat = farm.crops.wheat.areaHa * farm.crops.wheat.yieldTHa;
  const fwdT = 0.5 * Math.max(0, expectedWheat - farm.crops.wheat.forwardT);
  const anLeft = Math.max(0, farm.anNeedT - farm.anBoughtT);
  const optionFarms: { id: OptionFigures["id"]; riskId: RiskId; label: string; cost: number; farm: FarmInputs; formula: string }[] = [
    {
      id: "sell_forward_wheat_50", riskId: "output_prices", label: "Sell half the unsold 2027 wheat forward",
      cost: fwdT * c.forwardGbpT, formula: `${Math.round(fwdT)} t × £${c.forwardGbpT}/t (assumed)`,
      farm: { ...farm, crops: { ...farm.crops, wheat: { ...farm.crops.wheat, forwardT: farm.crops.wheat.forwardT + fwdT } }, fixedCosts: farm.fixedCosts + fwdT * c.forwardGbpT },
    },
    {
      id: "buy_an_now", riskId: "input_prices", label: "Buy the rest of the nitrogen now",
      cost: (anLeft * farm.priceToday.an * c.buyAnCarryPct) / 100, formula: `${Math.round(anLeft)} t × today's price × ${c.buyAnCarryPct}% carry (assumed)`,
      farm: {
        ...farm, anBoughtT: farm.anNeedT,
        anPricePaid: farm.anNeedT > 0 ? (farm.anBoughtT * farm.anPricePaid + anLeft * farm.priceToday.an) / farm.anNeedT : 0,
        fixedCosts: farm.fixedCosts + (anLeft * farm.priceToday.an * c.buyAnCarryPct) / 100,
      },
    },
    {
      id: "fix_rate", riskId: "interest_rates", label: "Fix the loan rate",
      cost: (farm.loan * c.fixRateSpreadPct) / 100, formula: `loan × ${c.fixRateSpreadPct}% spread (assumed)`,
      farm: { ...farm, loanVariable: false, loanMarginPct: farm.loanMarginPct + c.fixRateSpreadPct },
    },
  ];
  const options: OptionFigures[] = optionFarms.map((o) => ({
    id: o.id,
    riskId: o.riskId,
    label: o.label,
    cost: add(figure(`option.${o.id}.cost`, "Cost a year", o.cost, "gbp", o.formula, [])),
    p5Gain: add(figure(`option.${o.id}.p5_gain`, "Change in the 1-in-20 profit, net of cost", quantile(sorted(run(o.farm).profit), 0.05) - p5, "gbp", "P5 with option − P5 without, same simulated years", ["profit.p5"])),
  }));

  // DSCR: breach probability and the factor that hurts most in the worst 5% of DSCR paths.
  const pBelow = base.dscr.filter((d) => d < cfg.dscrThreshold).length / cfg.paths;
  const worst = Array.from(base.dscr.keys()).sort((a, b) => base.dscr[a] - base.dscr[b]).slice(0, Math.max(1, Math.floor(cfg.paths * 0.05)));
  const flat = farmPnl(farm, {}).profit;
  let mainDriver: FactorId = FACTORS[0];
  let worstContribution = Infinity;
  for (const f of FACTORS) {
    const contribution = mean(worst.map((p) => farmPnl(farm, shockOf(p, [f])).profit - flat));
    if (contribution < worstContribution) { worstContribution = contribution; mainDriver = f; }
  }
  const dscr = {
    pBelow: add(figure("dscr.p_below", `Chance DSCR falls below ${cfg.dscrThreshold}`, pBelow, "prob", "share of paths with (profit + interest) ÷ (interest + capital repaid) below the threshold", ["fin.capital_repayment", "fin.loan"])),
    mainDriver,
    threshold: cfg.dscrThreshold,
  };

  // Change-my-mind thresholds, solved in code with every other factor at today's level.
  const solveLinear = (k: PriceFactor) => {
    const today = farm.priceToday[k];
    const at = (p: number) => farmPnl(farm, { [k]: Math.log(p / today) }).profit;
    const slope = at(today + 1) - at(today);
    return slope === 0 ? NaN : today - at(today) / slope;
  };
  const dscrAt = (d: number) => farmPnl(farm, { bank_rate: d }).dscr;
  let lo = -10, hi = 20;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (dscrAt(mid) > cfg.dscrThreshold) lo = mid; else hi = mid; }
  const thresholds = [
    add(figure("threshold.wheat_breakeven", "Wheat price at which the farm breaks even", solveLinear("wheat"), "gbp_t", "solve profit(wheat price) = 0, other factors at today's level", ["profit.mean"])),
    add(figure("threshold.an_breakeven", "Nitrogen price at which the farm breaks even", solveLinear("an"), "gbp_t", "solve profit(AN price) = 0", [])),
    add(figure("threshold.rate_dscr", `Bank Rate at which DSCR reaches ${cfg.dscrThreshold}`, farm.bankRatePct + lo, "pct", "bisection on Bank Rate change", ["fin.loan", "fin.loan_margin_pct"])),
  ];

  return {
    meta: { asOf, seed: cfg.seed, paths: cfg.paths, nu: cfg.nu, configHash: hash, engineVersion: ENGINE_VERSION },
    calibration: cal.calibration,
    correlation: { factors: [...FACTORS], matrix: cal.corr, shrinkage: cal.shrinkage },
    profit,
    risks,
    options,
    dscr,
    thresholds,
    figures,
  };
}
