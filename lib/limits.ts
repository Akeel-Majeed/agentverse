/**
 * The farm's own loss limit, enforced in code: the largest loss the farmer said the farm could
 * take in one year (`ins.max_loss`), checked against the whole-farm bad year and against each
 * risk on its own. No model involved. If the limit isn't recorded or confirmed, the check says
 * so and asks the farmer rather than assuming one.
 */
import { gbp } from "./format";
import type { FigureDetail, ProfitSummary, RiskResult, WorkingStep } from "./types";

export interface LossLimit {
  /** £ the farmer said the farm could lose in one year; null if not recorded. */
  limit: number | null;
  /** False until the farmer has confirmed the figure themselves. */
  confirmed: boolean;
  /** £ lost in a 1-in-20 bad year for the whole farm (0 if it still makes a profit). */
  farmLoss: number;
  /** True when the whole-farm bad-year loss is past the limit. */
  breached: boolean;
  /** Risks whose bad year alone, with every other risk at normal, would lose more than the limit. */
  risksOver: { id: string; name: string; loss: number }[];
  working: WorkingStep[];
}

/** Loss in a bad year for this risk alone: its hit, less the profit a typical year makes. */
export const lossFromRisk = (badYear: number, typicalProfit: number) => Math.max(0, badYear - typicalProfit);

export function checkLossLimit(args: {
  limit: number | null;
  confirmed: boolean;
  profit: Pick<ProfitSummary, "badYear">;
  risks: Pick<RiskResult, "id" | "name" | "badYear">[];
  typicalProfit: number;
}): LossLimit {
  const { limit, confirmed, profit, risks, typicalProfit } = args;
  const farmLoss = Math.max(0, -profit.badYear);
  const risksOver =
    limit === null
      ? []
      : risks
          .map((r) => ({ id: r.id, name: r.name, loss: lossFromRisk(r.badYear, typicalProfit) }))
          .filter((r) => r.loss > limit)
          .sort((a, b) => b.loss - a.loss);
  return {
    limit,
    confirmed,
    farmLoss,
    breached: limit !== null && farmLoss > limit,
    risksOver,
    working: [
      { label: "loss_limit (your answer in Insurance and limits)", value: limit === null ? "not recorded" : `${gbp(limit)}${confirmed ? "" : " · not yet confirmed"}` },
      { label: "farm_profit_bad_year (all risks, 1-in-20)", value: gbp(profit.badYear) },
      { label: "farm_loss_bad_year = max(0, −farm_profit_bad_year)", value: gbp(farmLoss) },
      { label: "breached = farm_loss_bad_year > loss_limit", value: limit === null ? "can't check" : farmLoss > limit ? "yes" : "no" },
      ...risksOver.map((r) => ({ label: `${r.name} alone = bad_year_hit − typical_profit (${gbp(typicalProfit)})`, value: `${gbp(r.loss)} loss` })),
    ],
  };
}

export function lossLimitDetail(l: LossLimit): FigureDetail {
  return {
    title: "Your loss limit",
    value: l.limit === null ? "Not recorded" : gbp(l.limit),
    description:
      "The largest loss you said the farm could take in one year, checked in code against a 1-in-20 bad year for the whole farm and for each risk on its own.",
    working: l.working,
    sources: [{ label: "Largest loss you could take in one year", origin: l.confirmed ? "Farm profile · confirmed by you" : "Farm profile · not yet confirmed" }],
  };
}
