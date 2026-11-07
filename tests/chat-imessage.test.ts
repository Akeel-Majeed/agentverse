import type { IMessageWebhookPayload } from "@inkbox/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatUnavailableError, type ChatResult } from "@/lib/agents/chat/agent";
import { FAILED, NOT_SET_UP, handleIMessage, historyToMessages, splitForIMessage, type IMessageDeps } from "@/lib/agents/chat/imessage";

function payload(over: Partial<NonNullable<IMessageWebhookPayload["data"]["message"]>> = {}, event = "imessage.received"): IMessageWebhookPayload {
  return {
    id: "evt_1",
    event_type: event as IMessageWebhookPayload["event_type"],
    timestamp: "2026-11-07T20:00:00Z",
    data: {
      message: {
        id: "msg_in_1",
        conversation_id: "conv_1",
        assignment_id: "as_1",
        direction: "inbound",
        remote_number: "+447700900123",
        content: "What's my biggest risk?",
        is_group: false,
        created_at: "2026-11-07T20:00:00Z",
        ...over,
      } as never,
      reaction: null,
      contacts: [],
      agent_identities: [],
    },
  };
}

const answer: ChatResult = {
  text: "Output prices: 10/10, a bad year costs £149k.",
  calls: [{ name: "get_risk_profile", input: {}, output: "{}", ms: 3 }],
  check: { figures: ["10/10", "£149k"], untraced: [], flagged: [], rewritten: false },
  model: "claude-sonnet-5-5",
};

function deps(over: Partial<IMessageDeps> = {}) {
  const sent: { text: string; key: string }[] = [];
  const logs: unknown[] = [];
  const claimed = new Set<string>();
  const d: IMessageDeps = {
    claim: async (t) => (claimed.has(t.inboundMessageId) ? false : (claimed.add(t.inboundMessageId), true)),
    finish: async (_id, r) => void logs.push(r),
    typing: async () => undefined,
    history: async () => [
      { direction: "outbound", content: "Hi, I'm the farm's risk assistant.", createdAt: new Date("2026-11-07T19:00:00Z") },
      { direction: "inbound", content: "hello", createdAt: new Date("2026-11-07T18:59:00Z") },
    ],
    send: async (_c, text, key) => void sent.push({ text, key }),
    answer: vi.fn(async () => answer),
    ...over,
  };
  return { d, sent, logs };
}

describe("iMessage handler", () => {
  let t: ReturnType<typeof deps>;
  beforeEach(() => {
    t = deps();
  });

  it("answers an inbound message with the history and logs the turn", async () => {
    expect(await handleIMessage(payload(), t.d)).toBe("answered");
    expect(t.d.answer).toHaveBeenCalledWith([
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hi, I'm the farm's risk assistant." },
      { role: "user", content: "What's my biggest risk?" },
    ]);
    expect(t.sent).toEqual([{ text: answer.text, key: "reply-msg_in_1-0" }]);
    expect(t.logs[0]).toMatchObject({ status: "answered", model: "claude-sonnet-5-5", tools: [{ name: "get_risk_profile", ms: 3 }] });
  });

  it("answers a webhook retry only once", async () => {
    await handleIMessage(payload(), t.d);
    expect(await handleIMessage(payload(), t.d)).toBe("duplicate");
    expect(t.d.answer).toHaveBeenCalledTimes(1);
  });

  it("ignores outbound, group, empty and non-message events", async () => {
    expect(await handleIMessage(payload({ direction: "outbound" }), t.d)).toBe("skipped");
    expect(await handleIMessage(payload({ is_group: true }), t.d)).toBe("skipped");
    expect(await handleIMessage(payload({ content: "  " }), t.d)).toBe("skipped");
    expect(await handleIMessage(payload({}, "imessage.delivered"), t.d)).toBe("skipped");
    expect(t.sent).toEqual([]);
  });

  it("says it isn't set up when there is no API key", async () => {
    const x = deps({ answer: async () => Promise.reject(new ChatUnavailableError()) });
    expect(await handleIMessage(payload(), x.d)).toBe("failed");
    expect(x.sent[0].text).toBe(NOT_SET_UP);
    expect(x.logs[0]).toMatchObject({ status: "failed" });
  });

  it("apologises when answering fails", async () => {
    const x = deps({ answer: async () => Promise.reject(new Error("boom")) });
    await handleIMessage(payload(), x.d);
    expect(x.sent[0].text).toBe(FAILED);
  });

  it("still answers if the action log is unavailable", async () => {
    const x = deps({ claim: async () => Promise.reject(new Error("no table")) });
    expect(await handleIMessage(payload(), x.d)).toBe("answered");
  });
});

describe("history and message splitting", () => {
  it("merges same-role turns and drops a leading assistant message", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 10, 7, 10, m));
    expect(
      historyToMessages([
        { direction: "outbound", content: "Welcome", createdAt: at(0) },
        { direction: "inbound", content: "a", createdAt: at(1) },
        { direction: "inbound", content: "b", createdAt: at(2) },
        { direction: "outbound", content: null, createdAt: at(3) },
      ])
    ).toEqual([{ role: "user", content: "a\nb" }]);
  });

  it("splits long replies at sentence boundaries", () => {
    const parts = splitForIMessage("One. Two is longer. Three.", 12);
    expect(parts).toEqual(["One.", "Two is longer.".slice(0, 12), "Three."]);
    expect(parts.every((p) => p.length <= 12)).toBe(true);
    expect(splitForIMessage("Short.")).toEqual(["Short."]);
  });
});
