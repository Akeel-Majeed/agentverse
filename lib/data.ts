/**
 * The only module components import data from. Every function is async so the mock
 * implementations can be replaced with API calls without touching callers.
 */
import * as mock from "./mock";
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

export async function getTopMitigations(): Promise<TopMitigation[]> {
  return mock.topMitigationIds.flatMap((id, i) => {
    const risk = mock.risks.find((r) => r.mitigations.some((m) => m.id === id));
    const mitigation = risk?.mitigations.find((m) => m.id === id);
    if (!risk || !mitigation) return [];
    return [{ rank: i + 1, riskName: risk.name, scoreBefore: risk.score, mitigation: clone(mitigation) }];
  });
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
  if (value !== undefined) item.proposedValue = value;
  pending = [...pending];
  return clone(item);
}

/** Accept a proposed change. Pass `value` when the farmer edited the proposal. */
export async function approveChange(id: string, value?: string): Promise<PendingChange | null> {
  await delay(150);
  return setStatus(id, "approved", value);
}

export async function rejectChange(id: string): Promise<PendingChange | null> {
  await delay(150);
  return setStatus(id, "rejected");
}

export async function rerunAssessment(): Promise<AssessmentMeta> {
  await delay(1200);
  return clone(mock.meta);
}

export async function getCalendar(): Promise<CalendarItem[]> {
  return clone(mock.calendar);
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
