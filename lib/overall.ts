import { bandFor, scoreFromPct, type RiskLevel } from "./score";
import { normalCdf, Z95 } from "./sim";
import type { InputQuality, RiskResult } from "./types";

/**
 * Overall farm risk: a derived 1–10 score for the whole farm, separate from the five category scores.
 *
 * It scores how deep a loss the whole farm could make in a 1-in-20 bad year, as a share of a typical
 * year's profit, using the same bands as the category scores (lib/score.ts):
 *
 *   farm_sd          = √(Σ category_sd² + unattributed_sd²)      categories treated as independent
 *   bad_year_profit  = expected_profit − 1.65 × farm_sd           1-in-20 bad year, whole farm
 *   overall          = scoreFromPct(max(0, −bad_year_profit) ÷ typical_profit × 100)
 *
 * `unattributedSdK` is the part of whole-farm variability not explained by the five categories (other
 * crop prices, costs). It is calibrated so the aggregate reproduces the published whole-farm bad year.
 * Missing category data never counts as zero risk: the result is "incomplete" and has no score.
 */

export interface CategoryExposure {
  id: string;
  name: string;
  /** Category score shown on its own ring, 1–10; null when the input is missing. */
  score: number | null;
  /** One standard deviation of this category's effect on profit, £k; null when the input is missing. */
  sdK: number | null;
  quality: InputQuality;
}

export interface OverallInput {
  expectedProfitK: number;
  typicalProfitK: number;
  unattributedSdK: number;
  categories: CategoryExposure[];
}

export type OverallState = "complete" | "provisional" | "incomplete";

export interface OverallRisk {
  /** 1–10, or null when any category is missing. */
  score: number | null;
  level: RiskLevel | null;
  state: OverallState;
  /**
   * Score computed from the categories that do have data. Because the score never falls when exposure
   * rises, this is a floor for the true score when some categories are missing.
   */
  floorScore: number;
  farmSdK: number;
  badYearProfitK: number;
  /** Bad-year loss as a % of typical profit (0 when a bad year still leaves a profit). */
  lossPct: number;
  lossChance: number;
  highest: { id: string; name: string; score: number } | null;
  /** Categories whose inputs are not confirmed, worst first. */
  issues: { id: string; name: string; quality: Exclude<InputQuality, "confirmed"> }[];
}

const QUALITY_RANK: Record<InputQuality, number> = { missing: 3, stale: 2, unconfirmed: 1, confirmed: 0 };

/** Fixed outer-to-inner ring order, repeated in the category breakdown. */
export const RING_ORDER = ["wheat-price", "weather-yield", "fertiliser-price", "scheme-payments", "interest-rates"];

export function categoryFromRisk(risk: RiskResult): CategoryExposure {
  const missing = risk.dataQuality.quality === "missing";
  return {
    id: risk.id,
    name: risk.name,
    score: missing ? null : risk.score,
    sdK: missing ? null : (risk.model.exposure * risk.model.unitSd) / 1000,
    quality: risk.dataQuality.quality,
  };
}

export function combineSd(sdsK: number[]): number {
  return Math.sqrt(sdsK.reduce((s, sd) => s + Math.max(0, sd) ** 2, 0));
}

/** Residual sd that makes the five categories reconcile to an already-published whole-farm sd. */
export function unattributedSd(farmSdK: number, categorySdsK: number[]): number {
  const explained = categorySdsK.reduce((s, sd) => s + sd ** 2, 0);
  return Math.sqrt(Math.max(farmSdK ** 2 - explained, 0));
}

export function overallRisk(input: OverallInput): OverallRisk {
  const known = input.categories.filter((c) => c.sdK !== null && c.quality !== "missing");
  const missing = known.length < input.categories.length;
  const farmSdK = combineSd([...known.map((c) => c.sdK as number), input.unattributedSdK]);
  const badYearProfitK = input.expectedProfitK - Z95 * farmSdK;
  const lossPct = (Math.max(0, -badYearProfitK) / input.typicalProfitK) * 100;
  const floorScore = scoreFromPct(lossPct);
  const score = missing ? null : floorScore;

  const issues: OverallRisk["issues"] = input.categories
    .filter((c) => c.quality !== "confirmed" || c.sdK === null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      quality: c.sdK === null ? "missing" : (c.quality as Exclude<InputQuality, "confirmed">),
    }))
    .sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality]);

  const scored = input.categories.filter((c): c is CategoryExposure & { score: number } => c.score !== null);
  const top = scored.reduce<(typeof scored)[number] | null>((best, c) => (!best || c.score > best.score ? c : best), null);

  return {
    score,
    level: score === null ? null : bandFor(score).level,
    state: missing ? "incomplete" : issues.length > 0 ? "provisional" : "complete",
    floorScore,
    farmSdK,
    badYearProfitK,
    lossPct,
    lossChance: normalCdf(-input.expectedProfitK / farmSdK),
    highest: top ? { id: top.id, name: top.name, score: top.score } : null,
    issues,
  };
}
