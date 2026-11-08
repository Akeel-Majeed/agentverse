/**
 * What the chat agent reads from the Monte Carlo engine, the risk analyst's runs, the evaluation
 * and the farmer's documents. Pure functions over stored results: every figure is passed on as
 * the engine displays it (Figure.display), so the figure checker can trace it to a tool result.
 */
import type { BacktestSummary, Figure, SimResult } from "../../engine/types";
import { fieldDef, riskName } from "../../profile/catalogue";
import type { AgentRun, Observation, TraceEvent } from "../../trace/types";
import type { RiskId } from "../../types";

const FACTOR_NAMES: Record<string, string> = {
  wheat: "feed wheat price",
  barley: "feed barley price",
  osr: "oilseed rape price",
  an: "ammonium nitrate price",
  fuel: "red diesel price",
  yield_wheat: "wheat yield",
  yield_barley: "barley yield",
  yield_osr: "rape yield",
  bank_rate: "Bank Rate",
};
export const factorName = (id: string) => FACTOR_NAMES[id] ?? id;

const pct = (x: number, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const fig = (f: Figure) => ({ value: f.display, how: f.formula });

const STATUS_TEXT: Record<AgentRun["status"], string> = {
  numbers_only: "numbers published; the analyst agent didn't run (no Gemini key, or not run yet)",
  queued: "numbers published; the analyst agent is queued",
  running: "numbers published; the analyst agent is working on it",
  published: "the analyst agent's judgement passed every check and is published",
  held: "the analyst agent held its judgement for a human to look at",
  blocked: "a control in code blocked the analyst agent's output",
  killed: "stopped by the kill switch",
  failed: "the analyst agent failed; the numbers still stand",
};

export function engineResult(events: TraceEvent[]): SimResult | null {
  const e = events.find((x) => x.type === "engine.result");
  return e ? (JSON.parse(e.body).sim as SimResult) : null;
}

/** The Monte Carlo result: profit spread, each risk, options, the loan covenant, thresholds, calibration. */
export function simulationView(sim: SimResult, run: AgentRun, chainIntact: boolean) {
  return {
    model: `Monte Carlo engine v${sim.meta.engineVersion}: ${sim.meta.paths.toLocaleString("en-GB")} simulated years of the next harvest, drawn from price, yield and rate history (fat-tailed, correlated). Seed ${sim.meta.seed}, so it is reproducible.`,
    as_of: sim.meta.asOf,
    run: { id: run.id, status: STATUS_TEXT[run.status], record_intact: chainIntact, trace: `/trace/${run.id}` },
    profit: {
      mean: fig(sim.profit.mean),
      median: fig(sim.profit.p50),
      one_in_20_bad_year: fig(sim.profit.p5),
      one_in_20_good_year: fig(sim.profit.p95),
      average_of_worst_5pct_years: fig(sim.profit.cvar5),
      chance_of_a_loss: fig(sim.profit.lossProb),
    },
    risks: sim.risks.map((r) => ({
      risk: riskName(r.riskId as RiskId),
      risk_id: r.riskId,
      score: r.score.display,
      one_in_20_hit: r.p5Hit.display,
      average_hit_in_worst_5pct: r.cvar5Hit.display,
      driven_by: r.factors.length ? r.factors.map(factorName) : ["a policy scenario (scheme payments cut), not a price series"],
    })),
    options: sim.options.map((o) => ({
      option: o.label,
      option_id: o.id,
      risk: riskName(o.riskId as RiskId),
      cost: o.cost.display,
      change_in_1_in_20_profit_after_cost: o.p5Gain.display,
    })),
    loan_covenant: {
      chance_dscr_below: { threshold: String(sim.dscr.threshold), ...fig(sim.dscr.pBelow) },
      main_driver: factorName(sim.dscr.mainDriver),
    },
    thresholds: sim.thresholds.map((t) => ({ what: t.label, value: t.display })),
    calibration: sim.calibration.map((c) => ({
      factor: factorName(c.factor),
      yearly_swing: pct(c.sigma),
      data: `${c.n} points, ${c.from} to ${c.to}`,
    })),
    note: "These come from the simulation. The risk register's bad-year hits come from a simpler hand-checkable model, so the two can differ; say which one you are quoting.",
  };
}

interface Judgement {
  ranked_options: { option_id: string; rank: number; reason: string; cites: string[] }[];
  risks: { risk_id: string; explanation: string; cites: string[] }[];
  change_my_mind: { threshold_id: string; statement: string }[];
  conflicts: { observation_id: string; field_key: string; document_value: string; profile_value: string; explanation: string }[];
  hold_for_human: boolean;
  hold_reason: string | null;
}

const CONTROL_TEXT: Record<string, string> = {
  "control.kill_switch": "kill switch",
  "control.deadline": "time limit reached",
  "control.budget_limit": "spend limit reached",
  "control.turn_limit": "turn limit reached",
  "control.proposal_limit": "too many proposed changes",
  "control.quote_not_verbatim": "a proposed change didn't quote its document word for word",
  "control.untraced_figure": "an untraced figure was blocked",
  "control.paused": "paused by the farmer",
};

/** The risk analyst agent's latest run: status, judgement (with cited figures resolved), controls that fired. */
export function judgementView(run: AgentRun, events: TraceEvent[], chainIntact: boolean) {
  const sim = engineResult(events);
  const figures = sim?.figures ?? {};
  const optionLabel = (id: string) => sim?.options.find((o) => o.id === id)?.label ?? id;
  const cite = (ids: string[]) => ids.map((id) => (figures[id] ? `${figures[id].label}: ${figures[id].display}` : id));
  const body = (type: string) => {
    const e = events.find((x) => x.type === type);
    return e ? JSON.parse(e.body) : null;
  };
  const judgement = body("judge.output") as Judgement | null;
  const checker = body("checker.result") as { untraced?: string[] } | null;
  const skipped = body("judge.skipped") as { reason?: string } | null;
  return {
    run: {
      id: run.id,
      started: run.startedAt,
      status: STATUS_TEXT[run.status],
      model: run.model,
      record_intact: chainIntact,
      trace: `/trace/${run.id}`,
    },
    judgement: judgement
      ? {
          ranked_options: [...judgement.ranked_options]
            .sort((a, b) => a.rank - b.rank)
            .map((o) => ({ rank: o.rank, option: optionLabel(o.option_id), reason: o.reason, figures_cited: cite(o.cites) })),
          risks: judgement.risks.map((r) => ({ risk: riskName(r.risk_id as RiskId), explanation: r.explanation, figures_cited: cite(r.cites) })),
          what_would_change_its_mind: judgement.change_my_mind.map((c) => ({
            statement: c.statement,
            threshold: figures[c.threshold_id] ? `${figures[c.threshold_id].label}: ${figures[c.threshold_id].display}` : c.threshold_id,
          })),
          document_conflicts: judgement.conflicts.map((c) => ({
            field: fieldDef(c.field_key)?.label ?? c.field_key,
            document_says: c.document_value,
            profile_says: c.profile_value,
            explanation: c.explanation,
          })),
          held_for_human: judgement.hold_for_human ? judgement.hold_reason ?? "yes" : false,
        }
      : null,
    why_no_judgement: judgement ? undefined : skipped?.reason ?? (run.error ? `failed: ${run.error}` : STATUS_TEXT[run.status]),
    figure_check: checker ? { untraced_figures: checker.untraced?.length ?? 0 } : null,
    controls_fired: events.filter((e) => e.type.startsWith("control.")).map((e) => CONTROL_TEXT[e.type] ?? e.type.replace("control.", "")),
    changes_proposed_to_farmer: events.filter((e) => e.type === "proposal.queued_for_farmer").length,
  };
}

export interface BacktestFile {
  heldOutFrom: string;
  summary: BacktestSummary[];
  wholeFarm: { harvestYear: number; breachLow: boolean; breachHigh: boolean }[];
}

interface ScreenSlice {
  n: number;
  injections: number;
  clean: number;
  caught: number;
  falseAlarmCount: number;
  catchRate: number;
  catchCI: [number, number];
  falseAlarmRate: number;
  falseAlarmCI: [number, number];
  misses: unknown[];
}
export interface ScreenFile {
  dataset: string;
  all: ScreenSlice;
  farm: ScreenSlice;
  image: ScreenSlice;
}

const MODEL_NAMES: Record<string, string> = {
  mc: "our Monte Carlo engine",
  normal_refit: "benchmark: normal distribution refitted each month",
  hist_sim: "benchmark: historical simulation",
};

/** Backtest on data the model never saw, against two benchmarks, plus the document screen. Misses included. */
export function evaluationView(backtest: BacktestFile, screen: ScreenFile) {
  const heldOut = backtest.summary.filter((s) => s.period === "held_out");
  const series = Array.from(new Set(heldOut.map((s) => s.series)));
  const slice = (s: ScreenSlice) => ({
    texts: s.n,
    attacks_caught: `${s.caught} of ${s.injections} (${pct(s.catchRate, 0)}, 95% CI ${pct(s.catchCI[0], 0)}–${pct(s.catchCI[1], 0)})`,
    false_alarms: `${s.falseAlarmCount} of ${s.clean} (95% CI up to ${pct(s.falseAlarmCI[1], 0)})`,
    misses: s.misses.length,
  });
  const farmYears = backtest.wholeFarm.length;
  const farmBreaches = backtest.wholeFarm.filter((y) => y.breachLow).length;
  return {
    price_backtest: {
      what: `Each month the model forecast a 1-in-20 low price; a breach is a month the real price fell below it. A well-calibrated model breaches about 5% of the time. Held-out data: from ${backtest.heldOutFrom}, never used to build the model.`,
      results: series.map((sr) => ({
        series: factorName(sr),
        models: heldOut
          .filter((s) => s.series === sr)
          .map((s) => ({
            model: MODEL_NAMES[s.model] ?? s.model,
            months: s.n,
            low_breach_rate: `${pct(s.breachLowRate)} (95% CI ${pct(s.breachLowCI[0])}–${pct(s.breachLowCI[1])})`,
          })),
      })),
    },
    whole_farm_backtest: { harvest_years: farmYears, years_profit_fell_below_the_1_in_20_bad_year: farmBreaches },
    document_screen: {
      what: "Uploaded documents and texts are screened for prompt injection before any agent reads them.",
      dataset: screen.dataset,
      all: slice(screen.all),
      farm_texts: slice(screen.farm),
      farm_photos: slice(screen.image),
    },
    note: "Small samples: the confidence intervals are wide. Report misses as plainly as hits.",
  };
}

interface DocValue {
  name?: string;
  mimeType?: string;
  fields?: { key: string; value: string; quote: string }[];
}

/** Documents the farmer added: what was read from each, with the words it came from, and whether the screen let it through. */
export function documentsView(docs: Observation[]) {
  return docs.map((d) => {
    const v = (d.value ?? {}) as DocValue;
    return {
      document: v.name ?? d.source,
      added: d.fetchedAt,
      screen: d.screenStatus === "passed" ? "passed" : d.screenStatus === "quarantined" ? "held back as a possible prompt injection" : "needs review",
      fields_read: (v.fields ?? []).map((f) => ({ field: fieldDef(f.key)?.label ?? f.key, value: f.value, from_the_words: f.quote })),
    };
  });
}
