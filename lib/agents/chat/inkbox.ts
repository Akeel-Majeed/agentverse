import "server-only";
/** Live wiring for the iMessage handler: Inkbox for messages, the store for the action log and memory, Claude for answers and notes. */
import { Inkbox, type AgentIdentity } from "@inkbox/sdk";
import { getStore } from "../../server/store";
import { runChatAgent } from "./agent";
import { turnsToHistory } from "./history";
import { HISTORY_LIMIT, type IMessageDeps } from "./imessage";
import { nextMemory } from "./memory";

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
  claim: async (turn) => (await getStore()).claimChatTurn({ ...turn, channel: "imessage" }),
  finish: async (id, result) => (await getStore()).finishChatTurn(id, result),
  typing: async (conversationId) => (await inkboxIdentity()).sendIMessageTyping(conversationId),
  // The shared log, so the farmer can start a question in the app and follow up by text.
  history: async () => turnsToHistory(await (await getStore()).listChatTurns(HISTORY_LIMIT / 2)),
  send: async (conversationId, text, idempotencyKey) => {
    await (await inkboxIdentity()).sendIMessage({ conversationId, text, idempotencyKey });
  },
  recall: async () => (await getStore()).getChatMemory(),
  answer: (messages, context) => runChatAgent(messages, { context }),
  remember: async (previous, exchange) => (await getStore()).saveChatMemory(await nextMemory(previous, exchange)),
};
