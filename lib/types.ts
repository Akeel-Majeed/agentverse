/** Values in £ are whole pounds unless a field name ends in `K` (thousands). */

export interface Farm {
  id: string;
  name: string;
  hectares: number;
  location: string;
  crops: string[];
}

export interface WorkingStep {
  label: string;
  value: string;
  unit?: string;
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

export interface RiskResult {
  id: string;
  name: string;
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
  /** Monte Carlo result for this risk, shown beside the hand-checkable working. */
  simulation?: { runId: string; p5Hit: number; p5HitDisplay: string; score: number; seed: number; paths: number; configHash: string };
}

export type PendingSource = "onboarding" | "freshness" | "imessage" | "mcp" | "companies_house" | "agent";
export type PendingStatus = "pending" | "approved" | "rejected";

export interface PendingChange {
  id: string;
  /** Profile field this change applies to when approved. */
  fieldKey?: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  source: PendingSource;
  reason: string;
  status: PendingStatus;
  receivedAt?: string;
  /** Agent proposals: the run that proposed it and the verbatim quote it rests on. */
  runId?: string;
  evidence?: { observationId: string; quote: string };
}

export type CalendarLane = "Selling" | "Inputs" | "Finance" | "Schemes" | "Markets";

export interface CalendarItem {
  id: string;
  lane: CalendarLane;
  kind: "period" | "deadline" | "key";
  /** ISO date */
  start: string;
  end?: string;
  label: string;
  tone?: "warning";
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
}

export interface AssessmentMeta {
  /** ISO date of the assessment */
  date: string;
  updatedAt: string;
  harvestYear: number;
  typicalProfit: number;
  /** Agent run behind this assessment (phase one), its status and trace head hash. */
  runId?: string;
  runStatus?: string;
  headHash?: string;
}

export interface Reminder {
  id: string;
  sendAt: string;
  message: string;
  relatesTo: string;
}

export type Confidence = "high" | "check";

export interface OnboardingField {
  /** Profile field key, e.g. `crop.wheat.area_ha`. */
  id: string;
  label: string;
  /** Display value, e.g. "220 ha"; empty when not recorded. */
  value: string;
  source: string;
  confidence: Confidence;
  type?: FieldType;
  unit?: string;
  help?: string;
  /** Risks this field feeds. */
  risks?: { id: RiskId; name: string }[];
  confirmedAt?: string | null;
  /** True when past its valid-until date. */
  stale?: boolean;
}

export interface OnboardingSection {
  id: string;
  title: string;
  status: "confirmed" | "review" | "todo";
  agentMessage: string;
  documentsHint: string;
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
}

export interface WhatIfSlider {
  key: keyof WhatIfInputs;
  label: string;
  min: number;
  max: number;
  step: number;
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

/* ---------- Farm profile and risk profile ---------- */

export type RiskId = "output_prices" | "input_prices" | "weather_yield" | "regulation" | "interest_rates";

/** How a profile field is entered and shown. `money` is whole pounds. */
export type FieldType = "number" | "money" | "text" | "date";

export type ProfileValue = string | number | null;

/** One fact about the farm, as stored in `profile_fields`. */
export interface ProfileFieldValue {
  key: string;
  value: ProfileValue;
  source: string;
  confidence: Confidence;
  /** ISO timestamp the farmer last confirmed it, or null if never. */
  confirmedAt: string | null;
  /** ISO date after which a freshness check asks again. */
  validUntil: string | null;
}

/** Market figures news is compared against. Positive change = higher price or rate. */
export type MetricId =
  | "wheat_feed_gbp_t"
  | "barley_feed_gbp_t"
  | "osr_gbp_t"
  | "an_gbp_t"
  | "diesel_ppl"
  | "bank_rate_pct"
  | "yield_outlook_pct"
  | "sfi_gap_months";

export interface MarketFigure {
  value: number;
  unit: string;
  label: string;
  source: string;
  date: string;
}

export type MarketBaseline = Partial<Record<MetricId, MarketFigure>>;

/** £ change in profit for a +1 unit move in a market metric. */
export interface Sensitivity {
  metric: MetricId;
  label: string;
  perUnit: number;
  unit: string;
}

/** What the farm has at stake for one risk, worked out in code from a profile snapshot. */
export interface RiskExposure {
  riskId: RiskId;
  /** £ at stake (value unsold, inputs unbought, debt, income, revenue). */
  total: number;
  summary: string;
  working: WorkingStep[];
  sensitivities: Sensitivity[];
  fieldKeys: string[];
}

/** A frozen copy of the profile and the market on the day the risk profile was made. */
export interface ProfileSnapshot {
  id: string;
  version: number;
  takenAt: string;
  reason: string;
  fields: Record<string, ProfileValue>;
  market: MarketBaseline;
  exposures: RiskExposure[];
}

export type SignalKind = "market" | "policy" | "weather" | "news";

/** A piece of news, a price move or a policy item, tagged with the risk it touches. */
export interface Signal {
  id: string;
  riskId: RiskId;
  kind: SignalKind;
  title: string;
  summary: string;
  source: string;
  url?: string;
  publishedAt: string;
  /** Measured figure the news reports, if any. */
  metric?: MetricId | null;
  value?: number | null;
}

/** A signal measured against a snapshot. `delta` is the £ change in expected profit; null if not measurable. */
export interface SignalImpact {
  signal: Signal;
  snapshotVersion: number;
  delta: number | null;
  working: WorkingStep[];
  alert: boolean;
}

export interface ProfileChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface ProfileStatus {
  snapshot: { version: number; takenAt: string };
  changes: ProfileChange[];
}

/** One row of the risk profile: the snapshot's exposure plus the latest assessment and news since. */
export interface RiskProfileRow {
  riskId: RiskId;
  name: string;
  score: number;
  badYear: number;
  exposure: RiskExposure;
  newsDelta: number;
  newsCount: number;
  /** News items with a £ figure. */
  newsMeasured: number;
}

/** Everything the risk page shows about where a risk's figures come from. */
export interface RiskInputs {
  fields: { key: string; label: string; value: string; sectionId: string; sectionTitle: string }[];
  exposure: RiskExposure | null;
  snapshot: { version: number; takenAt: string };
  impacts: SignalImpact[];
}

export type SaveSectionResult =
  | { ok: true; section: OnboardingSection; status: ProfileStatus }
  | { ok: false; errors: Record<string, string> };

/** One question answered by the chat agent, as logged in `chat_turns`. */
export interface ChatTurn {
  inboundMessageId: string;
  conversationId: string;
  question: string;
  status: "answering" | "answered" | "failed";
  answer?: string;
  tools?: { name: string; input: unknown; ms: number }[];
  checker?: { flagged: string[]; untraced: string[]; rewritten: boolean };
  model?: string;
  error?: string;
}
