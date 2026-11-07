/** Values in £ are whole pounds unless a field name ends in `K` (thousands). */

export interface Farm {
  id: string;
  name: string;
  hectares: number;
  location: string;
  crops: string[];
}

export interface WorkingStep {
  /** Plain-language name of the quantity. */
  label: string;
  value: string;
  unit?: string;
  /** Model variable or formula, shown only in the optional methodology view. */
  formula?: string;
}

export interface Source {
  label: string;
  origin: string;
  date?: string;
}

export type MitigationStatus = "suggested" | "planned" | "done" | "dismissed";

export interface Mitigation {
  id: string;
  riskId: string;
  title: string;
  description: string;
  /** Plain-language cost, e.g. "Premium ~£7.5k". */
  cost: string;
  /** £ reduction in the risk's bad-year hit (or yearly gain when benefitKind is "profit"). */
  badYearReduction: number;
  scoreAfter: number;
  status: MitigationStatus;
  /** "risk" = cuts the bad-year hit; "profit" = raises expected profit every year. */
  benefitKind?: "risk" | "profit";
  /** Specific next-step label, e.g. "Compare wheat contracts". */
  actionLabel?: string;
  /** Calendar item that sets the deadline for this option, when there is one. */
  deadlineId?: string;
  effect: {
    tonnesRemoved?: number;
    /** Exposure removed for risks not measured in tonnes (hectares, £k of debt, …). */
    unitsRemoved?: number;
    /** Change to mean profit in £k; positive = costs money, negative = saves money. */
    meanCost?: number;
  };
}

/** Parameters for the client-side bad-year simulation of a single risk. */
export interface ExposureModel {
  /** Exposed amount today (tonnes, hectares or £k). */
  exposure: number;
  unit: "t" | "ha" | "£k";
  /** Standard deviation of the shock, £ per unit of exposure. */
  unitSd: number;
  /** Combined standard deviation of every other risk, £k. */
  otherSdK: number;
  /** Expected farm profit, £k. */
  meanK: number;
  exposureLabel: string;
  /** Variable names used in "The working". */
  keys: { exposure: string; sd: string; shock: string };
  shockLabel: string;
  tradeoff: {
    title: string;
    /** Column header for the share hedged, e.g. "Sold forward". */
    actionLabel: string;
    /** Amount that can be hedged (e.g. the 2027 crop in tonnes). */
    hedgeable: number;
    note: string;
  };
}

/** How far an input can be trusted. Anything other than "confirmed" makes dependent results provisional. */
export type InputQuality = "confirmed" | "unconfirmed" | "stale" | "missing";

export interface DataQuality {
  quality: InputQuality;
  /** Plain-language explanation of what is unconfirmed, stale or missing. */
  note: string;
}

export type RiskGroup = "Prices" | "Weather" | "Schemes" | "Finance";

export interface RiskResult {
  id: string;
  name: string;
  group: RiskGroup;
  /** 1–10 */
  score: number;
  /** £ hit to farm profit in a 1-in-20 bad year. */
  badYear: number;
  /** £ expected cost of the risk in a typical year. */
  expected: number;
  pctOfProfit: number;
  /** £ change in the bad-year hit over the last 7 days (positive = worse). */
  trend7d: number;
  driver: string;
  summary: string;
  reasoning: string[];
  working: WorkingStep[];
  sources: Source[];
  mitigations: Mitigation[];
  model: ExposureModel;
  dataQuality: DataQuality;
}

export type PendingSource = "onboarding" | "freshness" | "imessage" | "mcp" | "companies_house";
export type PendingStatus = "pending" | "approved" | "rejected";

export interface PendingChange {
  id: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  source: PendingSource;
  reason: string;
  status: PendingStatus;
  receivedAt?: string;
  /** Risk whose inputs this change affects. */
  riskId?: string;
  /** Plain-language effect on the model if approved. */
  impact?: string;
  /** Set when the change has been approved or rejected. */
  resolvedAt?: string;
}

export type CalendarLane = "Selling" | "Inputs" | "Finance" | "Schemes" | "Markets";

/** "confirmed" = a fixed date; "expected" = an estimated date or window; "market" = a scheduled market or policy event. */
export type CalendarCertainty = "confirmed" | "expected" | "market";

export interface CalendarItem {
  id: string;
  lane: CalendarLane;
  kind: "period" | "deadline" | "key";
  /** ISO date */
  start: string;
  end?: string;
  label: string;
  tone?: "warning";
  certainty: CalendarCertainty;
  /** Why this date matters for the farm. */
  why: string;
  /** Where the date comes from. */
  source: string;
  riskId?: string;
}

export interface ProfitSummary {
  expected: number;
  badYear: number;
  goodYear: number;
  /** 0–1 */
  lossChance: number;
  lossYearsOf20: number;
  deltaWeek: number;
  working?: WorkingStep[];
  sources?: Source[];
}

export interface BreakEven {
  crop: string;
  price: number;
  breakEven: number;
  unit: string;
}

export interface TopMitigation {
  rank: number;
  riskName: string;
  scoreBefore: number;
  mitigation: Mitigation;
  deadline?: CalendarItem;
}

export interface AssessmentMeta {
  /** ISO date of the assessment */
  date: string;
  /** Time the assessment last ran (simulated in the demo). */
  updatedAt: string;
  harvestYear: number;
  typicalProfit: number;
  /** ISO date of the most recent market prices used. */
  marketDataDate: string;
  /** ISO date farm inputs were last confirmed in farm setup. */
  farmInputsConfirmed: string;
  /** True while every figure comes from the fictional demo farm. */
  sampleData: boolean;
}

export interface Reminder {
  id: string;
  sendAt: string;
  message: string;
  relatesTo: string;
}

export type Confidence = "high" | "check";

export interface OnboardingField {
  id: string;
  label: string;
  value: string;
  source: string;
  confidence: Confidence;
}

export interface OnboardingSection {
  id: string;
  title: string;
  status: "confirmed" | "review" | "todo";
  agentMessage: string;
  documentsHint: string;
  /** What Headwind assumes, and which results are affected, while this section is unconfirmed. */
  ifMissing: string;
  fields: OnboardingField[];
}

export interface WhatIfInputs {
  wheatPrice: number;
  fertiliserPrice: number;
  yieldPct: number;
  rateChange: number;
}

export interface WhatIfPreset {
  id: string;
  label: string;
  inputs: WhatIfInputs;
  /** Plain-language summary of the inputs this preset changes. */
  changes: string;
}

export interface WhatIfSlider {
  key: keyof WhatIfInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Unit shown beside the numeric input, e.g. "£/t", "%", "pts". */
  unit: string;
  source: string;
}

/** Explanation shown in the side sheet when a £ figure is clicked. */
export interface FigureDetail {
  title: string;
  value: string;
  description?: string;
  working: WorkingStep[];
  sources: Source[];
}
