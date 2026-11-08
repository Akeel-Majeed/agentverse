import { amount, gbpK, num } from "./format";
import type { ExposureModel, Mitigation, WhatIfInputs, WorkingStep } from "./types";

export const Z95 = 1.65;

/** Evenly spaced normal quantiles: 20 simulated years, worst to best. */
export const BAR_Z = [
  -1.96, -1.44, -1.15, -0.935, -0.755, -0.598, -0.454, -0.319, -0.189, -0.063, 0.063, 0.189, 0.319,
  0.454, 0.598, 0.755, 0.935, 1.15, 1.44, 1.96,
];

/** Standard normal CDF (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export interface RiskSim {
  exposure: number;
  meanK: number;
  /** This risk's own hit in a bad year, £k. */
  hitK: number;
  /** This risk's standard deviation, £k. */
  riskSdK: number;
  /** Whole-farm standard deviation, £k. */
  sdK: number;
  badYearProfitK: number;
  lossYears: number;
  lossChance: number;
  /** 20 simulated years of farm profit, £k, worst to best. */
  bars: number[];
}

export function simulateExposure(model: ExposureModel, exposure: number, meanK: number): RiskSim {
  const e = Math.max(0, exposure);
  const riskSdK = (e * model.unitSd) / 1000;
  const sdK = Math.sqrt(riskSdK ** 2 + model.otherSdK ** 2);
  const lossChance = normalCdf(-meanK / sdK);
  return {
    exposure: e,
    meanK,
    hitK: riskSdK * Z95,
    riskSdK,
    sdK,
    badYearProfitK: meanK - Z95 * sdK,
    lossYears: Math.round(20 * lossChance),
    lossChance,
    bars: BAR_Z.map((z) => meanK + sdK * z),
  };
}

export function exposureRemoved(m: Mitigation): number {
  return m.effect.tonnesRemoved ?? m.effect.unitsRemoved ?? 0;
}

export function simulateRisk(model: ExposureModel, active: Mitigation[] = []): RiskSim {
  const removed = active.reduce((s, m) => s + exposureRemoved(m), 0);
  const meanCost = active.reduce((s, m) => s + (m.effect.meanCost ?? 0), 0);
  return simulateExposure(model, model.exposure - removed, model.meanK - meanCost);
}

export function formatShock(model: ExposureModel, perUnit: number): string {
  if (model.unit === "£k") return `${num(perUnit / 10, (perUnit / 10).toFixed(1).endsWith(".0") ? 0 : 1)}%`;
  return `£${num(Math.round(perUnit))}/${model.unit}`;
}

export function riskWorking(model: ExposureModel, sim: RiskSim): WorkingStep[] {
  const { exposure: ek, sd, shock } = model.keys;
  return [
    { label: ek, value: amount(sim.exposure, model.unit) },
    { label: sd, value: formatShock(model, model.unitSd) },
    { label: `${shock} = ${sd} × ${Z95}`, value: formatShock(model, model.unitSd * Z95) },
    { label: `bad_year_hit = ${ek} × ${shock}`, value: gbpK(sim.hitK) },
    { label: `risk_sd = ${ek} × ${sd}`, value: gbpK(sim.riskSdK) },
    { label: "other_risks_sd", value: gbpK(model.otherSdK) },
    { label: "farm_sd = √(risk_sd² + other_risks_sd²)", value: gbpK(sim.sdK) },
    { label: "expected_profit", value: gbpK(sim.meanK) },
    { label: `bad_year_profit = expected_profit − ${Z95} × farm_sd`, value: gbpK(sim.badYearProfitK) },
    { label: "loss_years = 20 × Φ(−expected_profit ÷ farm_sd)", value: `${sim.lossYears} in 20` },
  ];
}

export interface TradeoffRow {
  share: number;
  exposure: number;
  hitK: number;
  badYearProfitK: number;
  lossYears: number;
  upsideGivenUpK: number;
}

export function tradeoffRows(model: ExposureModel, shares = [0, 0.25, 0.5, 0.75]): TradeoffRow[] {
  return shares.map((share) => {
    const hedged = share * model.tradeoff.hedgeable;
    const sim = simulateExposure(model, model.exposure - hedged, model.meanK);
    return {
      share,
      exposure: sim.exposure,
      hitK: sim.hitK,
      badYearProfitK: sim.badYearProfitK,
      lossYears: sim.lossYears,
      upsideGivenUpK: (hedged * model.unitSd * Z95) / 1000,
    };
  });
}

/* ---------- What-if (all values £k unless named) ---------- */

