import { amount, gbp, gbpK } from "./format";
import { formatShock, riskWorking, simulateExposure, Z95, type RiskSim, type TradeoffRow } from "./sim";
import type { FigureDetail, Mitigation, ProfitSummary, RiskResult } from "./types";

/** Builders for the side-sheet explanation behind every clickable £ figure. */

export function riskBadYearDetail(risk: RiskResult): FigureDetail {
  return {
    title: `${risk.name}: bad-year hit`,
    value: gbp(risk.badYear),
    description: `How much ${risk.name.toLowerCase()} on its own could take off farm profit in an estimated 1-in-20 bad year (the 95th-percentile downside under the model's assumptions). ${risk.pctOfProfit}% of typical profit. This is not the whole-farm result: risks rarely all peak together, so category hits don't add up.`,
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
      working: [
        { label: model.exposureLabel, value: amount(model.exposure, model.unit), formula: model.keys.exposure },
        { label: "Your margin over Bank Rate today", value: "3.1%", formula: "margin_today" },
        { label: "Margin well-secured farms pay", value: "1.3–1.8%", formula: "margin_well_secured" },
        {
          label: "Yearly saving if you paid 1.8%, the top of that range",
          value: `${gbp(m.badYearReduction)}/yr`,
          formula: `saving = ${model.keys.exposure} × (3.1% − 1.8%)`,
        },
        { label: "Risk score afterwards (unchanged: this raises profit, not the bad-year hit)", value: `${m.scoreAfter} / 10`, formula: "score_after" },
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
      { label: `${model.exposureLabel} removed`, value: amount(removed, model.unit), formula: `${model.keys.exposure}_removed` },
      { label: model.shockLabel, value: formatShock(model, model.unitSd * Z95), formula: model.keys.shock },
      { label: "Cut in this risk's bad-year hit", value: gbp(m.badYearReduction), formula: `reduction = removed × ${model.keys.shock}` },
      { label: "This risk's bad-year hit afterwards", value: gbpK(after.hitK), formula: "bad_year_hit_after" },
      ...(m.effect.meanCost
        ? [{ label: "Cost to expected profit", value: gbpK(-m.effect.meanCost), formula: "cost_to_expected_profit" }]
        : []),
      { label: "Risk score afterwards", value: `${m.scoreAfter} / 10`, formula: "score_after" },
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
        { label: "Amount fixed now", value: amount(hedged, model.unit), formula: "amount_hedged" },
        { label: "Move in a 1-in-20 good year", value: formatShock(model, model.unitSd * Z95), formula: `good_year_move = ${model.keys.sd} × ${Z95}` },
        { label: "Upside given up", value: gbpK(row.upsideGivenUpK), formula: "upside_given_up = amount_hedged × good_year_move" },
      ],
      sources: risk.sources,
    };
  }
  const title = field === "hitK" ? `Bad-year hit at ${pct}` : `Farm profit in a bad year at ${pct}`;
  return simDetail(risk, sim, title, row[field], model.tradeoff.note);
}

export function profitDetail(p: ProfitSummary, which: "expected" | "badYear" | "goodYear" | "deltaWeek"): FigureDetail {
  const titles = {
    expected: "Expected profit, 2027 harvest year",
    badYear: "Farm profit in a bad year",
    goodYear: "Farm profit in a good year",
    deltaWeek: "Change in expected profit vs last week",
  };
  return {
    title: titles[which],
    value: gbp(p[which], { sign: which === "deltaWeek" }),
    description:
      "Whole farm, all risks combined. Bad and good years are estimated 1-in-20 outcomes (5th and 95th percentiles) under the model's assumptions, not forecasts.",
    working: p.working ?? [],
    sources: p.sources ?? [],
  };
}
