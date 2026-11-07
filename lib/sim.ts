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
  if (model.unit === "£k") return `${num(perUnit / 10, 1)}%`;
  return `£${num(Math.round(perUnit))}/${model.unit}`;
}

export function riskWorking(model: ExposureModel, sim: RiskSim): WorkingStep[] {
  const { exposure: ek, sd, shock } = model.keys;
  return [
    { label: model.exposureLabel, value: amount(sim.exposure, model.unit), formula: ek },
    { label: "Typical yearly swing (1 standard deviation)", value: formatShock(model, model.unitSd), formula: sd },
    { label: model.shockLabel, value: formatShock(model, model.unitSd * Z95), formula: `${shock} = ${sd} × ${Z95}` },
    { label: "This risk's hit in a 1-in-20 bad year", value: gbpK(sim.hitK), formula: `bad_year_hit = ${ek} × ${shock}` },
    { label: "This risk's typical swing in profit", value: gbpK(sim.riskSdK), formula: `risk_sd = ${ek} × ${sd}` },
    { label: "Typical swing from all other risks", value: gbpK(model.otherSdK), formula: "other_risks_sd" },
    { label: "Whole-farm typical swing (risks don't all peak together)", value: gbpK(sim.sdK), formula: "farm_sd = √(risk_sd² + other_risks_sd²)" },
    { label: "Expected farm profit", value: gbpK(sim.meanK), formula: "expected_profit" },
    {
      label: "Whole-farm profit in a 1-in-20 bad year",
      value: gbpK(sim.badYearProfitK),
      formula: `bad_year_profit = expected_profit − ${Z95} × farm_sd`,
    },
    { label: "Loss-making years (modelled)", value: `${sim.lossYears} in 20`, formula: "loss_years = 20 × Φ(−expected_profit ÷ farm_sd)" },
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

/* ---------- What-if (all values £k) ---------- */

const WHEAT_T = 1870;
const BASE_WHEAT = 178;
const OTHER_CROPS_K = 277;
const BASE_AN = 504;
const AN_T = 166;
const VARIABLE_DEBT_K = 840;
const BASE_PROFIT_K = 85;

export interface WhatIfResult {
  profitK: number;
  deltaK: number;
  /** Wheat price (£/t) below which the farm makes a loss. */
  lossPrice: number;
  impacts: { id: "price" | "yield" | "fertiliser" | "rates"; label: string; valueK: number }[];
}

export function whatIf(i: WhatIfInputs): WhatIfResult {
  const y = i.yieldPct / 100;
  const dWheat = (WHEAT_T * y * i.wheatPrice - WHEAT_T * BASE_WHEAT) / 1000;
  const dOther = OTHER_CROPS_K * (y - 1);
  const dFert = (-AN_T * (i.fertiliserPrice - BASE_AN)) / 1000;
  const dRates = (-VARIABLE_DEBT_K * i.rateChange) / 100;
  const priceEffect = (WHEAT_T * y * (i.wheatPrice - BASE_WHEAT)) / 1000;
  const yieldEffect = (WHEAT_T * (y - 1) * BASE_WHEAT) / 1000 + dOther;
  const profitK = BASE_PROFIT_K + dWheat + dOther + dFert + dRates;
  const lossPrice =
    -(BASE_PROFIT_K - (WHEAT_T * BASE_WHEAT) / 1000 + dOther + dFert + dRates) / ((WHEAT_T / 1000) * y);
  return {
    profitK,
    deltaK: profitK - BASE_PROFIT_K,
    lossPrice,
    impacts: [
      { id: "price", label: "Wheat price", valueK: priceEffect },
      { id: "yield", label: "Yield", valueK: yieldEffect },
      { id: "fertiliser", label: "Fertiliser", valueK: dFert },
      { id: "rates", label: "Interest rates", valueK: dRates },
    ],
  };
}
