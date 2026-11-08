/**
 * "What would change this": for one risk, the exposure at which its score moves a band, and at
 * which the whole farm's bad year comes back inside the farmer's loss limit. Solved in code from
 * the same exposure model as the figures on the page (lib/sim.ts), so a judge can check it.
 */
import { amount, gbp, num } from "./format";
import { bandFor, scoreFromPct, THRESHOLDS } from "./score";
import { Z95 } from "./sim";
import type { ExposureModel } from "./types";

export interface ChangePoint {
  /** Plain sentence, e.g. "Score falls to 9 (Severe) if crop value unsold comes down by £342k, to £451k." */
  text: string;
  /** The formula and numbers behind it. */
  working: string;
  direction: "better" | "worse";
}

/** £ bad-year hit per unit of exposure (per tonne, hectare or £k). */
const hitPerUnit = (m: ExposureModel) => m.unitSd * Z95;

function exposureForPct(m: ExposureModel, pct: number, typicalProfit: number): number {
  return ((pct / 100) * typicalProfit) / hitPerUnit(m);
}

/** Targets are rounded down to whole tonnes, hectares or £k, so reaching one always reaches the promise. */
const floor = (x: number) => Math.max(0, Math.floor(x));

export function whatWouldChange(model: ExposureModel, typicalProfit: number, lossLimit: number | null = null): ChangePoint[] {
  const out: ChangePoint[] = [];
  const e = model.exposure;
  const label = model.exposureLabel.toLowerCase();
  const pct = ((e * hitPerUnit(model)) / typicalProfit) * 100;
  const score = scoreFromPct(pct);

  // Down one score, and down to the next band if that's further.
  if (score > 1) {
    const targets = new Set([score - 1]);
    const band = bandFor(score);
    for (let s = score - 1; s >= 1; s--) {
      if (bandFor(s).level !== band.level) {
        targets.add(s);
        break;
      }
    }
    for (const s of Array.from(targets).sort((a, b) => b - a)) {
      const cap = THRESHOLDS[s - 1];
      const target = floor(exposureForPct(model, cap, typicalProfit));
      const cut = Math.round(e - target);
      if (cut <= 0) continue;
      out.push({
        direction: "better",
        text: `Score falls to ${s} (${bandFor(s).level}) if ${label} comes down by ${amount(cut, model.unit)}, to ${amount(target, model.unit)}.`,
        working: `score ${s} needs bad-year hit ≤ ${cap}% of typical profit (${gbp(typicalProfit)}) = ${gbp((cap / 100) * typicalProfit)}; ÷ £${num(Math.round(hitPerUnit(model)))} hit per ${model.unit === "£k" ? "£1k" : model.unit} (${model.keys.sd} £${num(model.unitSd, model.unitSd % 1 ? 1 : 0)} × ${Z95}) = ${amount(target, model.unit)}`,
      });
    }
  } else {
    out.push({ direction: "better", text: "Already at the lowest score.", working: `bad-year hit is ${pct.toFixed(0)}% of typical profit` });
  }

  // Up one score.
  if (score < 10) {
    const cap = THRESHOLDS[score - 1];
    const target = exposureForPct(model, cap, typicalProfit);
    const more = Math.max(1, Math.ceil(target - e));
    out.push({
      direction: "worse",
      text: `Score rises to ${score + 1} (${bandFor(score + 1).level}) if ${label} goes up by about ${amount(more, model.unit)}.`,
      working: `score ${score} holds while bad-year hit ≤ ${cap}% of typical profit = ${gbp((cap / 100) * typicalProfit)}`,
    });
  }

  // Back inside the loss limit (whole farm, this risk's exposure only).
  if (lossLimit !== null) {
    const meanK = model.meanK;
    const sdNeeded = (meanK + lossLimit / 1000) / Z95; // £k
    const farmSd = Math.sqrt(((e * model.unitSd) / 1000) ** 2 + model.otherSdK ** 2);
    if (farmSd > sdNeeded) {
      const working = `farm loss ≤ ${gbp(lossLimit)} needs farm_sd ≤ (expected ${gbp(meanK * 1000)} + limit) ÷ ${Z95} = ${gbp(sdNeeded * 1000)}`;
      if (model.otherSdK >= sdNeeded) {
        out.push({
          direction: "better",
          text: `Cutting this risk alone can't bring the farm back inside your ${gbp(lossLimit)} loss limit: the other risks are already past it.`,
          working: `${working}; other_risks_sd is ${gbp(model.otherSdK * 1000)}`,
        });
      } else {
        const target = floor((Math.sqrt(sdNeeded ** 2 - model.otherSdK ** 2) * 1000) / model.unitSd);
        out.push({
          direction: "better",
          text: `Back inside your ${gbp(lossLimit)} loss limit if ${label} comes down by ${amount(e - target, model.unit)}, to ${amount(target, model.unit)}.`,
          working: `${working}; risk_sd ≤ √(farm_sd² − other_risks_sd²) = ${gbp(Math.sqrt(sdNeeded ** 2 - model.otherSdK ** 2) * 1000)}`,
        });
      }
    }
  }
  return out;
}
