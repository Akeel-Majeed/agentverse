/**
 * Read-only tools for the chat agent. Each one wraps code that already computes the figure
 * (lib/data.ts, lib/sim.ts, the Monte Carlo engine's stored result), so every number the agent
 * quotes comes from code. The only writes are profile-change proposals: the agent proposes, and a
 * change is applied only after the farmer's plain YES to that exact change, checked in code
 * (profile-changes.ts, confirm.ts). It cannot move money.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  getAssessmentMeta,
  getBreakEvens,
  getCalendar,
  getDocuments,
  getLossLimit,
  getOnboarding,
  getPendingChanges,
  getProfitSummary,
  getRisk,
  getRiskInputs,
  getRiskProfile,
  getRisks,
  getTopMitigations,
  getTrace,
  getWhatIfConfig,
} from "../../data";
import backtest from "../../../docs/eval/backtest.json";
import screenEval from "../../../docs/eval/screen-eval.json";
import { changeRef } from "./confirm";
import { documentsView, engineResult, evaluationView, judgementView, simulationView, type BacktestFile, type ScreenFile } from "./engine-views";
import { cancelProfileChange, confirmProfileChange, proposeProfileChange, type ChangeContext } from "./profile-changes";
import { amount, gbp, gbpK, gbpPerT } from "../../format";
import { riskName } from "../../profile/catalogue";
import { bandFor } from "../../score";
import { simulateRisk, whatIf } from "../../sim";
import { whatWouldChange } from "../../what-would-change";
import type { LossLimit } from "../../limits";
import type { Mitigation, RiskResult, SignalImpact } from "../../types";

export const RISK_IDS = ["output_prices", "input_prices", "weather_yield", "regulation", "interest_rates"] as const;
const riskId = z.enum(RISK_IDS).describe("Risk module id");

export interface ToolCall {
  name: string;
  input: unknown;
  output: string;
  ms: number;
}

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const day = (iso: string) => WHEN.format(new Date(iso));

function mitigationView(m: Mitigation) {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    cost: m.cost,
    status: m.status,
    effect:
      m.benefitKind === "profit"
        ? `${gbp(m.badYearReduction, { sign: true })} profit a year`
        : `cuts the bad-year hit by ${gbp(m.badYearReduction)}`,
    score_after: `${m.scoreAfter}/10`,
  };
}

function riskView(r: RiskResult) {
  return {
    id: r.id,
    name: r.name,
    score: `${r.score}/10`,
    level: bandFor(r.score).level,
    bad_year_hit: gbp(r.badYear),
    share_of_typical_profit: `${r.pctOfProfit}%`,
    expected_cost_typical_year: gbp(r.expected),
    change_7_days: gbp(r.trend7d, { sign: true }),
    driver: r.driver,
  };
}

function impactView(i: SignalImpact) {
  return {
    title: i.signal.title,
    summary: i.signal.summary,
    risk: riskName(i.signal.riskId),
    source: i.signal.source,
    published: day(i.signal.publishedAt),
    effect_on_expected_profit: i.delta === null ? "no £ figure yet" : gbp(i.delta, { sign: true }),
    measured_against: `snapshot v${i.snapshotVersion}`,
    alert: i.alert,
    working: i.working,
  };
}

function lossLimitView(l: LossLimit) {
  return {
    limit: l.limit === null ? "not recorded" : gbp(l.limit),
    confirmed_by_farmer: l.confirmed,
    farm_loss_in_bad_year: gbp(l.farmLoss),
    past_limit: l.limit === null ? "can't check: no limit recorded" : l.breached,
    risks_past_limit_on_their_own: l.risksOver.map((r) => ({ risk: r.name, loss: gbp(r.loss) })),
    note: l.confirmed ? undefined : "The farmer hasn't confirmed this limit yet: ask them to confirm it in their farm profile.",
  };
}

/** Build the tool set. Every call is recorded in `calls` for the figure checker and the action log. */
export function createTools(calls: ToolCall[], change: ChangeContext = { channel: "web", messages: [] }) {
  const tool = <S extends z.ZodType>(def: { name: string; description: string; inputSchema: S; run: (input: z.infer<S>) => Promise<unknown> }) =>
    betaZodTool({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      run: async (input) => {
        const started = Date.now();
        let output: string;
        try {
          output = JSON.stringify(await def.run(input));
        } catch (err) {
          output = JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" });
        }
        calls.push({ name: def.name, input, output, ms: Date.now() - started });
        return output;
      },
    });

  return [
    tool({
      name: "get_risk_profile",
      description:
        "The farm's risk profile: the snapshot it is based on, and for each of the five risks its score, bad-year hit, what the farm has at stake and the total effect of news since the snapshot. Start here for any broad question.",
      inputSchema: z.object({}),
      run: async () => {
        const [{ snapshot, rows, impacts }, meta, lossLimit] = await Promise.all([getRiskProfile(), getAssessmentMeta(), getLossLimit()]);
        return {
          assessed: day(meta.date),
          snapshot: { version: snapshot.version, taken: day(snapshot.takenAt), reason: snapshot.reason },
          risks: rows.map((r) => ({
            id: r.riskId,
            name: r.name,
            score: `${r.score}/10`,
            level: bandFor(r.score).level,
            bad_year_hit: gbp(r.badYear),
            at_stake: gbp(r.exposure.total),
            at_stake_detail: r.exposure.summary,
            news_since_snapshot: r.newsMeasured ? gbp(r.newsDelta, { sign: true }) : r.newsCount ? "no £ figure yet" : "none",
          })),
          news_items_since_snapshot: impacts.length,
          loss_limit: lossLimitView(lossLimit),
          note: "Bad years don't add up across risks: they rarely all peak in the same year.",
        };
      },
    }),
    tool({
      name: "get_risk",
      description:
        "Everything about one risk: score, bad-year hit, share of profit, 7-day change, what would change the score (calculated), the agent's reasoning, the step-by-step working, sources and the exposure model.",
      inputSchema: z.object({ risk_id: riskId }),
      run: async ({ risk_id }) => {
        const [r, meta, lossLimit] = await Promise.all([getRisk(risk_id), getAssessmentMeta(), getLossLimit()]);
        if (!r) return { error: `Unknown risk ${risk_id}` };
        return {
          ...riskView(r),
          what_would_change: whatWouldChange(r.model, meta.typicalProfit, lossLimit.limit).map((p) => p.text),
          summary: r.summary,
          reasoning: r.reasoning,
          working: r.working,
          sources: r.sources,
          exposure: {
            label: r.model.exposureLabel,
            amount: amount(r.model.exposure, r.model.unit),
            hedgeable_label: r.model.tradeoff.actionLabel,
            hedgeable_note: r.model.tradeoff.note,
          },
          mitigation_ids: r.mitigations.map((m) => m.id),
          monte_carlo: r.simulation
            ? {
                one_in_20_hit: r.simulation.p5HitDisplay,
                score: `${r.simulation.score}/10`,
                simulated_years: r.simulation.paths.toLocaleString("en-GB"),
                note: "From the 10,000-path simulation; the bad_year_hit above is the simpler hand-checkable model. get_simulation has the full result.",
              }
            : null,
        };
      },
    }),
    tool({
      name: "get_mitigations",
      description:
        "Mitigation options with their cost, effect on the bad-year hit and the score afterwards. Without risk_id: the top 3 across the farm plus every option by risk. These are options to discuss, not advice.",
      inputSchema: z.object({ risk_id: riskId.optional() }),
      run: async ({ risk_id }) => {
        const [risks, top] = await Promise.all([getRisks(), getTopMitigations()]);
        const chosen = risk_id ? risks.filter((r) => r.id === risk_id) : risks;
        return {
          top_three: risk_id
            ? undefined
            : top.map((t) => ({ rank: t.rank, risk: t.riskName, score_before: `${t.scoreBefore}/10`, ...mitigationView(t.mitigation) })),
          by_risk: chosen.map((r) => ({ risk: r.name, risk_id: r.id, score: `${r.score}/10`, bad_year_hit: gbp(r.badYear), options: r.mitigations.map(mitigationView) })),
        };
      },
    }),
    tool({
      name: "simulate_mitigations",
      description:
        "Simulate taking one or more mitigation options for a risk: bad-year hit, whole-farm profit in a bad year and loss-making years, before and after. Use mitigation ids from get_mitigations.",
      inputSchema: z.object({ risk_id: riskId, mitigation_ids: z.array(z.string()).min(1) }),
      run: async ({ risk_id, mitigation_ids }) => {
        const r = await getRisk(risk_id);
        if (!r) return { error: `Unknown risk ${risk_id}` };
        const active = r.mitigations.filter((m) => mitigation_ids.includes(m.id));
        const unknown = mitigation_ids.filter((id) => !r.mitigations.some((m) => m.id === id));
        const before = simulateRisk(r.model);
        const after = simulateRisk(r.model, active);
        const view = (s: typeof before) => ({
          bad_year_hit: gbpK(s.hitK),
          farm_profit_bad_year: gbpK(s.badYearProfitK),
          expected_profit: gbpK(s.meanK),
          loss_making_years: `${s.lossYears} in 20`,
          exposure_left: amount(s.exposure, r.model.unit),
        });
        return {
          risk: r.name,
          options_applied: active.map((m) => m.title),
          unknown_ids: unknown.length ? unknown : undefined,
          before: view(before),
          after: view(after),
          change_in_bad_year_hit: gbpK(after.hitK - before.hitK, { sign: true }),
        };
      },
    }),
    tool({
      name: "what_if",
      description:
        "Whole-farm profit under a scenario. Any input left out stays at today's value. Wheat and fertiliser in £/t, yield as % of normal (100 = normal), Bank Rate change in percentage points.",
      inputSchema: z.object({
        wheat_price: z.number().min(50).max(500).optional(),
        fertiliser_price: z.number().min(100).max(2000).optional(),
        yield_pct: z.number().min(30).max(150).optional(),
        rate_change: z.number().min(-5).max(10).optional(),
      }),
      run: async (input) => {
        const { baseline, base } = await getWhatIfConfig();
        const inputs = {
          wheatPrice: input.wheat_price ?? baseline.wheatPrice,
          fertiliserPrice: input.fertiliser_price ?? baseline.fertiliserPrice,
          yieldPct: input.yield_pct ?? baseline.yieldPct,
          rateChange: input.rate_change ?? baseline.rateChange,
        };
        const result = whatIf(inputs, base);
        return {
          scenario: {
            wheat_price: gbpPerT(inputs.wheatPrice),
            fertiliser_price: gbpPerT(inputs.fertiliserPrice),
            yield: `${inputs.yieldPct}% of normal`,
            bank_rate_change: `${inputs.rateChange >= 0 ? "+" : ""}${inputs.rateChange} points`,
          },
          today: {
            wheat_price: gbpPerT(baseline.wheatPrice),
            fertiliser_price: gbpPerT(baseline.fertiliserPrice),
          },
          farm_profit: gbpK(result.profitK),
          change_vs_today: gbpK(result.deltaK, { sign: true }),
          loss_if_wheat_below: result.lossPrice === null ? "wheat price doesn't move profit: none exposed" : gbpPerT(result.lossPrice),
          wheat_exposed_to_price: `${Math.round(result.wheatExposedT).toLocaleString("en-GB")} t`,
          working: result.working,
          by_driver: result.impacts.map((i) => ({ driver: i.label, effect: gbpK(i.valueK, { sign: true }) })),
        };
      },
    }),
    tool({
      name: "get_profit_summary",
      description: "Expected profit for the harvest year, bad and good years, chance of a loss, weekly change, the farm's loss limit check, and each crop's price against its break-even.",
      inputSchema: z.object({}),
      run: async () => {
        const [p, breakEvens, meta, lossLimit] = await Promise.all([getProfitSummary(), getBreakEvens(), getAssessmentMeta(), getLossLimit()]);
        return {
          harvest_year: meta.harvestYear,
          expected_profit: gbp(p.expected),
          bad_year_profit: gbp(p.badYear),
          good_year_profit: gbp(p.goodYear),
          chance_of_loss: `${Math.round(p.lossChance * 100)}%`,
          loss_making_years: `${p.lossYearsOf20} in 20`,
          change_vs_last_week: gbp(p.deltaWeek, { sign: true }),
          working: p.working,
          loss_limit: lossLimitView(lossLimit),
          break_evens: breakEvens.map((b) => ({
            crop: b.crop,
            price: gbpPerT(b.price),
            break_even: gbpPerT(b.breakEven),
            margin: gbpPerT(b.price - b.breakEven, { sign: true }),
          })),
        };
      },
    }),
    tool({
      name: "get_profile",
      description:
        "What the farm has told us, by section (farm basics, land, cropping, sales, inputs, schemes and regulation, finance, costs and profit, insurance): each value with its source, whether it needs checking or is out of date, and which risks it feeds.",
      inputSchema: z.object({
        section: z
          .enum(["farm-basics", "land", "cropping", "sales", "inputs", "support", "finance", "pnl", "insurance"])
          .optional()
          .describe("Leave out for every section"),
      }),
      run: async ({ section }) => {
        const sections = (await getOnboarding()).filter((s) => !section || s.id === section);
        return sections.map((s) => ({
          section: s.title,
          status: s.status,
          fields: s.fields.map((f) => ({
            key: f.id,
            label: f.label,
            value: f.value || "not recorded",
            source: f.source,
            needs_check: f.confidence === "check" || undefined,
            out_of_date: f.stale || undefined,
            feeds: f.risks?.map((r) => r.name),
          })),
        }));
      },
    }),
    tool({
      name: "get_risk_inputs",
      description: "Where one risk's figures come from: the profile fields it uses, what is at stake in the snapshot with the working, and news for that risk since the snapshot.",
      inputSchema: z.object({ risk_id: riskId }),
      run: async ({ risk_id }) => {
        const i = await getRiskInputs(risk_id);
        return {
          snapshot: { version: i.snapshot.version, taken: day(i.snapshot.takenAt) },
          at_stake: i.exposure ? { total: gbp(i.exposure.total), summary: i.exposure.summary, working: i.exposure.working } : null,
          profile_fields: i.fields.map((f) => ({ label: f.label, value: f.value, section: f.sectionTitle })),
          news: i.impacts.map(impactView),
        };
      },
    }),
    tool({
      name: "get_news",
      description: "News, price moves and policy items since the risk profile snapshot, each with its £ effect on expected profit measured against the snapshot and the working.",
      inputSchema: z.object({ risk_id: riskId.optional() }),
      run: async ({ risk_id }) => {
        const { snapshot, impacts } = await getRiskProfile();
        const list = impacts.filter((i) => !risk_id || i.signal.riskId === risk_id);
        const total = list.reduce((s, i) => s + (i.delta ?? 0), 0);
        return { snapshot_version: snapshot.version, total_effect: gbp(total, { sign: true }), items: list.map(impactView) };
      },
    }),
    tool({
      name: "get_calendar",
      description: "Upcoming deadlines and key dates (selling, inputs, finance, schemes, markets) from the assessment date.",
      inputSchema: z.object({ days_ahead: z.number().int().min(1).max(400).optional().describe("Default 120") }),
      run: async ({ days_ahead }) => {
        const [items, meta] = await Promise.all([getCalendar(), getAssessmentMeta()]);
        const from = meta.date;
        const until = new Date(Date.parse(from) + (days_ahead ?? 120) * 86_400_000).toISOString().slice(0, 10);
        return items
          .filter((c) => (c.end ?? c.start) >= from && c.start <= until)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((c) => ({ date: day(c.start), until: c.end ? day(c.end) : undefined, lane: c.lane, what: c.label, warning: c.tone === "warning" || undefined }));
      },
    }),
    tool({
      name: "get_pending_changes",
      description: "Changes waiting for the farmer's approval (from documents, freshness checks, iMessage, adviser agents, Companies House). Only the farmer can approve them, in the app.",
      inputSchema: z.object({}),
      run: async () =>
        (await getPendingChanges())
          .filter((p) => p.status === "pending")
          .map((p) => ({ ref: changeRef(p.id), field: p.field, current: p.currentValue, proposed: p.proposedValue, reason: p.reason, received: p.receivedAt })),
    }),
    tool({
      name: "get_simulation",
      description:
        "The Monte Carlo engine's latest result (10,000 simulated years): profit mean, median, 1-in-20 bad and good years, average of the worst 5% of years, chance of a loss; each risk's simulated 1-in-20 hit and score; what each option changes; the chance the loan covenant (DSCR) breaks and its main driver; break-even thresholds; and how volatile each input is. Use for 'how bad could it get', percentiles, the covenant, or anything about the simulation.",
      inputSchema: z.object({}),
      run: async () => {
        const trace = await assessmentTrace();
        const sim = trace && engineResult(trace.events);
        if (!trace || !sim) return { available: false, reason: "No simulation run yet. It runs when the farmer updates the risk profile or re-runs the assessment." };
        return simulationView(sim, trace.run, trace.verify.ok);
      },
    }),
    tool({
      name: "get_analyst_judgement",
      description:
        "What the risk analyst agent concluded on its latest run: options ranked with reasons and the figures each cites, risk explanations, what would change its mind, conflicts between documents and the profile, whether it held for a human, which controls fired, and whether the run's record is intact. Use for 'what does the analyst recommend', 'why was it held', or anything about agent runs.",
      inputSchema: z.object({}),
      run: async () => {
        const trace = await assessmentTrace();
        if (!trace) return { available: false, reason: "No analyst run yet." };
        return judgementView(trace.run, trace.events, trace.verify.ok);
      },
    }),
    tool({
      name: "get_evaluation",
      description:
        "How well the model has been tested: the price backtest on held-out data against two benchmarks (how often real prices fell below the forecast 1-in-20 low), the whole-farm backtest, and the document screen's catch and false-alarm rates. Use for 'how reliable is this', 'has it been tested', accuracy or misses.",
      inputSchema: z.object({}),
      run: async () => evaluationView(backtest as unknown as BacktestFile, screenEval as unknown as ScreenFile),
    }),
    tool({
      name: "get_documents",
      description: "Documents the farmer added (invoices, contracts, letters): what was read from each with the exact words it came from, and whether the injection screen let it through.",
      inputSchema: z.object({}),
      run: async () => {
        const docs = documentsView(await getDocuments());
        return docs.length ? docs : { documents: [], note: "No documents added yet." };
      },
    }),
    tool({
      name: "propose_profile_change",
      description:
        "Propose changing one farm profile value, e.g. after the farmer says they sold grain, bought fertiliser or their loan changed. Nothing changes yet: it goes to the approval queue and you must show the farmer the exact change with its ref and ask them to confirm. Use the field key from get_profile; give the value as the farmer stated it.",
      inputSchema: z.object({
        field_key: z.string().describe("Profile field key from get_profile, e.g. sales.wheat_2026_unsold_t"),
        value: z.string().min(1).describe("New value, e.g. 828 or 828 t or 31 Mar 2027"),
        reason: z.string().describe("One short sentence: what the farmer said"),
      }),
      run: async (input) => proposeProfileChange(input, change),
    }),
    tool({
      name: "confirm_profile_change",
      description:
        "Apply a change the farmer has just confirmed. Call it when the farmer's latest message answers the change you showed them in your last message (with its ref) and seems to agree. Code checks the reply really confirms that exact change (Jev) and refuses otherwise.",
      inputSchema: z.object({ ref: z.string().describe("The change's ref, e.g. 3F9A2C") }),
      run: async (input) => confirmProfileChange(input, change),
    }),
    tool({
      name: "cancel_profile_change",
      description: "Cancel a change proposed in chat when the farmer says no or corrects it. The profile keeps its current value.",
      inputSchema: z.object({ ref: z.string() }),
      run: async (input) => cancelProfileChange(input),
    }),
  ];
}

/** The run the latest assessment points to (or the latest run), with its record verified now. */
async function assessmentTrace() {
  const { runId } = await getAssessmentMeta();
  return getTrace(runId ?? undefined);
}
