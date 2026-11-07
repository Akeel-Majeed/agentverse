import "server-only";
/** Live wiring for the iMessage handler: Inkbox for messages, the store for the action log and memory, Claude for answers and notes. */
import { Inkbox, type AgentIdentity } from "@inkbox/sdk";
import { getStore } from "../../server/store";
import { runChatAgent } from "./agent";
import { HISTORY_LIMIT, type IMessageDeps } from "./imessage";
import { updateMemory } from "./memory";

let identity: Promise<AgentIdentity> | undefined;

export const agentHandle = () => process.env.INKBOX_AGENT_HANDLE || "fenland-ridge-risk";

export function inkboxIdentity(): Promise<AgentIdentity> {
  identity ??= new Inkbox().getIdentity(agentHandle()).catch((err) => {
    identity = undefined;
    throw err;
  });
  return identity;
}

export const liveDeps: IMessageDeps = {
  claim: async (turn) => (await getStore()).claimChatTurn(turn),
  finish: async (id, result) => (await getStore()).finishChatTurn(id, result),
  typing: async (conversationId) => (await inkboxIdentity()).sendIMessageTyping(conversationId),
  history: async (conversationId) => (await inkboxIdentity()).listIMessages({ conversationId, limit: HISTORY_LIMIT + 6 }),
  send: async (conversationId, text, idempotencyKey) => {
    await (await inkboxIdentity()).sendIMessage({ conversationId, text, idempotencyKey });
  },
  recall: async (conversationId) => (await getStore()).getChatMemory(conversationId),
  answer: (messages, context) => runChatAgent(messages, { context }),
  remember: async (conversationId, previous, exchange) => {
    const notes = await updateMemory(previous?.notes ?? null, exchange);
    await (await getStore()).saveChatMemory({ conversationId, notes, turns: (previous?.turns ?? 0) + 1, updatedAt: new Date().toISOString() });
  },
};
