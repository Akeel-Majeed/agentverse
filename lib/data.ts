"use server";
/**
 * The only module components import data from. These are server functions: pages call them
 * directly, client components call them as server actions, so Supabase and the secret key stay
 * on the server. Reads come from Supabase when it is configured and seeded, otherwise from the
 * demo data (see lib/server/store.ts).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { cache } from "react";
import { ACCEPTED_MIME, extractorFromEnv } from "./agents/documents/extract";
import { runPhaseOne, type PhaseOneInput } from "./assess/phase-one";
import { summariseProfits, type ProfitDistribution } from "./engine/distribution";
import { farmFromProfile } from "./engine/farm";
import { loadHistory } from "./engine/history";
import { configHash, profitPaths } from "./engine/simulate";
import { DEFAULT_CONFIG } from "./engine/types";
import { londonDay, londonTime } from "./format";
import { checkLossLimit, type LossLimit } from "./limits";
import * as mock from "./mock";
import { reassess } from "./profile/assess";
import { FARM_ID, weekMoves } from "./profile/fenland-ridge";
import { FIELDS, SECTIONS, fieldDef, riskName, RISKS } from "./profile/catalogue";
import { describeProblems, problemFor, profileProblems } from "./profile/checks";
import { makeSnapshot, measureSignals, profileChanges, valuesOf } from "./profile/risk-profile";
import { addDays, formatValue, parseValue } from "./profile/values";
import { jevFromEnv } from "./screen/screen";
import { createSupabaseAgentStore, getAgentStore, type AgentStore } from "./server/agent-store";
import { getStore, type Assessment, type Store } from "./server/store";
import type { WhatIfBase } from "./sim";
import { TraceWriter, verifyChain } from "./trace/chain";
import { hedgeDecision, type HedgeChoice } from "./trace/decision";
import type { AgentRun, Controls, Observation, TraceEvent } from "./trace/types";
import type {
  AssessmentMeta,
  BreakEven,
  CalendarItem,
  ChatTurn,
  Farm,
  IMessageSetup,
  MarketBaseline,
  OnboardingField,
  OnboardingSection,
  PendingChange,
  PendingSource,
  ProfileFieldValue,
  ProfileSnapshot,
  ProfileStatus,
  ProfitSummary,
  Reminder,
  RiskId,
  RiskInputs,
  RiskProfileRow,
  RiskResult,
  SaveSectionResult,
  SignalImpact,
  TopMitigation,
  WhatIfInputs,
  WhatIfPreset,
  WhatIfSlider,
} from "./types";

const today = () => londonDay(new Date());

const refresh = () => revalidatePath("/", "layout");

// One query each per request, however many getters a page calls. Not exported: a "use server"
// file may only export async functions. Writes read the store directly, never these.
const loadFarm = cache(async () => (await getStore()).getFarm());
const loadAssessment = cache(async () => (await getStore()).getAssessment());
const loadSnapshot = cache(async () => (await getStore()).getSnapshot());
const loadProfileFields = cache(async () => (await getStore()).getProfileFields());
const loadImpacts = cache(async (): Promise<SignalImpact[]> => {
  const snapshot = await loadSnapshot();
  return measureSignals(await (await getStore()).getSignals(snapshot.takenAt), snapshot);
});

/* ---------- Farm and assessment ---------- */

export async function getFarm(): Promise<Farm> {
  return loadFarm();
}

/** The assessment's run as it stands now: phase 2 moves its status and head after the assessment is stored. */
const loadRunState = cache(async (runId: string) => {
  const store = await getAgentStore();
  const [run, events] = await Promise.all([store.getRun(runId), store.getEvents(runId)]);
  return run ? { runStatus: run.status, headHash: verifyChain(events).head } : null;
});

/** Run status and head hash are read from the agent store at read time; the stored values are phase one's, kept as a fallback. */
export async function getAssessmentMeta(): Promise<AssessmentMeta> {
  const { meta } = await loadAssessment();
  const live = meta.runId ? await loadRunState(meta.runId).catch(() => null) : null;
  return live ? { ...meta, ...live } : meta;
}

export async function getRisks(): Promise<RiskResult[]> {
  const { risks } = await loadAssessment();
  return [...risks].sort((a, b) => b.score - a.score || b.badYear - a.badYear);
}

export async function getRisk(id: string): Promise<RiskResult | null> {
  const { risks } = await loadAssessment();
  return risks.find((r) => r.id === id) ?? null;
}

