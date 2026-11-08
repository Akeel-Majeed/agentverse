/**
 * The confirmation gate for profile changes made through chat. Enforced in code, not by the model:
 * a proposed change is applied only when (1) the farmer's latest message is a plain yes, and
 * (2) the change's reference appears in an earlier assistant message, i.e. the farmer was shown
 * the exact change before saying yes. A proposal can never be confirmed in the turn that made it.
 */
import type Anthropic from "@anthropic-ai/sdk";

/** Short reference the farmer sees, e.g. "3F9A2C". */
export const changeRef = (id: string) => id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();

const YES = /^(yes|yep|yeah|yup|y|ok|okay|sure|confirm|confirmed|correct|approve|approved|go ahead|do it|that'?s right)(\s+(please|do it|go ahead|confirm|that'?s right|thanks|thank you))?[\s.!👍✅]*$/i;

/** A plain yes: no conditions, no corrections ("yes but make it 900" is not a yes). */
export function isPlainYes(text: string): boolean {
  return YES.test(text.normalize("NFKC").trim());
}

const textOf = (m: Anthropic.Beta.BetaMessageParam) =>
  typeof m.content === "string" ? m.content : (m.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join(" ");

export type GateResult = { ok: true } | { ok: false; reason: string };

export function confirmationGate(messages: Anthropic.Beta.BetaMessageParam[], ref: string): GateResult {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return { ok: false, reason: "There is no message from the farmer to confirm with." };
  // Merged turns: the confirmation is the farmer's last line.
  const lastLine = textOf(last).trim().split("\n").at(-1) ?? "";
  if (!isPlainYes(lastLine)) {
    return { ok: false, reason: "The farmer's latest message isn't a plain yes. Ask them to reply YES to confirm, or tell you what to change." };
  }
  const shown = messages.slice(0, -1).some((m) => m.role === "assistant" && textOf(m).toUpperCase().includes(ref.toUpperCase()));
  if (!shown) {
    return { ok: false, reason: `Change ${ref} wasn't shown to the farmer in an earlier message. Show them the change with its ref and wait for their YES.` };
  }
  return { ok: true };
}
