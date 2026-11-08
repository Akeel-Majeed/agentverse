/** Contracts for agent runs, inputs and the append-only trace. */
import type { SimResult } from "../engine/types";

export type RunStatus = "numbers_only" | "queued" | "running" | "published" | "held" | "blocked" | "killed" | "failed";
/** Who produced an event: our code, the Jev screen, a Gemini model (reader or judge), or a person. */
export type Actor = "code" | "jev" | "gemini" | "human";
export type ObservationKind = "market" | "profile" | "document" | "news" | "message";
export type ScreenStatus = "passed" | "quarantined" | "review";

export interface AgentRun {
  id: string;
  farmId: string;
  trigger: "update_profile" | "rerun" | "document" | "demo";
  asOf: string;
  seed: number;
  engineVersion: string;
  configHash: string;
  promptVersion: string | null;
  model: string | null;
  status: RunStatus;
  /** Phase 2 spend, computed in code from Gemini `usage` at the Argon price. */
  totalCostUsd: number | null;
  inputTokens: number | null;
  /** Output plus thought tokens. */
  outputTokens: number | null;
  /** Interactions API calls made in phase 2. */
  turns: number | null;
  /** Milliseconds per stage, e.g. { gather: 12, read: 3800, screen: 240, compute: 80, judge: 41000 }. */
  timings: Record<string, number>;
  startedAt: string;
  endedAt: string | null;
  error: string | null;
}

export interface ScreenCheck {
  name: string;
  actor: "jev" | "code";
  value: number;
  threshold: number;
  fired: boolean;
  note?: string;
}

export interface Observation {
  id: string;
  runId: string;
  farmId: string;
  kind: ObservationKind;
  source: string;
  url: string | null;
  fetchedAt: string;
  value: unknown;
  sha256: string;
  screenStatus: ScreenStatus;
  screen: ScreenCheck[] | null;
}

export interface TraceEvent {
  runId: string;
  seq: number;
  type: string;
  actor: Actor;
  /** Canonical JSON text. The hash covers exactly this string. */
  body: string;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface Controls {
  paused: boolean;
  maxTurns: number;
  maxBudgetUsd: number;
  maxProposalsPerRun: number;
  jevThreshold: number;
  zThreshold: number;
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_CONTROLS: Controls = {
  paused: false,
  maxTurns: 8,
  maxBudgetUsd: 3,
  maxProposalsPerRun: 3,
  jevThreshold: 0.5,
  zThreshold: 4,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

/** A change the agent proposes; the farmer approves or rejects it in the approvals UI. */
export interface AgentProposal {
  runId: string;
  fieldKey: string;
  fieldLabel: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  evidence: { observationId: string; quote: string };
}

/** What phase 1 hands to phase 2, stored as the body of the "engine.result" event. */
export interface EngineResultEvent {
  sim: SimResult;
  observationIds: string[];
}
