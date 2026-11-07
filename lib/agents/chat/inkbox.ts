import "server-only";
/** Live wiring for the iMessage handler: Inkbox for messages, the store for the action log, Claude for answers. */
import { Inkbox, type AgentIdentity } from "@inkbox/sdk";
import { getStore } from "../../server/store";
import { runChatAgent } from "./agent";
import type { IMessageDeps } from "./imessage";

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
  history: async (conversationId) => (await inkboxIdentity()).listIMessages({ conversationId, limit: 20 }),
  send: async (conversationId, text, idempotencyKey) => {
    await (await inkboxIdentity()).sendIMessage({ conversationId, text, idempotencyKey });
  },
  answer: (messages) => runChatAgent(messages),
};
