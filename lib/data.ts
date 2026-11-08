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
import { cache } from "react";
import { ACCEPTED_MIME, extractorFromEnv } from "./agents/documents/extract";
import { runPhaseOne, type PhaseOneInput } from "./assess/phase-one";
import { londonDay, londonTime } from "./format";
import * as mock from "./mock";
import { reassess } from "./profile/assess";
import { FARM_ID, weekMoves } from "./profile/fenland-ridge";
import { FIELDS, SECTIONS, fieldDef, riskName, RISKS } from "./profile/catalogue";
import { makeSnapshot, measureSignals, profileChanges } from "./profile/risk-profile";
import { addDays, formatValue, parseValue } from "./profile/values";
import { jevFromEnv } from "./screen/screen";
import { createSupabaseAgentStore, getAgentStore, type AgentStore } from "./server/agent-store";
import { getStore, type Assessment, type Store } from "./server/store";
import { TraceWriter, verifyChain } from "./trace/chain";
import type { AgentRun, Controls, Observation, TraceEvent } from "./trace/types";
import type {
  AssessmentMeta,
  BreakEven,
  CalendarItem,
  Farm,
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

/* ---------- Approval queue ---------- */

const APPROVED_SOURCE: Record<PendingSource, string> = {
  onboarding: "Document read · approved by you",
  freshness: "Freshness check · confirmed by you",
  imessage: "iMessage reply · approved by you",
  mcp: "Adviser agent · approved by you",
  companies_house: "Companies House · approved by you",
  agent: "Risk agent · approved by you",
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
    fields: FIELDS.filter((d) => d.risks.includes(riskId as RiskId)).map((def) => ({
      key: def.key,
      label: def.label,
      value: formatValue(def, byKey.get(def.key)?.value ?? null) || "Not recorded",
      sectionId: def.section,
      sectionTitle: SECTIONS.find((s) => s.id === def.section)?.title ?? def.section,
    })),
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

export async function getControls(): Promise<Controls> {
  return (await getAgentStore()).getControls();
}

/** The risk_agent database role can't write controls, so a human toggle goes through the secret-key store. */
async function controlStore(): Promise<AgentStore> {
  if (process.env.RISK_AGENT_DATABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) return createSupabaseAgentStore();
  return getAgentStore();
}

/** Last events of a finished writer: phase one done and not queued, the judge's run.end, or an earlier human event. */
const SETTLED_AFTER = new Set(["run.numbers_published", "run.end", "control.paused", "proposal.approved", "proposal.rejected"]);

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

/* ---------- Not in the database yet: calendar, reminders, what-if ---------- */

export async function getCalendar(): Promise<CalendarItem[]> {
  return structuredClone(mock.calendar);
}

export async function getReminders(): Promise<Reminder[]> {
  return structuredClone(mock.reminders);
}

export async function getWhatIfConfig(): Promise<{
  baseline: WhatIfInputs;
  presets: WhatIfPreset[];
  sliders: WhatIfSlider[];
}> {
  return structuredClone({ baseline: mock.whatIfBaseline, presets: mock.whatIfPresets, sliders: mock.whatIfSliders });
}
