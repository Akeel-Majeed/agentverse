import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatResult } from "@/lib/agents/chat/agent";
import { ChatUnavailableError } from "@/lib/agents/chat/agent";
import { turnsToHistory } from "@/lib/agents/chat/history";
import { AssistantInputError, AssistantRateLimitError, askFromWeb, resetRateLimit, type WebDeps } from "@/lib/agents/chat/web";
import type { ChatTurn } from "@/lib/types";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const result: ChatResult = {
  text: "Interest rates: a bad year costs £11k.",
  calls: [{ name: "get_risk", input: { risk_id: "interest_rates" }, output: "{}", ms: 4 }],
  check: { figures: ["£11k"], untraced: [], flagged: [], rewritten: false },
  model: "claude-sonnet-5-5",
};

const earlier: ChatTurn[] = [
  { inboundMessageId: "im-1", conversationId: "c1", channel: "imessage", question: "What's my biggest risk?", status: "answered", answer: "Output prices, 10/10.", createdAt: "2026-11-08T09:00:00Z" },
  { inboundMessageId: "im-2", conversationId: "c1", channel: "imessage", question: "hello?", status: "failed", createdAt: "2026-11-08T09:01:00Z" },
];

function deps(over: Partial<WebDeps> = {}) {
  const log: { claimed: unknown[]; finished: unknown[] } = { claimed: [], finished: [] };
  const d: WebDeps = {
    claim: async (t) => (log.claimed.push(t), true),
    finish: async (_id, r) => void log.finished.push(r),
    turns: async () => earlier,
    recall: async () => ({ notes: "- 7 Nov: asked about rates by text", turns: 2, updatedAt: "2026-11-07T20:00:00Z" }),
    answer: vi.fn(async () => result),
    remember: vi.fn(async () => undefined),
    now: () => Date.parse("2026-11-08T10:00:00Z"),
    id: () => "abc",
    ...over,
  };
  return { d, log };
}

describe("in-app assistant", () => {
  beforeEach(() => resetRateLimit());

  it("answers with the shared history from iMessage, then logs the turn as web", async () => {
    const { d, log } = deps();
    const turn = await askFromWeb("  And what about rates?  ", d);
    expect(d.answer).toHaveBeenCalledWith(
      [
        { role: "user", content: "What's my biggest risk?" },
        { role: "assistant", content: "Output prices, 10/10." },
        { role: "user", content: "And what about rates?" },
      ],
      expect.stringContaining("asked about rates by text")
    );
    expect(d.remember).toHaveBeenCalledWith(expect.objectContaining({ turns: 2 }), {
      question: "And what about rates?",
      answer: result.text,
      at: "2026-11-08T10:00:00.000Z",
    });
    expect(turn).toMatchObject({ inboundMessageId: "web-abc", channel: "web", status: "answered", answer: result.text });
    expect(log.claimed[0]).toMatchObject({ channel: "web", conversationId: "web", question: "And what about rates?" });
    expect(log.finished[0]).toMatchObject({ status: "answered", tools: [{ name: "get_risk", ms: 4 }] });
  });

  it("rejects empty and over-long questions before calling the model", async () => {
    const { d } = deps();
    await expect(askFromWeb("   ", d)).rejects.toBeInstanceOf(AssistantInputError);
    await expect(askFromWeb("x".repeat(501), d)).rejects.toBeInstanceOf(AssistantInputError);
    expect(d.answer).not.toHaveBeenCalled();
  });

  it("caps questions per minute", async () => {
    const { d } = deps();
    for (let i = 0; i < 12; i++) await askFromWeb(`q${i}`, d);
    await expect(askFromWeb("one more", d)).rejects.toBeInstanceOf(AssistantRateLimitError);
    expect(d.answer).toHaveBeenCalledTimes(12);
  });

  it("caps questions per minute across server instances, from the shared log", async () => {
    const now = Date.parse("2026-11-08T10:00:00Z");
    const recentTurns: ChatTurn[] = Array.from({ length: 12 }, (_, i) => ({
      inboundMessageId: `web-${i}`,
      conversationId: "web",
      question: `q${i}`,
      channel: "web",
      createdAt: new Date(now - 30_000).toISOString(),
      status: "answered",
    }));
    const { d } = deps({ turns: async () => recentTurns, now: () => now });
    await expect(askFromWeb("one more", d)).rejects.toBeInstanceOf(AssistantRateLimitError);
    expect(d.answer).not.toHaveBeenCalled();
  });

  it("logs a failed turn and passes on a missing key", async () => {
    const { d, log } = deps({ answer: async () => Promise.reject(new ChatUnavailableError()) });
    await expect(askFromWeb("hi", d)).rejects.toBeInstanceOf(ChatUnavailableError);
    expect(log.finished[0]).toMatchObject({ status: "failed", error: "No Anthropic API key" });
  });

  it("still answers when the log is unavailable", async () => {
    const { d, log } = deps({ claim: async () => Promise.reject(new Error("no table")), turns: async () => Promise.reject(new Error("no table")) });
    const turn = await askFromWeb("hi", d);
    expect(turn.status).toBe("answered");
    expect(log.finished).toEqual([]);
  });

  it("turns logged questions and answers into alternating history", () => {
    expect(turnsToHistory(earlier).map((m) => [m.direction, m.content])).toEqual([
      ["inbound", "What's my biggest risk?"],
      ["outbound", "Output prices, 10/10."],
    ]);
  });
});
