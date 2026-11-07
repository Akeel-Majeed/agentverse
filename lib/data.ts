/**
 * The only module components import data from. Every function is async so the mock
 * implementations can be replaced with API calls without touching callers.
 */
import * as mock from "./mock";
import { categoryFromRisk, overallRisk, RING_ORDER, unattributedSd, type CategoryExposure, type OverallInput, type OverallRisk } from "./overall";
import type {
  AssessmentMeta,
  BreakEven,
  CalendarItem,
  Farm,
  OnboardingSection,
  PendingChange,
  ProfitSummary,
  Reminder,
  RiskResult,
  TopMitigation,
  WhatIfInputs,
  WhatIfPreset,
  WhatIfSlider,
} from "./types";

const clone = <T>(value: T): T => structuredClone(value);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let pending: PendingChange[] = clone(mock.pendingChanges);
const originals = new Map(mock.pendingChanges.map((p) => [p.id, p.proposedValue]));
/** The demo fails the first attempt on this proposal so error and retry handling can be seen. */
const failOnce = new Set(["pc-lender"]);

export class DemoRequestError extends Error {}

export async function getFarm(): Promise<Farm> {
  return clone(mock.farm);
}

export async function getAssessmentMeta(): Promise<AssessmentMeta> {
  return clone(mock.meta);
}

export async function getRisks(): Promise<RiskResult[]> {
  return clone(mock.risks).sort((a, b) => b.score - a.score || b.badYear - a.badYear);
}

export async function getRisk(id: string): Promise<RiskResult | null> {
  const risk = mock.risks.find((r) => r.id === id);
  return risk ? clone(risk) : null;
}

/** How the recommended actions are ordered. Shown next to the list. */
export const ACTION_RANKING_BASIS =
  "One shortlisted option per risk, ordered by how severe the risk it addresses is. Risk reductions and profit gains are different kinds of benefit, so they are not added together or ranked against each other by size.";

export async function getTopMitigations(): Promise<TopMitigation[]> {
  return mock.topMitigationIds
    .flatMap((id) => {
      const risk = mock.risks.find((r) => r.mitigations.some((m) => m.id === id));
      const mitigation = risk?.mitigations.find((m) => m.id === id);
      if (!risk || !mitigation) return [];
      const deadline = mock.calendar.find((c) => c.id === mitigation.deadlineId);
      return [{ riskName: risk.name, scoreBefore: risk.score, mitigation: clone(mitigation), deadline: deadline && clone(deadline) }];
    })
    .sort((a, b) => b.scoreBefore - a.scoreBefore)
    .map((item, i) => ({ ...item, rank: i + 1 }));
}

export interface OverallRiskSummary {
  overall: OverallRisk;
  /** Categories in fixed ring order, outer to inner. */
  categories: CategoryExposure[];
  input: OverallInput;
}

/** The whole-farm overall risk score and its inputs. See lib/overall.ts for the method. */
export async function getOverallRisk(): Promise<OverallRiskSummary> {
  const byId = new Map(mock.risks.map((r) => [r.id, r]));
  const categories = RING_ORDER.flatMap((id) => {
    const risk = byId.get(id);
    return risk ? [categoryFromRisk(risk)] : [];
  });
  const allSds = mock.risks.map((r) => (r.model.exposure * r.model.unitSd) / 1000);
  const input: OverallInput = {
    expectedProfitK: mock.profit.expected / 1000,
    typicalProfitK: mock.TYPICAL_PROFIT / 1000,
    unattributedSdK: unattributedSd(mock.FARM_SD_K, allSds),
    categories,
  };
  return clone({ overall: overallRisk(input), categories, input });
}

export async function getProfitSummary(): Promise<ProfitSummary> {
  return clone(mock.profit);
}

export async function getBreakEvens(): Promise<BreakEven[]> {
  return clone(mock.breakEvens);
}

export async function getPendingChanges(): Promise<PendingChange[]> {
  return clone(pending);
}

function setStatus(id: string, status: PendingChange["status"], value?: string): PendingChange | null {
  const item = pending.find((p) => p.id === id);
  if (!item) return null;
  item.status = status;
  item.proposedValue = value ?? originals.get(id) ?? item.proposedValue;
  item.resolvedAt = status === "pending" ? undefined : new Date().toISOString();
  pending = [...pending];
  return clone(item);
}

async function mutate(id: string, status: PendingChange["status"], value?: string): Promise<PendingChange | null> {
  await delay(400);
  if (failOnce.delete(id)) {
    throw new DemoRequestError("The update couldn't be saved: simulated connection error in this demo. Nothing was changed.");
  }
  return setStatus(id, status, value);
}

/** Accept a proposed change. Pass `value` when the farmer edited the proposal. */
export async function approveChange(id: string, value?: string): Promise<PendingChange | null> {
  return mutate(id, "approved", value);
}

export async function rejectChange(id: string): Promise<PendingChange | null> {
  return mutate(id, "rejected");
}

/** Put a resolved change back in the queue with its original proposal. */
export async function undoChange(id: string): Promise<PendingChange | null> {
  return mutate(id, "pending");
}

/** Simulated: waits, then returns the same sample assessment with a new run time. */
export async function rerunAssessment(): Promise<AssessmentMeta> {
  await delay(1200);
  const now = new Date();
  const updatedAt = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return { ...clone(mock.meta), updatedAt };
}

export async function getCalendar(): Promise<CalendarItem[]> {
  return clone(mock.calendar).sort((a, b) => a.start.localeCompare(b.start));
}

/** Dated items (not periods) on or after `from`, soonest first. */
export async function getUpcoming(from: string, limit?: number): Promise<CalendarItem[]> {
  const items = (await getCalendar()).filter((c) => c.kind !== "period" && c.start >= from);
  return limit ? items.slice(0, limit) : items;
}

export async function getReminders(): Promise<Reminder[]> {
  return clone(mock.reminders);
}

export async function getOnboarding(): Promise<OnboardingSection[]> {
  return clone(mock.onboarding);
}

export async function confirmSection(id: string): Promise<OnboardingSection | null> {
  await delay(150);
  const section = mock.onboarding.find((s) => s.id === id);
  return section ? { ...clone(section), status: "confirmed" } : null;
}

export async function getWhatIfConfig(): Promise<{
  baseline: WhatIfInputs;
  presets: WhatIfPreset[];
  sliders: WhatIfSlider[];
}> {
  return clone({ baseline: mock.whatIfBaseline, presets: mock.whatIfPresets, sliders: mock.whatIfSliders });
}
