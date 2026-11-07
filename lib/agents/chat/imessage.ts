/**
 * iMessage side of the chat agent: turns an Inkbox `imessage.received` webhook into an answer.
 * claim (dedupe + log) → typing → history + memory → agent → reply → finish log → update memory.
 *
 * Context the agent sees: running notes on the whole conversation (memory.ts) plus the last
 * HISTORY_LIMIT messages verbatim.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { IMessage, IMessageWebhookPayload } from "@inkbox/sdk";
import type { ChatMemory, ChatTurn } from "../../types";
import { ChatUnavailableError, type ChatResult } from "./agent";
import { memoryBlock, type Exchange } from "./memory";

/** Messages passed verbatim; anything older reaches the agent only through the memory notes. */
export const HISTORY_LIMIT = 24;
export const MAX_PART = 1000;

export const NOT_SET_UP = "The farm assistant isn't set up yet. Please try again later.";
export const FAILED = "Sorry, something went wrong working that out. Please try again in a minute.";

/** Inkbox message history (any order) → Anthropic messages: oldest first, alternating, starting with the farmer. */
export function historyToMessages(messages: Pick<IMessage, "direction" | "content" | "createdAt">[]): Anthropic.Beta.BetaMessageParam[] {
  const sorted = [...messages]
    .filter((m) => (m.content ?? "").trim() !== "")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-HISTORY_LIMIT);
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of sorted) {
    const role = m.direction === "inbound" ? "user" : "assistant";
    const text = (m.content ?? "").trim();
    const last = out.at(-1);
    if (last && last.role === role) last.content += `\n${text}`;
    else out.push({ role, content: text });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

/** Split a long reply on paragraph, then sentence, boundaries so each part fits one iMessage. */
export function splitForIMessage(text: string, max = MAX_PART): string[] {
  const parts: string[] = [];
  let current = "";
  const pieces = text.split(/(?<=\n)\n+|(?<=[.!?])\s+/);
  for (const piece of pieces) {
    const next = current ? `${current}${current.endsWith("\n") ? "" : " "}${piece}` : piece;
    if (next.length <= max) {
      current = next;
      continue;
    }
    if (current) parts.push(current.trim());
    current = piece.length > max ? piece.slice(0, max) : piece;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export interface IMessageDeps {
  claim(turn: Pick<ChatTurn, "inboundMessageId" | "conversationId" | "question">): Promise<boolean>;
  finish(inboundMessageId: string, result: Omit<ChatTurn, "inboundMessageId" | "conversationId" | "question">): Promise<void>;
  typing(conversationId: string): Promise<void>;
  history(conversationId: string): Promise<Pick<IMessage, "direction" | "content" | "createdAt">[]>;
  send(conversationId: string, text: string, idempotencyKey: string): Promise<void>;
  /** Running notes on this conversation, or null if none yet. */
  recall(conversationId: string): Promise<ChatMemory | null>;
  answer(messages: Anthropic.Beta.BetaMessageParam[], context: string): Promise<ChatResult>;
  /** Fold an answered exchange into the notes. Runs after the reply is sent. */
  remember(conversationId: string, previous: ChatMemory | null, exchange: Exchange): Promise<void>;
}

/** Which webhook events the agent answers: inbound one-to-one text messages. */
export function inboundText(payload: IMessageWebhookPayload) {
  const m = payload.data.message;
  if (payload.event_type !== "imessage.received" || !m || m.direction !== "inbound" || m.is_group) return null;
  const text = (m.content ?? "").trim();
  return text ? { id: m.id, conversationId: m.conversation_id, text, createdAt: m.created_at } : null;
}

export async function handleIMessage(payload: IMessageWebhookPayload, deps: IMessageDeps): Promise<"answered" | "skipped" | "duplicate" | "failed"> {
  const inbound = inboundText(payload);
  if (!inbound) return "skipped";

  let claimed = true;
  try {
    claimed = await deps.claim({ inboundMessageId: inbound.id, conversationId: inbound.conversationId, question: inbound.text });
  } catch (err) {
    console.warn("[chat] couldn't log the turn; answering anyway", err);
  }
  if (!claimed) return "duplicate";

  const reply = async (text: string) => {
    const parts = splitForIMessage(text);
    for (const [i, part] of Array.from(parts.entries())) await deps.send(inbound.conversationId, part, `reply-${inbound.id}-${i}`);
  };
  const finish = (result: Parameters<IMessageDeps["finish"]>[1]) =>
    deps.finish(inbound.id, result).catch((err) => console.warn("[chat] couldn't finish the log", err));

  try {
    await deps.typing(inbound.conversationId).catch(() => undefined);
    // History up to this message. The webhook can arrive before the message shows in history,
    // so add it if it's missing.
    const at = new Date(inbound.createdAt).getTime();
    const past = (await deps.history(inbound.conversationId)).filter((m) => new Date(m.createdAt).getTime() <= at);
    const present = past.some((m) => m.direction === "inbound" && m.content?.trim() === inbound.text);
    const history = historyToMessages(present ? past : [...past, { direction: "inbound", content: inbound.text, createdAt: new Date(inbound.createdAt) }]);
    const memory = await deps.recall(inbound.conversationId).catch((err) => {
      console.warn("[chat] couldn't read the memory; answering without it", err);
      return null;
    });
    const result = await deps.answer(history, memoryBlock(memory));
    await reply(result.text);
    await finish({
      status: "answered",
      answer: result.text,
      tools: result.calls.map(({ name, input, ms }) => ({ name, input, ms })),
      checker: { flagged: result.check.flagged, untraced: result.check.untraced, rewritten: result.check.rewritten },
      model: result.model,
    });
    await deps
      .remember(inbound.conversationId, memory, { question: inbound.text, answer: result.text, at: inbound.createdAt })
      .catch((err) => console.warn("[chat] couldn't update the memory", err));
    return "answered";
  } catch (err) {
    console.error("[chat] failed to answer", err);
    const text = err instanceof ChatUnavailableError ? NOT_SET_UP : FAILED;
    await reply(text).catch((e) => console.error("[chat] failed to send the apology", e));
    await finish({ status: "failed", answer: text, error: err instanceof Error ? err.message : String(err) });
    return "failed";
  }
}
