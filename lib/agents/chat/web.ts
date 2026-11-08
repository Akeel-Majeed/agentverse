/**
 * The in-app assistant: the same agent, tools and figure checker as iMessage, logged to the same
 * chat_turns table so either channel continues the other's conversation.
 */
import type { ChatTurn } from "../../types";
import { ChatUnavailableError, type ChatResult } from "./agent";
import { turnsToHistory } from "./history";
import { historyToMessages } from "./imessage";
import type Anthropic from "@anthropic-ai/sdk";

export const MAX_QUESTION = 500;
const RATE_LIMIT = 12; // questions per minute, per server instance
const HISTORY_TURNS = 16;

export class AssistantInputError extends Error {}
export class AssistantRateLimitError extends Error {}

export interface WebDeps {
  claim(turn: Pick<ChatTurn, "inboundMessageId" | "conversationId" | "question" | "channel">): Promise<boolean>;
  finish(inboundMessageId: string, result: Omit<ChatTurn, "inboundMessageId" | "conversationId" | "question">): Promise<void>;
  turns(limit: number): Promise<ChatTurn[]>;
  answer(messages: Anthropic.Beta.BetaMessageParam[]): Promise<ChatResult>;
  now?: () => number;
  id?: () => string;
}

const recent: number[] = [];

/** Limits enforced in code: question length and a per-minute cap, before any model call. */
function checkLimits(question: string, now: number) {
  if (!question) throw new AssistantInputError("Ask a question.");
  if (question.length > MAX_QUESTION) throw new AssistantInputError(`Keep questions under ${MAX_QUESTION} characters.`);
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= RATE_LIMIT) throw new AssistantRateLimitError("Too many questions in a minute. Try again shortly.");
  recent.push(now);
}

export function resetRateLimit() {
  recent.length = 0;
}

export async function askFromWeb(raw: string, deps: WebDeps): Promise<ChatTurn> {
  const question = raw.trim();
  const now = deps.now?.() ?? Date.now();
  checkLimits(question, now);

  const id = `web-${deps.id?.() ?? crypto.randomUUID()}`;
  const createdAt = new Date(now).toISOString();
  let logged = true;
  try {
    logged = await deps.claim({ inboundMessageId: id, conversationId: "web", question, channel: "web" });
  } catch (err) {
    logged = false;
    console.warn("[assistant] couldn't log the turn; answering anyway", err);
  }

  const finish = (result: Parameters<WebDeps["finish"]>[1]) =>
    logged ? deps.finish(id, result).catch((err) => console.warn("[assistant] couldn't finish the log", err)) : Promise.resolve();

  try {
    // Shared history from both channels, ending with this question.
    const past = (await deps.turns(HISTORY_TURNS).catch(() => [] as ChatTurn[])).filter((t) => t.inboundMessageId !== id);
    const messages = historyToMessages([
      ...turnsToHistory(past),
      { direction: "inbound", content: question, createdAt: new Date(now + 1_000_000) },
    ]);
    const result = await deps.answer(messages);
    const done: ChatTurn = {
      inboundMessageId: id,
      conversationId: "web",
      question,
      channel: "web",
      createdAt,
      status: "answered",
      answer: result.text,
      tools: result.calls.map(({ name, input, ms }) => ({ name, input, ms })),
      checker: { flagged: result.check.flagged, untraced: result.check.untraced, rewritten: result.check.rewritten },
      model: result.model,
    };
    await finish({ status: done.status, answer: done.answer, tools: done.tools, checker: done.checker, model: done.model });
    return done;
  } catch (err) {
    await finish({ status: "failed", error: err instanceof ChatUnavailableError ? "No Anthropic API key" : err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
