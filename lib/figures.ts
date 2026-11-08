import { amount, gbp, gbpK, num } from "./format";
import { formatShock, riskWorking, simulateExposure, Z95, type RiskSim, type TradeoffRow } from "./sim";
import type { FigureDetail, Mitigation, ProfitSummary, RiskResult } from "./types";

/** Builders for the side-sheet explanation behind every clickable £ figure. */

export function riskBadYearDetail(risk: RiskResult): FigureDetail {
  return {
    title: `${risk.name}: bad-year hit`,
    value: gbp(risk.badYear),
    description: `How much ${risk.name.toLowerCase()} could take off farm profit in a 1-in-20 bad year. ${risk.pctOfProfit}% of typical profit.`,
    working: risk.working,
    sources: risk.sources,
  };
}

export function simDetail(risk: RiskResult, sim: RiskSim, title: string, valueK: number, description?: string): FigureDetail {
  return {
    title,
    value: gbpK(valueK),
    description,
    working: riskWorking(risk.model, sim),
    sources: risk.sources,
  };
}

export function mitigationDetail(risk: RiskResult, m: Mitigation): FigureDetail {
  const { model } = risk;
  const removed = m.effect.tonnesRemoved ?? m.effect.unitsRemoved ?? 0;
  if (m.benefitKind === "profit") {
    return {
      title: m.title,
      value: `+${gbp(m.badYearReduction)}/yr`,
      description: m.description,
      // The saving is the option's own estimate (see its description and sources); shown as such,
      // not as a calculation this page did.
      working: [
        { label: model.keys.exposure, value: amount(model.exposure, model.unit) },
        { label: "saving_a_year (the option's estimate)", value: `${gbp(m.badYearReduction)}/yr` },
        { label: "saving_as_share_of_exposure", value: `${num((m.badYearReduction / (model.exposure * (model.unit === "£k" ? 1000 : 1))) * 100, 1)}%` },
        { label: "bad_year_hit (unchanged: this raises profit, it doesn't cut the risk)", value: gbp(risk.badYear) },
        { label: "score_after", value: `${m.scoreAfter} / 10` },
      ],
      sources: risk.sources,
    };
  }
  const after = simulateExposure(model, model.exposure - removed, model.meanK);
  return {
    title: m.title,
    value: `−${gbp(m.badYearReduction)}`,
    description: `${m.description} Cost: ${m.cost}.`,
    working: [
      { label: `${model.keys.exposure}_removed`, value: amount(removed, model.unit) },
      { label: model.keys.shock, value: formatShock(model, model.unitSd * Z95) },
      { label: `reduction = removed × ${model.keys.shock}`, value: gbp(m.badYearReduction) },
      { label: "bad_year_hit_after", value: gbpK(after.hitK) },
      ...(m.effect.meanCost ? [{ label: "cost_to_expected_profit", value: gbpK(-m.effect.meanCost) }] : []),
      { label: "score_after", value: `${m.scoreAfter} / 10` },
    ],
    sources: risk.sources,
  };
}

export function tradeoffDetail(
  risk: RiskResult,
  row: TradeoffRow,
  field: "hitK" | "badYearProfitK" | "upsideGivenUpK"
): FigureDetail {
  const { model } = risk;
  const pct = `${Math.round(row.share * 100)}%`;
  const sim = simulateExposure(model, row.exposure, model.meanK);
  if (field === "upsideGivenUpK") {
    const hedged = row.share * model.tradeoff.hedgeable;
    return {
      title: `Upside given up at ${pct}`,
      value: gbpK(row.upsideGivenUpK),
      description: "What you would miss in a 1-in-20 good year by fixing this share now.",
      working: [
        { label: "amount_hedged", value: amount(hedged, model.unit) },
        { label: `good_year_move = ${model.keys.sd} × ${Z95}`, value: formatShock(model, model.unitSd * Z95) },
        { label: "upside_given_up = amount_hedged × good_year_move", value: gbpK(row.upsideGivenUpK) },
      ],
      sources: risk.sources,
    };
  }
  const title = field === "hitK" ? `Bad-year hit at ${pct}` : `Farm profit in a bad year at ${pct}`;
  return simDetail(risk, sim, title, row[field], model.tradeoff.note);
}

export function profitDetail(p: ProfitSummary, which: "expected" | "badYear" | "goodYear" | "deltaWeek", harvestYear?: number): FigureDetail {
  const titles = {
    expected: harvestYear ? `Expected profit, ${harvestYear} harvest year` : "Expected profit",
    badYear: "Farm profit in a bad year",
    goodYear: "Farm profit in a good year",
    deltaWeek: "Change in expected profit vs last week",
  };
  return {
    title: titles[which],
    value: gbp(p[which], { sign: which === "deltaWeek" }),
    description: "All five risks combined. Bad and good years are 1-in-20 outcomes.",
    working: p.working ?? [],
    sources: p.sources ?? [],
  };
}
