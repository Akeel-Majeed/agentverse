/**
 * The five functions Gemini may call. The declarations are the allowlist: run.ts refuses any other
 * name. Every result is JSON text, kept in ctx.outputs for the figure checker.
 */
import { z } from "zod";
import type { SimResult } from "../../engine/types";
import type { AgentStore } from "../../server/agent-store";
import type { TraceWriter } from "../../trace/chain";
import type { Controls, Observation } from "../../trace/types";
import { fieldDef } from "../../profile/catalogue";
import type { ProfileFieldValue } from "../../types";
import { checkFiguresStrict } from "../checker";
import { JUDGEMENT_JSON_SCHEMA } from "./schema";

export interface ToolContext {
  runId: string;
  farmId: string;
  sim: SimResult;
  /** Documents that passed the screen in this run; the only ones the judge may read or quote. */
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
    description: "Propose one profile change for the farmer to approve. Never changes the profile itself. Needs the observation id of the document and a verbatim quote from its text that contains the proposed value.",
    parameters: {
      type: "object",
      properties: {
        field_key: { type: "string", description: "Profile field key as returned by get_profile, e.g. sales.wheat_2027_forward_t" },
        proposed_value: { type: "string", description: "The document's value, as a plain number or short string" },
        reason: { type: "string", description: "One sentence; any number in it must come from a function result or the document" },
        observation_id: { type: "string", description: "From get_documents" },
        quote: { type: "string", description: "Verbatim words (8+ characters) from the document text that contain the proposed value" },
      },
      required: ["field_key", "proposed_value", "reason", "observation_id", "quote"],
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

/** Model-written arguments. The label and current value are filled in code, never taken from the model. */
const ProposalArgs = z.object({
  field_key: z.string(),
  proposed_value: z.string().min(1),
  reason: z.string(),
  observation_id: z.string(),
  quote: z.string().min(8),
});

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Number tokens with thousands commas dropped, so "1,028" in a quote matches a proposed "1028". */
const numbers = (s: string) => (s.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []);

/**
 * Writes only to pending_changes, after code checks: proposal cap, a catalogue field, a document
 * from this run, a verbatim quote (8+ characters) from the document's text that contains the
 * proposed value, and a reason whose numbers all trace (strict checker).
 */
export async function proposeChange(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const a = ProposalArgs.safeParse(args);
  if (!a.success) return { ok: false, error: `Invalid arguments: ${a.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  if (ctx.proposals >= ctx.controls.maxProposalsPerRun) {
    await ctx.trace.append("control.proposal_limit", "code", { limit: ctx.controls.maxProposalsPerRun, args: a.data });
    return { ok: false, error: `Limit of ${ctx.controls.maxProposalsPerRun} proposals per run reached.` };
  }
  const def = fieldDef(a.data.field_key);
  if (!def) return { ok: false, error: "field_key must be a profile field key returned by get_profile" };
  const doc = ctx.documents.find((d) => d.id === a.data.observation_id);
  if (!doc) return { ok: false, error: "observation_id must be a document returned by get_documents in this run" };
  const text = (doc.value as { text?: unknown } | null)?.text;
  const docText = typeof text === "string" ? text : "";
  if (!norm(docText).includes(norm(a.data.quote))) {
    await ctx.trace.append("control.quote_not_verbatim", "code", { observationId: doc.id, quote: a.data.quote });
    return { ok: false, error: "quote must be verbatim text from that document" };
  }
  const want = numbers(a.data.proposed_value);
  const have = new Set(numbers(a.data.quote));
  if (want.length ? !want.every((n) => have.has(n)) : !norm(a.data.quote).includes(norm(a.data.proposed_value))) {
    await ctx.trace.append("control.quote_not_verbatim", "code", { observationId: doc.id, quote: a.data.quote, proposedValue: a.data.proposed_value });
    return { ok: false, error: "quote must contain the proposed value" };
  }
  const reasonCheck = checkFiguresStrict(a.data.reason, [...ctx.outputs, docText]);
  if (reasonCheck.untraced.length) {
    await ctx.trace.append("control.untraced_figure", "code", { where: "propose_change.reason", untraced: reasonCheck.untraced });
    return { ok: false, error: `reason has numbers no function result or the document contains: ${reasonCheck.untraced.join(", ")}` };
  }
  const current = ctx.profile.find((f) => f.key === def.key)?.value;
  const proposal = {
    field_key: def.key, field_label: def.label, current_value: current === undefined || current === null ? "not set" : String(current),
    proposed_value: a.data.proposed_value, reason: a.data.reason, observation_id: doc.id, quote: a.data.quote,
  };
  ctx.proposals++;
  await ctx.store.insertProposal({
    farmId: ctx.farmId, runId: ctx.runId, fieldKey: proposal.field_key, fieldLabel: proposal.field_label,
    currentValue: proposal.current_value, proposedValue: proposal.proposed_value, reason: proposal.reason,
    evidence: { observationId: doc.id, quote: proposal.quote },
  });
  await ctx.trace.append("proposal.queued_for_farmer", "code", proposal);
  return ok(ctx, { status: "queued for the farmer to approve" });
}
