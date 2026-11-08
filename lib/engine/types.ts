/** Contracts for the simulation engine. Pure data: no imports with side effects. */
import type { RiskId } from "../types";

export const CROPS = ["wheat", "barley", "osr"] as const;
export type Crop = (typeof CROPS)[number];

export const PRICE_FACTORS = ["wheat", "barley", "osr", "an", "fuel"] as const;
export const YIELD_FACTORS = ["yield_wheat", "yield_barley", "yield_osr"] as const;
/** Order matters: shocks are stored path-major in this order. */
export const FACTORS = [...PRICE_FACTORS, ...YIELD_FACTORS, "bank_rate"] as const;
export type PriceFactor = (typeof PRICE_FACTORS)[number];
export type YieldFactor = (typeof YIELD_FACTORS)[number];
export type FactorId = (typeof FACTORS)[number];

/** Which factors drive each risk. Regulation is an event scenario, not a factor. */
export const RISK_FACTORS: Record<RiskId, FactorId[]> = {
  output_prices: ["wheat", "barley", "osr"],
  input_prices: ["an", "fuel"],
  weather_yield: ["yield_wheat", "yield_barley", "yield_osr"],
  interest_rates: ["bank_rate"],
  regulation: [],
};

export interface SeriesPoint {
  /** `YYYY-MM-01` for monthly series, `YYYY` for annual series. */
  date: string;
  value: number;
}

export interface Series {
  id: FactorId;
  label: string;
  /** "index (2020=100)", "t/ha" or "%". */
  unit: string;
  frequency: "monthly" | "annual";
  source: string;
  url: string;
  licence: string;
  fetchedAt: string;
  /** sha256 of the raw downloaded file. */
  sha256: string;
  points: SeriesPoint[];
}

export type History = Record<FactorId, Series>;

/** Everything the P&L needs, worked out in code from the profile (lib/engine/farm.ts). */
export interface FarmInputs {
  crops: Record<Crop, { areaHa: number; yieldTHa: number; forwardT: number }>;
  /** Last harvest still in store; marked to market. */
  stockT: Record<Crop, number>;
  /** Today's levels: £/t for crops and AN, pence per litre for fuel. */
  priceToday: Record<PriceFactor, number>;
  anNeedT: number;
  anBoughtT: number;
  anPricePaid: number;
  dieselL: number;
  dieselBoughtPct: number;
  sprayGbp: number;
  sfiAnnual: number;
  fixedCosts: number;
  loan: number;
  loanVariable: boolean;
  loanMarginPct: number;
  bankRatePct: number;
  capitalRepayment: number;
}

export interface SimConfig {
  paths: number;
  /** Student-t degrees of freedom, fixed in advance (integer > 2). */
  nu: number;
  horizonMonths: number;
  /** Minimum months of joint history before a fit is allowed. */
  warmupMonths: number;
  seed: number;
  /** Event scenario: probability of a scheme payment cut, and the share cut. Assumption, not fitted. */
  regulation: { prob: number; cutShare: number };
  dscrThreshold: number;
  /** Stated costs of the options. Assumptions, labelled as such on screen. */
  optionCosts: { forwardGbpT: number; fixRateSpreadPct: number; buyAnCarryPct: number };
}

export const ENGINE_VERSION = "1.0.0";

export const DEFAULT_CONFIG: SimConfig = {
  paths: 10_000,
  nu: 5,
  horizonMonths: 12,
  warmupMonths: 36,
  seed: 42,
  regulation: { prob: 0.1, cutShare: 0.5 },
  dscrThreshold: 1.25,
  optionCosts: { forwardGbpT: 3, fixRateSpreadPct: 0.5, buyAnCarryPct: 2 },
};

export type FigureUnit = "gbp" | "gbp_t" | "pct" | "prob" | "ratio" | "score";

/** One number the engine produced, with the formula and inputs behind it. */
export interface Figure {
  /** Stable id, e.g. "risk.output_prices.p5_hit". The agent cites these. */
  id: string;
  label: string;
  value: number;
  unit: FigureUnit;
  /** How the agent must write it, e.g. "£23k". The figure checker matches this text. */
  display: string;
  formula: string;
  /** Figure ids, profile field keys or series ids this was computed from. */
  inputs: string[];
}

export interface Calibration {
  factor: FactorId;
  /** Standard deviation over the horizon (log-change for prices, relative shock for yields, pp for rates). */
  sigma: number;
  n: number;
  from: string;
  to: string;
}

export interface RiskFigures {
  riskId: RiskId;
  factors: FactorId[];
  p5Hit: Figure;
  cvar5Hit: Figure;
  score: Figure;
}

export interface OptionFigures {
  id: "sell_forward_wheat_50" | "buy_an_now" | "fix_rate";
  riskId: RiskId;
  label: string;
  cost: Figure;
  /** Change in the 1-in-20 profit, net of cost. Positive = better bad year. */
  p5Gain: Figure;
}

export interface SimResult {
  meta: { asOf: string; seed: number; paths: number; nu: number; configHash: string; engineVersion: string };
  calibration: Calibration[];
  correlation: { factors: FactorId[]; matrix: number[][]; shrinkage: number };
  profit: { mean: Figure; p5: Figure; p50: Figure; p95: Figure; cvar5: Figure; lossProb: Figure };
  risks: RiskFigures[];
  options: OptionFigures[];
  dscr: { pBelow: Figure; mainDriver: FactorId; threshold: number };
  thresholds: Figure[];
  /** Every figure above, by id. */
  figures: Record<string, Figure>;
}

export type BacktestModel = "mc" | "normal_refit" | "hist_sim";

export interface BacktestRow {
  series: FactorId;
  origin: string;
  horizonMonths: number;
  model: BacktestModel;
  p5: number;
  p95: number;
  realised: number;
  breachLow: boolean;
  breachHigh: boolean;
  pinball: number;
  configHash: string;
}

export interface BacktestSummary {
  series: FactorId;
  model: BacktestModel;
  period: "development" | "held_out" | "all";
  n: number;
  breachLowRate: number;
  breachLowCI: [number, number];
  breachHighRate: number;
  breachHighCI: [number, number];
  kupiecLowP: number;
  christoffersenLowP: number;
  pinballMean: number;
  breachMonths: string[];
}

export interface WholeFarmRow {
  harvestYear: number;
  asOf: string;
  p5: number;
  p50: number;
  p95: number;
  realised: number;
  breachLow: boolean;
  breachHigh: boolean;
}