export async function getTopMitigations(): Promise<TopMitigation[]> {
  const { risks, topMitigationIds } = await loadAssessment();
  return topMitigationIds.flatMap((id, i) => {
    const risk = risks.find((r) => r.mitigations.some((m) => m.id === id));
    const mitigation = risk?.mitigations.find((m) => m.id === id);
    if (!risk || !mitigation) return [];
    return [{ rank: i + 1, riskName: risk.name, scoreBefore: risk.score, mitigation }];
  });
}

export async function getProfitSummary(): Promise<ProfitSummary> {
  return (await loadAssessment()).profit;
}

export async function getBreakEvens(): Promise<BreakEven[]> {
  return (await loadAssessment()).breakEvens;
}

/** The farm's loss limit checked against the latest assessment (see lib/limits.ts). */
export async function getLossLimit(): Promise<LossLimit> {
  const [fields, { risks, profit, meta }] = await Promise.all([loadProfileFields(), loadAssessment()]);
  const field = fields.find((f) => f.key === "ins.max_loss");
  const limit = field?.value === null || field?.value === undefined || field.value === "" ? null : Number(field.value);
  return checkLossLimit({
    limit: Number.isFinite(limit) ? limit : null,
    confirmed: Boolean(field?.confirmedAt) && field?.confidence === "high",
    profit,
    risks,
    typicalProfit: meta.typicalProfit,
  });
}

/* ---------- Approval queue ---------- */

const APPROVED_SOURCE: Record<PendingSource, string> = {
  onboarding: "Document read · approved by you",
  freshness: "Freshness check · confirmed by you",
  imessage: "iMessage reply · approved by you",
  mcp: "Adviser agent · approved by you",
  companies_house: "Companies House · approved by you",
  agent: "Risk agent · approved by you",
  chat: "Chat · confirmed by you",
};

export async function getPendingChanges(): Promise<PendingChange[]> {
  return (await getStore()).getPendingChanges();
}

/** The farmer's confirmed value for one field, ready to save. */
function confirmedField(key: string, value: ProfileFieldValue["value"], source: string, now: string): ProfileFieldValue {
  const days = fieldDef(key)?.validDays;
  return { key, value, source, confidence: "high", confirmedAt: now, validUntil: days ? addDays(now, days) : null };
}

/**
 * Accept a proposed change and apply it to the profile. Pass `value` when the farmer edited the
 * proposal. If the value can't be saved the change stays pending and the error says why.
 */
export async function approveChange(
  id: string,
  value?: string
): Promise<{ ok: true; item: PendingChange | null } | { ok: false; error: string }> {
  const store = await getStore();
  const item = (await store.getPendingChanges()).find((p) => p.id === id);
  if (!item) return { ok: false, error: "Not saved: this change is no longer in the queue." };
  const def = item.fieldKey ? fieldDef(item.fieldKey) : undefined;
  if (!def) return { ok: false, error: "Not saved: this change isn't linked to a profile field. Reject it, or edit the field in your profile." };
  const parsed = parseValue(def, value ?? item.proposedValue);
  if (!parsed.ok) return { ok: false, error: `Not saved: ${parsed.error}` };
  // The same checks as the farmer's own edits: a proposal from a document, message or adviser
  // agent can't put the profile into a state that can't be true.
  const conflict = problemFor(profileProblems({ ...valuesOf(await store.getProfileFields()), [def.key]: parsed.value }), def.key);
  if (conflict) return { ok: false, error: `Not saved: ${conflict}` };
  await store.saveProfileFields([confirmedField(def.key, parsed.value, APPROVED_SOURCE[item.source], new Date().toISOString())]);
  const updated = await store.updatePendingChange(id, "approved", value);
  await logDecision(item, "proposal.approved", { approvedValue: parsed.value });
  refresh();
  return { ok: true, item: updated };
}

export async function rejectChange(id: string): Promise<PendingChange | null> {
  const store = await getStore();
  const item = (await store.getPendingChanges()).find((p) => p.id === id);
  const updated = await store.updatePendingChange(id, "rejected");
  if (item) await logDecision(item, "proposal.rejected", {});
  refresh();
  return updated;
}

