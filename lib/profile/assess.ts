/**
 * Stand-in for the simulation engine (build step 2): re-scales each risk's exposure model to
 * a new snapshot and recomputes the figures that follow from it. Agent-written text (summary,
 * reasoning) is kept from the previous assessment until the writer agent exists.
 */
import { gbpK } from "../format";
import { scoreFromBadYear } from "../score";
import { normalCdf, riskWorking, simulateExposure, Z95 } from "../sim";
import type { ExposureModel, ProfitSummary, RiskExposure, RiskResult, Source } from "../types";

/** Exposure in the risk model's own unit (£k or ha) from the snapshot. */
function modelExposure(risk: RiskResult, exposures: RiskExposure[], hectares: number): number | null {
  if (risk.model.unit === "ha") return hectares;
  const e = exposures.find((x) => x.riskId === risk.id);
  return e ? Math.round(e.total / 1000) : null;
}

export function rebuildRisk(risk: RiskResult, exposure: number, typicalProfit: number): RiskResult {
  const model: ExposureModel = { ...risk.model, exposure, meanK: typicalProfit / 1000 };
  const badYear = Math.round((exposure * model.unitSd * Z95) / 1000) * 1000;
  return {
    ...risk,
    model,
    badYear,
    score: scoreFromBadYear(badYear, typicalProfit),
    pctOfProfit: Math.round((badYear / typicalProfit) * 100),
    working: riskWorking(model, simulateExposure(model, exposure, model.meanK)),
    mitigations: risk.mitigations.map((m) => ({
      ...m,
      scoreAfter: scoreFromBadYear(m.benefitKind === "profit" ? badYear : Math.max(0, badYear - m.badYearReduction), typicalProfit),
    })),
  };
}

export function profitSummary(args: {
  meanK: number;
  output: ExposureModel;
  otherSdK: number;
  deltaWeekK: number;
  deltaWeekLabel: string;
  sources?: Source[];
}): ProfitSummary {
  const { meanK, output, otherSdK } = args;
  const outputSdK = (output.exposure * output.unitSd) / 1000;
  const farmSdK = Math.sqrt(outputSdK ** 2 + otherSdK ** 2);
  const badK = meanK - Z95 * farmSdK;
  const goodK = meanK + Z95 * farmSdK;
  const lossChance = normalCdf(-meanK / farmSdK);
  const pct = `${(output.unitSd / 10).toFixed(1)}%`;
  return {
    expected: meanK * 1000,
    badYear: Math.round(badK) * 1000,
    goodYear: Math.round(goodK) * 1000,
    lossChance: Math.round(lossChance * 100) / 100,
    lossYearsOf20: Math.round(lossChance * 20),
    deltaWeek: Math.round(args.deltaWeekK) * 1000,
    working: [
      { label: "expected_profit (3-yr average, price-adjusted)", value: gbpK(meanK) },
      { label: `output_prices_sd = ${gbpK(output.exposure)} unsold × ${pct}`, value: gbpK(outputSdK) },
      { label: "other_risks_sd", value: gbpK(otherSdK) },
      { label: "farm_sd = √(output_prices_sd² + other_risks_sd²)", value: gbpK(farmSdK) },
      { label: `bad_year = expected − ${Z95} × farm_sd`, value: gbpK(badK) },
      { label: `good_year = expected + ${Z95} × farm_sd`, value: gbpK(goodK) },
      { label: "loss_chance = Φ(−expected ÷ farm_sd)", value: `${Math.round(lossChance * 100)}% (${Math.round(lossChance * 20)} in 20)` },
      { label: args.deltaWeekLabel, value: gbpK(args.deltaWeekK, { sign: true }) },
    ],
    sources: args.sources,
  };
}

export function reassess(
  risks: RiskResult[],
  profit: ProfitSummary,
  exposures: RiskExposure[],
  hectares: number,
  typicalProfit: number
): { risks: RiskResult[]; profit: ProfitSummary } {
  const next = risks.map((r) => {
    const exposure = modelExposure(r, exposures, hectares);
    return exposure === null ? r : rebuildRisk(r, exposure, typicalProfit);
  });
  const output = next.find((r) => r.id === "output_prices");
  if (!output) return { risks: next, profit };
  return {
    risks: next,
    profit: profitSummary({
      meanK: typicalProfit / 1000,
      output: output.model,
      otherSdK: output.model.otherSdK,
      deltaWeekK: profit.deltaWeek / 1000,
      deltaWeekLabel: profit.working?.at(-1)?.label ?? "change vs last week",
      sources: profit.sources,
    }),
  };
}
