/**
 * The five functions Gemini may call. The declarations are the allowlist: run.ts refuses any other
 * name. Every result is JSON text, kept in ctx.outputs for the figure checker.
 */
import { z } from "zod";
import type { SimResult } from "../../engine/types";
import type { AgentStore } from "../../server/agent-store";
import type { TraceWriter } from "../../trace/chain";
import type { Controls, Observation } from "../../trace/types";
import type { ProfileFieldValue } from "../../types";
import { JUDGEMENT_JSON_SCHEMA } from "./schema";

export interface ToolContext {
  runId: string;
  farmId: string;
  sim: SimResult;
  documents: Observation[];
  profile: ProfileFieldValue[];
  store: AgentStore;
  trace: TraceWriter;
  controls: Controls;
  /** Every tool result text, for the figure checker. */
  outputs: string[];
  proposals: number;
}

const noArgs = { type: "object", properties: {} } as const;

export const TOOL_DECLARATIONS = [
  {
    type: "function",
    name: "get_engine_results",
    description: "All figures the engine computed for this run: profit distribution, five risks, options, DSCR, thresholds, calibration. Every figure has an id and a display string; use the display string verbatim.",
    parameters: noArgs,
  },
  {
    type: "function",
    name: "get_documents",
    description: "Documents the farmer added that passed the input screen: observation id, extracted text, and fields with the verbatim quote each came from.",
    parameters: noArgs,
  },
  { type: "function", name: "get_profile", description: "The farm profile fields with values and sources.", parameters: noArgs },
  {
    type: "function",
    name: "propose_change",
    description: "Propose one profile change for the farmer to approve. Never changes the profile itself. Needs the observation id of the document and a verbatim quote from it.",
    parameters: {
      type: "object",
      properties: {
        field_key: { type: "string", description: "Profile field key, e.g. sales.wheat_2027_forward_t" },
        field_label: { type: "string" },
        current_value: { type: "string", description: "The profile's value as returned by get_profile" },
        proposed_value: { type: "string", description: "The document's value, as a plain number or short string" },
        reason: { type: "string" },
        observation_id: { type: "string", description: "From get_documents" },
        quote: { type: "string", description: "Verbatim words from the document that state the value" },
      },
      required: ["field_key", "field_label", "current_value", "proposed_value", "reason", "observation_id", "quote"],
    },
  },
  {
    type: "function",
    name: "submit_judgement",
    description: "Submit the final judgement. Call exactly once, after the reads and any proposals. Every number must be a display string from get_engine_results.",
    parameters: JUDGEMENT_JSON_SCHEMA,
  },
] as const;

export const TOOL_NAMES: string[] = TOOL_DECLARATIONS.map((t) => t.name);

export type ToolResult = { ok: true; value: unknown } | { ok: false; error: string };

const ok = (ctx: ToolContext, value: unknown): ToolResult => {
  ctx.outputs.push(JSON.stringify(value));
  return { ok: true, value };
};

/** Runs one read or propose function. submit_judgement is terminal and handled in run.ts. */
export async function callTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const s = ctx.sim;
  switch (name) {
    case "get_engine_results":
      return ok(ctx, { meta: s.meta, profit: s.profit, risks: s.risks, options: s.options, dscr: s.dscr, thresholds: s.thresholds, calibration: s.calibration });
    case "get_documents":
      return ok(ctx, ctx.documents.map((d) => ({ observation_id: d.id, source: d.source, value: d.value })));
    case "get_profile":
      return ok(ctx, ctx.profile.map((f) => ({ key: f.key, value: f.value, source: f.source })));
    case "propose_change":
      return proposeChange(ctx, args);
    default:
      return { ok: false, error: `Function ${name} is not allowed` };
  }
}

const ProposalArgs = z.object({
  field_key: z.string(),
  field_label: z.string(),
  current_value: z.string(),
  proposed_value: z.string(),
  reason: z.string(),
  observation_id: z.string(),
  quote: z.string().min(1),
});

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Every string inside a document's stored value, so a quote across a line break or with a " still matches. */
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

/** Writes only to pending_changes, after three code checks: proposal cap, known document, verbatim quote. */
export async function proposeChange(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const a = ProposalArgs.safeParse(args);
  if (!a.success) return { ok: false, error: `Invalid arguments: ${a.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  if (ctx.proposals >= ctx.controls.maxProposalsPerRun) {
    await ctx.trace.append("control.proposal_limit", "code", { limit: ctx.controls.maxProposalsPerRun, args: a.data });
    return { ok: false, error: `Limit of ${ctx.controls.maxProposalsPerRun} proposals per run reached.` };
  }
  const doc = ctx.documents.find((d) => d.id === a.data.observation_id);
  if (!doc) return { ok: false, error: "observation_id must be one returned by get_documents" };
  if (!norm(strings(doc.value).join("\n")).includes(norm(a.data.quote))) {
    await ctx.trace.append("control.quote_not_verbatim", "code", { observationId: doc.id, quote: a.data.quote });
    return { ok: false, error: "quote must be verbatim text from that document" };
  }
  ctx.proposals++;
  await ctx.store.insertProposal({
    farmId: ctx.farmId, runId: ctx.runId, fieldKey: a.data.field_key, fieldLabel: a.data.field_label,
    currentValue: a.data.current_value, proposedValue: a.data.proposed_value, reason: a.data.reason,
    evidence: { observationId: a.data.observation_id, quote: a.data.quote },
  });
  await ctx.trace.append("proposal.queued_for_farmer", "code", a.data);
  return ok(ctx, { status: "queued for the farmer to approve" });
}
