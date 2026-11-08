/**
 * One conversation across channels: turns asked over iMessage and in the app are logged in the
 * same table, and both channels build the agent's context from that log.
 */
import type { IMessage } from "@inkbox/sdk";
import type { ChatTurn } from "../../types";

type HistoryMessage = Pick<IMessage, "direction" | "content" | "createdAt">;

/**
 * Logged turns → message history: each question inbound, each answer outbound just after it.
 * Failed turns are left out: an unanswered question would only muddle the next one.
 */
export function turnsToHistory(turns: ChatTurn[]): HistoryMessage[] {
  return turns.filter((t) => t.status !== "failed").flatMap((t) => {
    const at = new Date(t.createdAt ?? 0);
    const out: HistoryMessage[] = [{ direction: "inbound", content: t.question, createdAt: at }];
    if (t.status === "answered" && t.answer) out.push({ direction: "outbound", content: t.answer, createdAt: new Date(at.getTime() + 1) });
    return out;
  });
}