/** The farmer's decision on an agent proposal, as a human event on the run that proposed it. Never blocks the decision. */
async function logDecision(item: PendingChange, type: "proposal.approved" | "proposal.rejected", extra: Record<string, unknown>): Promise<void> {
  if (item.source !== "agent" || !item.runId) return;
  const runId = item.runId;
  const payload = {
    pendingChangeId: item.id, fieldKey: item.fieldKey ?? null, field: item.field,
    currentValue: item.currentValue, proposedValue: item.proposedValue, evidence: item.evidence ?? null, by: "farmer", ...extra,
  };
  const logged = await appendHumanEvent(await getAgentStore(), runId, type, payload).catch((e) => {
    console.error(`[data] Couldn't log ${type} on run ${runId}`, e);
    return true;
  });
  if (!logged) console.warn(`[data] ${type} not chained: run ${runId} still has a writer; pending_changes records it`);
}

/* ---------- Farm profile ---------- */

function buildSections(fields: ProfileFieldValue[], confirmations: Record<string, string>): OnboardingSection[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const now = today();
  return SECTIONS.map((sec) => {
    const sectionFields: OnboardingField[] = FIELDS.filter((d) => d.section === sec.id).map((def) => {
      const f = byKey.get(def.key);
      return {
        id: def.key,
        label: def.label,
        value: formatValue(def, f?.value ?? null),
        source: f?.source ?? "Not recorded",
        confidence: f?.confidence ?? "check",
        type: def.type,
        unit: def.unit,
        help: def.help,
        risks: def.risks.map((id) => ({ id, name: riskName(id) })),
        confirmedAt: f?.confirmedAt ?? null,
        stale: Boolean(f?.validUntil && f.validUntil < now),
      };
    });
    return {
      id: sec.id,
      title: sec.title,
      agentMessage: sec.agentMessage,
      documentsHint: sec.documentsHint,
      status: confirmations[sec.id] ? "confirmed" : sectionFields.some((f) => f.confidence === "check") ? "review" : "todo",
      fields: sectionFields,
    };
  });
}

export async function getOnboarding(): Promise<OnboardingSection[]> {
  const [fields, confirmations] = await Promise.all([loadProfileFields(), (await getStore()).getSectionConfirmations()]);
  return buildSections(fields, confirmations);
}

function profileStatus(fields: ProfileFieldValue[], snapshot: ProfileSnapshot): ProfileStatus {
  return { snapshot: { version: snapshot.version, takenAt: snapshot.takenAt }, changes: profileChanges(fields, snapshot) };
}

export async function getProfileStatus(): Promise<ProfileStatus> {
  const [fields, snapshot] = await Promise.all([loadProfileFields(), loadSnapshot()]);
  return profileStatus(fields, snapshot);
}

/**
 * Save and confirm one section. Every field in it becomes confirmed by the farmer; fields whose
 * value changed are marked as entered by them. Nothing is saved if any value doesn't parse.
 */
