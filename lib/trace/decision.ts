/**
 * The hedge a run recommends. The judge only ranks; code decides which options protect the bad
 * year (engine `option.<id>.p5_gain` > 0) and works out the bad year after it.
 */
import { display } from "../engine/display";
import type { Figure, SimResult } from "../engine/types";
import type { Judgement } from "../agents/risk/schema";
import type { EngineResultEvent, TraceEvent } from "./types";

export type HedgeChoice = "discuss" | "not_now";

export interface HedgeOption {
  optionId: string;
  label: string;
  rank: number;
  reason: string;
  cites: string[];
  cost: Figure;
  p5Gain: Figure;
}

export interface HedgeDecision {
  /** null: no ranked option improves the 1-in-20 year. */
  hedge: HedgeOption | null;
  badYearBefore: Figure;
  /** profit.p5 + the hedge's p5_gain, computed here; null without a hedge. */
  badYearAfter: string | null;
  /** Ranked options whose p5_gain is zero or negative: they make the bad year worse. */
  ruledOut: HedgeOption[];
  changeMyMind: { thresholdId: string; statement: string; display: string | null }[];
  farmerDecision: { optionId: string; choice: HedgeChoice; at: string } | null;
}

/** null when the run has no judge.output, or its figure check isn't clean (the prose stays withheld, as on the timeline). */
export function hedgeDecision(events: TraceEvent[]): HedgeDecision | null {
  const last = (type: string) => events.findLast((e) => e.type === type);
  const output = last("judge.output");
  const engine = last("engine.result");
  const checker = last("checker.result");
  if (!output || !engine || !checker || (JSON.parse(checker.body).untraced ?? []).length > 0) return null;
  const j = JSON.parse(output.body) as Judgement;
  const sim = (JSON.parse(engine.body) as EngineResultEvent).sim as SimResult;
  const f = sim.figures;

  // Options the engine never priced are dropped: code can't check them.
  const options: HedgeOption[] = [...j.ranked_options]
    .sort((a, b) => a.rank - b.rank)
    .filter((o) => f[`option.${o.option_id}.p5_gain`] && f[`option.${o.option_id}.cost`])
    .map((o) => ({
      optionId: o.option_id,
      label: sim.options.find((x) => x.id === o.option_id)?.label ?? o.option_id,
      rank: o.rank,
      reason: o.reason,
      cites: o.cites,
      cost: f[`option.${o.option_id}.cost`],
      p5Gain: f[`option.${o.option_id}.p5_gain`],
    }));
  const hedge = options.find((o) => o.p5Gain.value > 0) ?? null;
  const p5 = f["profit.p5"];
  const decided = last("decision.farmer");

  return {
    hedge,
    badYearBefore: p5,
    badYearAfter: hedge ? display(p5.value + hedge.p5Gain.value, "gbp") : null,
    ruledOut: options.filter((o) => o.p5Gain.value <= 0),
    changeMyMind: j.change_my_mind.map((c) => ({ thresholdId: c.threshold_id, statement: c.statement, display: f[c.threshold_id]?.display ?? null })),
    farmerDecision: decided ? JSON.parse(decided.body) : null,
  };
}
