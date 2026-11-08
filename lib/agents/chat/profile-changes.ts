import "server-only";
/**
 * Profile changes through chat: the agent proposes, the farmer confirms. Proposals go to the
 * approval queue (pending_changes) like any other source; a change is applied only through
 * approveChange, after the code gate in confirm.ts has seen the farmer's plain yes to that exact
 * change. The agent never writes to the profile directly.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { approveChange, rejectChange } from "../../data";
import { fieldDef } from "../../profile/catalogue";
import { problemFor, profileProblems } from "../../profile/checks";
import { valuesOf } from "../../profile/risk-profile";
import { formatValue, parseValue } from "../../profile/values";
import { getStore } from "../../server/store";
import type { PendingChange } from "../../types";
import { changeRef, confirmationGate } from "./confirm";

/** Open chat proposals at once: a runaway agent can't flood the farmer's approval queue. */
export const MAX_OPEN_CHAT_PROPOSALS = 3;

export interface ChangeContext {
  channel: "imessage" | "web";
  /** The conversation this turn answers; the confirmation gate reads it. */
  messages: Anthropic.Beta.BetaMessageParam[];
}

const fromChat = (p: PendingChange) => p.source === "chat" || p.source === "imessage";

async function findByRef(ref: string): Promise<PendingChange | undefined> {
  const wanted = ref.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return (await (await getStore()).getPendingChanges()).find((p) => p.status === "pending" && changeRef(p.id) === wanted);
}

export async function proposeProfileChange(args: { field_key: string; value: string; reason: string }, ctx: ChangeContext) {
  const def = fieldDef(args.field_key);
  if (!def) return { proposed: false, error: "Unknown field key. Use a key from get_profile." };
  const parsed = parseValue(def, args.value);
  if (!parsed.ok) return { proposed: false, error: parsed.error };

  const store = await getStore();
  const [fields, pending] = await Promise.all([store.getProfileFields(), store.getPendingChanges()]);
  const current = fields.find((f) => f.key === def.key)?.value ?? null;
  if (String(current ?? "") === String(parsed.value ?? "")) return { proposed: false, error: `${def.label} is already ${formatValue(def, current) || "not recorded"}.` };
  // The same checks as the farmer's own edits.
  const conflict = problemFor(profileProblems({ ...valuesOf(fields), [def.key]: parsed.value }), def.key);
  if (conflict) return { proposed: false, error: conflict };
  if (pending.filter((p) => p.status === "pending" && fromChat(p)).length >= MAX_OPEN_CHAT_PROPOSALS) {
    return { proposed: false, error: `There are already ${MAX_OPEN_CHAT_PROPOSALS} changes waiting for the farmer's answer. Ask them to confirm or cancel those first.` };
  }

  const from = formatValue(def, current) || "not recorded";
  const to = formatValue(def, parsed.value) || "not recorded";
  const id = await store.insertPendingChange({
    fieldKey: def.key,
    field: def.label,
    currentValue: from,
    proposedValue: to,
    source: ctx.channel === "web" ? "chat" : "imessage",
    reason: args.reason.slice(0, 300),
    status: "pending",
  });
  const ref = changeRef(id);
  return {
    proposed: true,
    ref,
    field: def.label,
    from,
    to,
    status: "waiting for the farmer's YES; nothing has changed yet",
    tell_the_farmer: `Change ${def.label} from ${from} to ${to}? Reply YES to confirm (ref ${ref}).`,
  };
}

export async function confirmProfileChange(args: { ref: string }, ctx: ChangeContext) {
  const item = await findByRef(args.ref);
  if (!item) return { applied: false, error: `No change ${args.ref} is waiting for approval.` };
  // Enforced in code: the farmer's latest message is a plain yes, and they were shown this change before.
  const gate = confirmationGate(ctx.messages, changeRef(item.id));
  if (!gate.ok) return { applied: false, control: "confirmation required", reason: gate.reason };
  const result = await approveChange(item.id);
  if (!result.ok) return { applied: false, error: result.error };
  return {
    applied: true,
    field: item.field,
    now: item.proposedValue,
    was: item.currentValue,
    note: "Saved to the farm profile. The risk figures use it once the farmer updates the risk profile (Farm setup → Update risk profile).",
  };
}

export async function cancelProfileChange(args: { ref: string }) {
  const item = await findByRef(args.ref);
  if (!item) return { cancelled: false, error: `No change ${args.ref} is waiting for approval.` };
  if (!fromChat(item)) return { cancelled: false, error: "Only changes proposed in chat can be cancelled here; the farmer can reject others in the approval queue." };
  await rejectChange(item.id);
  return { cancelled: true, field: item.field, kept: item.currentValue };
}