export async function saveSection(sectionId: string, values: Record<string, string>): Promise<SaveSectionResult> {
  const store = await getStore();
  const fields = await store.getProfileFields();
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const now = new Date().toISOString();
  const errors: Record<string, string> = {};
  const updates: ProfileFieldValue[] = [];

  for (const def of FIELDS.filter((d) => d.section === sectionId)) {
    const current = byKey.get(def.key);
    const input = values[def.key] ?? formatValue(def, current?.value ?? null);
    const parsed = parseValue(def, input);
    if (!parsed.ok) {
      errors[def.key] = parsed.error;
      continue;
    }
    const changed = String(parsed.value ?? "") !== String(current?.value ?? "");
    updates.push(confirmedField(def.key, parsed.value, changed || !current ? "Entered by you" : current.source, now));
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const problems = profileProblems({ ...valuesOf(fields), ...valuesOf(updates) });
  for (const def of FIELDS.filter((d) => d.section === sectionId)) {
    const conflict = problemFor(problems, def.key);
    if (conflict) errors[def.key] = conflict;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  await store.saveProfileFields(updates);
  await store.confirmSection(sectionId, now);
  const [after, confirmations, snapshot] = await Promise.all([store.getProfileFields(), store.getSectionConfirmations(), store.getSnapshot()]);
  refresh();
  return {
    ok: true,
    section: buildSections(after, confirmations).find((s) => s.id === sectionId)!,
    status: profileStatus(after, snapshot),
  };
}

/* ---------- Risk profile ---------- */

/** The snapshot's market with any measured news since applied, so a new snapshot starts from today's figures. */
function marketNow(snapshot: ProfileSnapshot, impacts: SignalImpact[]): MarketBaseline {
  const market = structuredClone(snapshot.market);
  for (const { signal } of [...impacts].reverse()) {
    if (!signal.metric || signal.value == null || !market[signal.metric]) continue;
    market[signal.metric] = { ...market[signal.metric]!, value: signal.value, source: signal.source, date: signal.publishedAt.slice(0, 10) };
  }
  return market;
}

async function impactsSince(store: Store, snapshot: ProfileSnapshot): Promise<SignalImpact[]> {
  const signals = await store.getSignals(snapshot.takenAt);
  return measureSignals(signals, snapshot);
}

export async function getRiskProfile(): Promise<{
  snapshot: { version: number; takenAt: string; reason: string };
  rows: RiskProfileRow[];
  impacts: SignalImpact[];
}> {
  const [snapshot, assessment, impacts] = await Promise.all([loadSnapshot(), loadAssessment(), loadImpacts()]);
  const rows = RISKS.flatMap(({ id, name }): RiskProfileRow[] => {
    const exposure = snapshot.exposures.find((e) => e.riskId === id);
    const risk = assessment.risks.find((r) => r.id === id);
    if (!exposure) return [];
    const mine = impacts.filter((i) => i.signal.riskId === id);
    return [
      {
        riskId: id,
        name: risk?.name ?? name,
        score: risk?.score ?? 0,
        badYear: risk?.badYear ?? 0,
        exposure,
        newsDelta: mine.reduce((s, i) => s + (i.delta ?? 0), 0),
        newsCount: mine.length,
        newsMeasured: mine.filter((i) => i.delta !== null).length,
      },
    ];
  });
  return { snapshot: { version: snapshot.version, takenAt: snapshot.takenAt, reason: snapshot.reason }, rows, impacts };
}

export async function getRiskInputs(riskId: string): Promise<RiskInputs> {
  const [fields, snapshot, allImpacts] = await Promise.all([loadProfileFields(), loadSnapshot(), loadImpacts()]);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const impacts = allImpacts.filter((i) => i.signal.riskId === riskId);
  return {
    fields: FIELDS.filter((d) => d.risks.includes(riskId as RiskId)).map((def) => {
      const live = byKey.get(def.key)?.value ?? null;
      const frozen = snapshot.fields[def.key] ?? null;
      return {
        key: def.key,
        label: def.label,
        value: formatValue(def, live) || "Not recorded",
        snapshotValue: String(live ?? "") === String(frozen ?? "") ? undefined : formatValue(def, frozen) || "Not recorded",
        sectionId: def.section,
        sectionTitle: SECTIONS.find((s) => s.id === def.section)?.title ?? def.section,
      };
    }),
    exposure: snapshot.exposures.find((e) => e.riskId === riskId) ?? null,
    snapshot: { version: snapshot.version, takenAt: snapshot.takenAt },
    impacts,
  };
}

/** Phase one (read, screen, simulate, trace) on the snapshot's frozen profile and market figures. */
async function phaseOne(trigger: AgentRun["trigger"], snapshot: ProfileSnapshot, now: Date, document?: PhaseOneInput["document"]) {
  const fields: ProfileFieldValue[] = Object.entries(snapshot.fields).map(([key, value]) => ({
    key, value, source: `Risk profile v${snapshot.version}`, confidence: "high", confirmedAt: snapshot.takenAt, validUntil: null,
  }));
  return runPhaseOne({
    store: await getAgentStore(), farmId: FARM_ID, trigger, fields, market: snapshot.market, now, document,
    jev: jevFromEnv(), extract: extractorFromEnv(), geminiAvailable: Boolean(process.env.GEMINI_API_KEY),
  });
}

/**
 * Store a new assessment built from `snapshot`. Exposures and the figures that follow from them
 * are recomputed, agent-written text is carried over, and phase one adds the Monte Carlo beside them.
 */
async function assess(store: Store, snapshot: ProfileSnapshot, assessment: Assessment, now: Date, trigger: AgentRun["trigger"]): Promise<AssessmentMeta> {
  const typicalProfit = Number(snapshot.fields["pnl.typical_profit"] ?? assessment.meta.typicalProfit) || assessment.meta.typicalProfit;
  const hectares = Number(snapshot.fields["land.area_ha"] ?? 0);
  const reassessed = reassess(assessment.risks, assessment.profit, snapshot.exposures, hectares, typicalProfit, weekMoves);
  const { profit } = reassessed;
  let { risks } = reassessed;
  const meta: AssessmentMeta = { ...assessment.meta, date: today(), updatedAt: londonTime(now), typicalProfit };
  // The app keeps working without the simulation: publish the assessment without it.
  try {
    const { run, sim, headHash } = await phaseOne(trigger, snapshot, now);
    risks = risks.map((risk) => {
      const r = sim.risks.find((x) => x.riskId === risk.id);
      if (!r) return risk;
      const { seed, paths, configHash } = sim.meta;
      return { ...risk, simulation: { runId: run.id, p5Hit: r.p5Hit.value, p5HitDisplay: r.p5Hit.display, score: r.score.value, seed, paths, configHash } };
    });
    Object.assign(meta, { runId: run.id, runStatus: run.status, headHash });
  } catch (e) {
    console.error("[data] Phase one failed; publishing the assessment without the simulation", e);
  }
  await store.insertAssessment(
    { snapshotId: snapshot.id, meta, profit, breakEvens: assessment.breakEvens, topMitigationIds: assessment.topMitigationIds, risks },
    now.toISOString()
  );
  return meta;
}

/**
 * Freeze the profile into a new snapshot, at today's market figures, and assess it. If the
 * assessment can't be saved the snapshot is removed again, so the two never get out of step.
 */
export async function updateRiskProfile(
  reason = "Profile updated"
): Promise<{ ok: true; version: number; takenAt: string; meta: AssessmentMeta } | { ok: false; error: string }> {
  const store = await getStore();
  const [fields, previous, assessment] = await Promise.all([store.getProfileFields(), store.getSnapshot(), store.getAssessment()]);
  const problems = profileProblems(valuesOf(fields));
  if (problems.length) return { ok: false, error: `Not updated: fix the farm profile first. ${describeProblems(problems)}` };
  const now = new Date();
  const takenAt = now.toISOString();
  const snapshot = makeSnapshot({
    id: crypto.randomUUID(),
    version: previous.version + 1,
    takenAt,
    reason,
    fields,
    market: marketNow(previous, await impactsSince(store, previous)),
  });
  if (!(await store.insertSnapshot(snapshot))) {
    return { ok: false, error: "Risk profile was just updated in another tab. Refresh to see it." };
  }
  let meta: AssessmentMeta;
  try {
    meta = await assess(store, snapshot, assessment, now, "update_profile");
  } catch (e) {
    await store.deleteSnapshot(snapshot.id).catch((d) => console.error(`[data] Couldn't remove snapshot ${snapshot.id} after a failed assessment`, d));
    throw e;
  }
  refresh();
  return { ok: true, version: snapshot.version, takenAt, meta };
}

/** Assess the current snapshot again. News is still measured against it: only the farmer's "Update risk profile" moves it. */
export async function rerunAssessment(): Promise<AssessmentMeta> {
  const store = await getStore();
  const [snapshot, assessment] = await Promise.all([store.getSnapshot(), store.getAssessment()]);
  const meta = await assess(store, snapshot, assessment, new Date(), "rerun");
  refresh();
  return meta;
}

/* ---------- Monte Carlo: the whole-farm profit distribution ---------- */

export interface ProfitSimulation extends ProfitDistribution {
  seed: number;
  configHash: string;
  asOf: string;
  /** The published run these figures belong to, if the assessment has one. */
  runId?: string;
  snapshotVersion: number;
}

// Deterministic for a snapshot, date and config, so compute once per server instance.
const simulations = new Map<string, ProfitSimulation>();

/**
 * Every simulated year of whole-farm profit for the current snapshot, summarised for a chart. Same
 * engine, seed and inputs as the assessment's run (lib/assess/phase-one.ts), so the figures match
 * its trace. Null if the profile is missing something the engine needs.
 */
export async function getProfitSimulation(): Promise<ProfitSimulation | null> {
  const [snapshot, { meta }] = await Promise.all([loadSnapshot(), loadAssessment()]);
  const run = meta.runId ? await (await getAgentStore()).getRun(meta.runId).catch(() => null) : null;
  const asOf = run?.asOf ?? meta.date;
  const key = `${snapshot.id}:${asOf}:${configHash(DEFAULT_CONFIG)}`;
  const cached = simulations.get(key);
  if (cached) return cached;
  const { farm, missing } = farmFromProfile(snapshot.fields, snapshot.market);
  if (missing.length) return null;
  const result: ProfitSimulation = {
    ...summariseProfits(profitPaths(loadHistory(), farm, asOf, DEFAULT_CONFIG)),
    seed: DEFAULT_CONFIG.seed,
    configHash: configHash(DEFAULT_CONFIG),
    asOf,
    runId: run?.id,
    snapshotVersion: snapshot.version,
  };
  simulations.set(key, result);
  return result;
}

/* ---------- Risk agent: trace, kill switch, documents ---------- */

/** Latest run for the farm when no id is given. `verify` recomputes the hash chain. */
export async function getTrace(runId?: string): Promise<{
  run: AgentRun;
  events: TraceEvent[];
  observations: Observation[];
  verify: { ok: boolean; head: string; brokenAt?: number };
} | null> {
  const store = await getAgentStore();
  const run = runId ? await store.getRun(runId) : await store.latestRun(FARM_ID);
  if (!run) return null;
  const [events, observations] = await Promise.all([store.getEvents(run.id), store.getObservations(run.id)]);
  return { run, events, observations, verify: verifyChain(events) };
}

export interface RunSummary {
  run: AgentRun;
  proposals: number;
  controlsFired: number;
  /** From the checker.result event: null if the judge never reached the checker. */
  checker: { untraced: number } | null;
  /** The code-picked hedge's label ("" when no option improves the bad year), and the farmer's latest choice. Null without a clean judgement. */
  decision: { label: string; choice: HedgeChoice | null } | null;
  verify: { ok: boolean; head: string; brokenAt?: number };
}

/** Every agent run for the farm, newest first, with what it decided. One getEvents per run (≤50). */
export async function getRuns(): Promise<RunSummary[]> {
  const store = await getAgentStore();
  const runs = await store.listRuns(FARM_ID);
  return Promise.all(
    runs.map(async (run) => {
      const events = await store.getEvents(run.id);
      const checkerEvent = events.find((e) => e.type === "checker.result");
      const hedge = hedgeDecision(events);
      return {
        run,
        proposals: events.filter((e) => e.type === "proposal.queued_for_farmer").length,
        controlsFired: events.filter((e) => e.type.startsWith("control.")).length,
        checker: checkerEvent ? { untraced: (JSON.parse(checkerEvent.body).untraced as string[]).length } : null,
        decision: hedge ? { label: hedge.hedge?.label ?? "", choice: hedge.farmerDecision?.choice ?? null } : null,
        verify: verifyChain(events),
      };
    })
  );
}

export async function getControls(): Promise<Controls> {
  return (await getAgentStore()).getControls();
}

/** The risk_agent database role can't write controls, so a human toggle goes through the secret-key store. */
async function controlStore(): Promise<AgentStore> {
  if (process.env.RISK_AGENT_DATABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) return createSupabaseAgentStore();
  return getAgentStore();
}

/** Last events of a finished writer: phase one done and not queued, the judge's run.end, or an earlier human event. */
const SETTLED_AFTER = new Set(["run.numbers_published", "run.end", "control.paused", "proposal.approved", "proposal.rejected", "decision.farmer"]);

/**
 * A human event on a run's chain, continuing from its last stored event. Each chain has one writer
 * at a time (phase one, then the judge), so nothing is appended while the run is queued or running
 * or its writer hasn't finished; returns false then (the controls row or pending_changes still records it).
 */
async function appendHumanEvent(store: AgentStore, runId: string, type: string, payload: unknown): Promise<boolean> {
  const run = await store.getRun(runId);
  const events = await store.getEvents(runId);
  const last = events.at(-1);
  if (!run || run.status === "queued" || run.status === "running" || !last || !SETTLED_AFTER.has(last.type)) return false;
  // ponytail: two humans at the same ms (approve + kill switch) collide on seq; the second insert fails and is logged.
  await TraceWriter.resume(runId, store, last.seq, last.hash).append(type, "human", payload);
  return true;
}

/**
 * The farmer's answer to the hedge on a published run, as a human event on its chain (latest wins).
 * Moves no money and never touches the profile: it only records "discuss with my merchant" or "not now".
 */
export async function recordHedgeDecision(runId: string, optionId: string, choice: HedgeChoice): Promise<void> {
  if (choice !== "discuss" && choice !== "not_now") throw new Error("Unknown choice.");
  const store = await getAgentStore();
  const run = await store.getRun(runId);
  if (!run) throw new Error("No such run.");
  if (run.status !== "published") throw new Error("Only a published run's hedge can be decided.");
  const hedge = hedgeDecision(await store.getEvents(runId))?.hedge;
  if (!hedge || hedge.optionId !== optionId) throw new Error("That option isn't the hedge this run recommends.");
  const logged = await appendHumanEvent(store, runId, "decision.farmer", { optionId, choice, at: new Date().toISOString() });
  if (!logged) throw new Error("This run's trace is still being written; try again in a moment.");
  revalidatePath(`/trace/${runId}`);
  revalidatePath("/trace");
}

/** The farmer's kill switch. Logged on the latest run's trace as a human event. */
export async function setPaused(paused: boolean): Promise<Controls> {
  const store = await controlStore();
  await store.setPaused(paused, "farmer");
  const run = await store.latestRun(FARM_ID);
  // A queued or running run belongs to the judge, which logs control.kill_switch itself.
  if (run) {
    await appendHumanEvent(store, run.id, "control.paused", { paused, by: "farmer" }).catch((e) =>
      console.error(`[data] Couldn't log the kill switch on run ${run.id}`, e)
    );
  }
  refresh();
  return store.getControls();
}

/** Every document the farmer added, newest first, including ones the screen held back. */
export async function getDocuments(): Promise<Observation[]> {
  return (await getAgentStore()).getDocuments(FARM_ID, true);
}

async function runDocument(document: NonNullable<PhaseOneInput["document"]>): Promise<{ runId: string; status: string }> {
  const snapshot = await (await getStore()).getSnapshot();
  const { run } = await phaseOne("document", snapshot, new Date(), document);
  refresh();
  return { runId: run.id, status: run.status };
}

/** A pasted document: screened by Jev before any model judges it. */
export async function addDocument(name: string, text: string): Promise<{ runId: string; status: string }> {
  return runDocument({ name, text });
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** An uploaded PDF or photo (form field "file"): read by Gemini 3.8 Flash, then screened. */
export async function addDocumentFile(form: FormData): Promise<{ runId: string; status: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF or photo to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That file is over 10 MB. Upload a smaller PDF or photo.");
  if (!ACCEPTED_MIME.includes(file.type)) throw new Error("Upload a PDF or a photo (JPEG, PNG, WebP or HEIC).");
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  return runDocument({ name: file.name, file: { data, mimeType: file.type } });
}

const DEMO_DOCUMENTS = {
  "fertiliser-contract.txt": "text/plain",
  "merchant-email-injection.txt": "text/plain",
  "forward-contract.png": "image/png",
  "forward-contract.pdf": "application/pdf",
  "injection-contract.png": "image/png",
} as const;

/** One of the demo files in data/demo (fixed names only, never a path from the client). */
export async function addDemoDocument(name: keyof typeof DEMO_DOCUMENTS): Promise<{ runId: string; status: string }> {
  if (!Object.hasOwn(DEMO_DOCUMENTS, name)) throw new Error("Unknown demo document.");
  const mimeType = DEMO_DOCUMENTS[name];
  const file = path.join(process.cwd(), "data", "demo", name);
  if (mimeType === "text/plain") return runDocument({ name, text: await readFile(file, "utf8") });
  return runDocument({ name, file: { data: (await readFile(file)).toString("base64"), mimeType } });
}

/* ---------- Activity: what the agents did and what the farmer decided ---------- */

export interface Activity {
  turns: ChatTurn[];
  decisions: PendingChange[];
  snapshots: { version: number; takenAt: string; reason: string }[];
  totals: { answered: number; failed: number; toolCalls: number; caught: number; caughtReplies: number; heldBack: number };
}

/** The action log: every chat turn (both channels) with its tool calls and figure checks, every approval decision and snapshot. */
export async function getActivity(): Promise<Activity> {
  const store = await getStore();
  const [turns, pending, snapshots] = await Promise.all([
    store.listChatTurns(100).catch((err) => {
      console.warn("[data] couldn't load the chat log", err);
      return [] as ChatTurn[];
    }),
    store.getPendingChanges(),
    store.listSnapshots(20),
  ]);
  const newest = [...turns].reverse();
  return {
    turns: newest,
    decisions: pending.filter((p) => p.status !== "pending"),
    snapshots,
    totals: {
      answered: turns.filter((t) => t.status === "answered").length,
      failed: turns.filter((t) => t.status === "failed").length,
      toolCalls: turns.reduce((s, t) => s + (t.tools?.length ?? 0), 0),
      caught: turns.reduce((s, t) => s + (t.checker?.flagged.length ?? 0), 0),
      caughtReplies: turns.filter((t) => (t.checker?.flagged.length ?? 0) > 0).length,
      heldBack: turns.filter((t) => t.checker?.blocked).length,
    },
  };
}

/* ---------- Not in the database yet: calendar, reminders, what-if ---------- */

export async function getCalendar(): Promise<CalendarItem[]> {
  return structuredClone(mock.calendar);
}

export async function getReminders(): Promise<Reminder[]> {
  return structuredClone(mock.reminders);
}

/** The what-if's starting point, from the risk profile snapshot: the same tonnes, prices and debt as every other page. */
function whatIfBase(snapshot: ProfileSnapshot, typicalProfit: number): WhatIfBase {
  const v = snapshot.fields;
  const n = (key: string) => {
    const x = Number(v[key] ?? 0);
    return Number.isFinite(x) ? x : 0;
  };
  const price = (id: keyof MarketBaseline) => snapshot.market[id]?.value ?? 0;
  const crop = (id: string) => n(`crop.${id}.area_ha`) * n(`crop.${id}.yield_t_ha`);
  const variable = /variable|tracker|base|sonia/i.test(String(v["fin.loan_rate_type"] ?? ""));
  return {
    profitK: typicalProfit / 1000,
    wheatPrice: price("wheat_feed_gbp_t"),
    anPrice: price("an_gbp_t"),
    wheatStoreT: n("sales.wheat_2026_unsold_t"),
    wheatCropT: crop("wheat"),
    wheatForwardT: n("sales.wheat_2027_forward_t"),
    otherCropsK: (crop("barley") * price("barley_feed_gbp_t") + crop("osr") * price("osr_gbp_t")) / 1000,
    anUnboughtT: Math.max(0, n("inputs.n_need_t") - n("inputs.n_bought_t")),
    variableDebtK: variable ? n("fin.loan") / 1000 : 0,
  };
}

export async function getWhatIfConfig(): Promise<{
  base: WhatIfBase;
  baseline: WhatIfInputs;
  presets: WhatIfPreset[];
  sliders: WhatIfSlider[];
}> {
  const [snapshot, { meta }] = await Promise.all([loadSnapshot(), loadAssessment()]);
  const base = whatIfBase(snapshot, meta.typicalProfit);
  const baseline: WhatIfInputs = { ...mock.whatIfBaseline, wheatPrice: base.wheatPrice, fertiliserPrice: base.anPrice };
  // Presets change one thing; everything else starts from the snapshot's prices.
  const presets = mock.whatIfPresets.map((p) => ({
    ...p,
    inputs: Object.fromEntries(
      (Object.keys(baseline) as (keyof WhatIfInputs)[]).map((k) => [k, p.inputs[k] === mock.whatIfBaseline[k] ? baseline[k] : p.inputs[k]])
    ) as unknown as WhatIfInputs,
  }));
  return structuredClone({ base, baseline, presets, sliders: mock.whatIfSliders });
}

/* ---------- Onboarding ---------- */

const ONBOARDED_COOKIE = "onboarded";

/** Market figures the risk profile is worked out at, so onboarding can preview exposures live. */
export async function getMarketBaseline(): Promise<MarketBaseline> {
  return (await loadSnapshot()).market;
}

/** The shared Inkbox iMessage number and connect command for the agent, if Inkbox is configured. */
export async function getIMessageSetup(): Promise<IMessageSetup> {
  if (!process.env.INKBOX_API_KEY) return { available: false, reason: "iMessage isn't configured on this deployment yet." };
  try {
    const { Inkbox } = await import("@inkbox/sdk");
    const { agentHandle } = await import("./agents/chat/inkbox");
    const router = await new Inkbox().imessages.getTriageNumber();
    return {
      available: true,
      number: router.number,
      connectCommand: `connect @${agentHandle()}`,
      replies: Boolean(process.env.INKBOX_WEBHOOK_SECRET && process.env.ANTHROPIC_API_KEY),
    };
  } catch (err) {
    console.warn("[data] couldn't load the Inkbox iMessage number", err);
    return { available: false, reason: "Couldn't reach Inkbox right now." };
  }
}

/** Mark setup as done for this browser, so the app opens on the overview from now on. */
export async function finishOnboarding(): Promise<void> {
  cookies().set(ONBOARDED_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
}
