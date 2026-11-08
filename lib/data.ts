"use server";
/**
 * The only module components import data from. These are server functions: pages call them
 * directly, client components call them as server actions, so Supabase and the secret key stay
 * on the server. Reads come from Supabase when it is configured and seeded, otherwise from the
 * demo data (see lib/server/store.ts).
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { cache } from "react";
import { londonDay, londonTime } from "./format";
import { checkLossLimit, type LossLimit } from "./limits";
import * as mock from "./mock";
import { reassess } from "./profile/assess";
import { weekMoves } from "./profile/fenland-ridge";
import { FIELDS, SECTIONS, fieldDef, riskName, RISKS } from "./profile/catalogue";
import { describeProblems, problemFor, profileProblems } from "./profile/checks";
import { makeSnapshot, measureSignals, profileChanges, valuesOf } from "./profile/risk-profile";
import { addDays, formatValue, parseValue } from "./profile/values";
import { getStore, type Assessment, type Store } from "./server/store";
import type {
  AssessmentMeta,
  BreakEven,
  CalendarItem,
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

export async function getAssessmentMeta(): Promise<AssessmentMeta> {
  return (await loadAssessment()).meta;
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
  refresh();
  return { ok: true, item: updated };
}

export async function rejectChange(id: string): Promise<PendingChange | null> {
  const updated = await (await getStore()).updatePendingChange(id, "rejected");
  refresh();
  return updated;
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

/**
 * Store a new assessment built from `snapshot`. Until the engine exists, exposures and the
 * figures that follow from them are recomputed; agent-written text is carried over.
 */
async function assess(store: Store, snapshot: ProfileSnapshot, assessment: Assessment, now: Date): Promise<AssessmentMeta> {
  const typicalProfit = Number(snapshot.fields["pnl.typical_profit"] ?? assessment.meta.typicalProfit) || assessment.meta.typicalProfit;
  const hectares = Number(snapshot.fields["land.area_ha"] ?? 0);
  const { risks, profit } = reassess(assessment.risks, assessment.profit, snapshot.exposures, hectares, typicalProfit, weekMoves);
  const meta: AssessmentMeta = { ...assessment.meta, date: today(), updatedAt: londonTime(now), typicalProfit };
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
    meta = await assess(store, snapshot, assessment, now);
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
  const meta = await assess(store, snapshot, assessment, new Date());
  refresh();
  return meta;
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
