/**
 * Read-only tools for the chat agent. Each one wraps code that already computes the figure
 * (lib/data.ts, lib/sim.ts), so every number the agent quotes comes from code. There is no
 * write tool: the agent cannot change the profile, approve changes or move money.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  getAssessmentMeta,
  getBreakEvens,
  getCalendar,
  getOnboarding,
  getPendingChanges,
  getProfitSummary,
  getRisk,
  getRiskInputs,
  getRiskProfile,
  getRisks,
  getTopMitigations,
  getWhatIfConfig,
} from "../../data";
import { amount, gbp, gbpK, gbpPerT } from "../../format";
import { riskName } from "../../profile/catalogue";
import { bandFor } from "../../score";
import { simulateRisk, whatIf } from "../../sim";
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

/** Build the tool set. Every call is recorded in `calls` for the figure checker and the action log. */
export function createTools(calls: ToolCall[]) {
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
        const [{ snapshot, rows, impacts }, meta] = await Promise.all([getRiskProfile(), getAssessmentMeta()]);
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
          note: "Bad years don't add up across risks: they rarely all peak in the same year.",
        };
      },
    }),
    tool({
      name: "get_risk",
      description:
        "Everything about one risk: score, bad-year hit, share of profit, 7-day change, the agent's reasoning, the step-by-step working, sources and the exposure model.",
      inputSchema: z.object({ risk_id: riskId }),
      run: async ({ risk_id }) => {
        const r = await getRisk(risk_id);
        if (!r) return { error: `Unknown risk ${risk_id}` };
        return {
          ...riskView(r),
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
        const { baseline } = await getWhatIfConfig();
        const inputs = {
          wheatPrice: input.wheat_price ?? baseline.wheatPrice,
          fertiliserPrice: input.fertiliser_price ?? baseline.fertiliserPrice,
          yieldPct: input.yield_pct ?? baseline.yieldPct,
          rateChange: input.rate_change ?? baseline.rateChange,
        };
        const result = whatIf(inputs);
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
          loss_if_wheat_below: gbpPerT(result.lossPrice),
          by_driver: result.impacts.map((i) => ({ driver: i.label, effect: gbpK(i.valueK, { sign: true }) })),
        };
      },
    }),
    tool({
      name: "get_profit_summary",
      description: "Expected profit for the harvest year, bad and good years, chance of a loss, weekly change, and each crop's price against its break-even.",
      inputSchema: z.object({}),
      run: async () => {
        const [p, breakEvens, meta] = await Promise.all([getProfitSummary(), getBreakEvens(), getAssessmentMeta()]);
        return {
          harvest_year: meta.harvestYear,
          expected_profit: gbp(p.expected),
          bad_year_profit: gbp(p.badYear),
          good_year_profit: gbp(p.goodYear),
          chance_of_loss: `${Math.round(p.lossChance * 100)}%`,
          loss_making_years: `${p.lossYearsOf20} in 20`,
          change_vs_last_week: gbp(p.deltaWeek, { sign: true }),
          working: p.working,
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
          .map((p) => ({ field: p.field, current: p.currentValue, proposed: p.proposedValue, reason: p.reason, received: p.receivedAt })),
    }),
  ];
}