/**
 * What the what-if starts from, read from the risk profile snapshot (lib/data.ts: whatIfBase), so
 * it moves with the farm profile like every other page.
 */
export interface WhatIfBase {
  /** Expected profit in a typical year, £k. */
  profitK: number;
  /** Feed wheat and AN prices in the snapshot, £/t. */
  wheatPrice: number;
  anPrice: number;
  /** 2026 wheat in store, unsold, t (exposed to price, not to next year's yield). */
  wheatStoreT: number;
  /** 2027 wheat crop at expected yield, t, and how much of it is already sold forward. */
  wheatCropT: number;
  wheatForwardT: number;
  /** 2027 barley and rape revenue at snapshot prices, £k (moves with yield). */
  otherCropsK: number;
  /** Nitrogen still to buy, t of AN. */
  anUnboughtT: number;
  /** Variable-rate borrowing, £k. */
  variableDebtK: number;
}

export interface WhatIfResult {
  profitK: number;
  deltaK: number;
  /** Wheat price (£/t) below which the farm makes a loss; null if wheat price doesn't move profit. */
  lossPrice: number | null;
  /** Wheat exposed to the price in this scenario, t. */
  wheatExposedT: number;
  impacts: { id: "price" | "yield" | "fertiliser" | "rates"; label: string; valueK: number }[];
  working: WorkingStep[];
}

export function whatIf(i: WhatIfInputs, b: WhatIfBase): WhatIfResult {
  const y = i.yieldPct / 100;
  const crop27 = b.wheatCropT * y;
  const exposedT = b.wheatStoreT + Math.max(0, crop27 - b.wheatForwardT);
  const exposedTodayT = b.wheatStoreT + Math.max(0, b.wheatCropT - b.wheatForwardT);
  const priceEffect = (exposedT * (i.wheatPrice - b.wheatPrice)) / 1000;
  // Fewer tonnes to sell at today's price, plus barley and rape moving with the same yield.
  const yieldEffect = ((exposedT - exposedTodayT) * b.wheatPrice) / 1000 + b.otherCropsK * (y - 1);
  const dFert = (-b.anUnboughtT * (i.fertiliserPrice - b.anPrice)) / 1000;
  const dRates = (-b.variableDebtK * i.rateChange) / 100;
  const deltaK = priceEffect + yieldEffect + dFert + dRates;
  const profitK = b.profitK + deltaK;
  const lossPrice = exposedT > 0 ? b.wheatPrice - ((b.profitK + yieldEffect + dFert + dRates) * 1000) / exposedT : null;
  const t = (x: number) => `${num(Math.round(x))} t`;
  return {
    profitK,
    deltaK,
    lossPrice,
    wheatExposedT: exposedT,
    impacts: [
      { id: "price", label: "Wheat price", valueK: priceEffect },
      { id: "yield", label: "Yield", valueK: yieldEffect },
      { id: "fertiliser", label: "Fertiliser", valueK: dFert },
      { id: "rates", label: "Interest rates", valueK: dRates },
    ],
    working: [
      { label: "expected_profit (typical year)", value: gbpK(b.profitK) },
      { label: `wheat_exposed = in store ${t(b.wheatStoreT)} + max(0, 2027 crop ${t(b.wheatCropT)} × ${i.yieldPct}% − sold forward ${t(b.wheatForwardT)})`, value: t(exposedT) },
      { label: `wheat_price_effect = wheat_exposed × (£${num(i.wheatPrice)} − £${num(b.wheatPrice)})/t`, value: gbpK(priceEffect, { sign: true }) },
      { label: `yield_effect = Δ wheat tonnes × £${num(b.wheatPrice)}/t + barley and rape ${gbpK(b.otherCropsK)} × (${i.yieldPct}% − 100%)`, value: gbpK(yieldEffect, { sign: true }) },
      { label: `fertiliser_effect = −${t(b.anUnboughtT)} AN unbought × (£${num(i.fertiliserPrice)} − £${num(b.anPrice)})/t`, value: gbpK(dFert, { sign: true }) },
      { label: `rates_effect = −${gbpK(b.variableDebtK)} variable debt × ${num(i.rateChange, 2)} pts`, value: gbpK(dRates, { sign: true }) },
      { label: "farm_profit = expected_profit + all effects", value: gbpK(profitK) },
      {
        label: "loss_if_wheat_below = wheat_price − (profit before wheat price effect ÷ wheat_exposed)",
        value: lossPrice === null ? "no wheat exposed" : `£${num(Math.round(lossPrice))}/t`,
      },
    ],
  };
}
