import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

describe("activity log", () => {
  it("counts answers, tool calls, caught figures and held-back replies, and lists decisions and snapshots", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    vi.resetModules();
    const data = await import("@/lib/data");
    const { getStore } = await import("@/lib/server/store");
    const store = await getStore();
    await store.claimChatTurn({ inboundMessageId: "a", conversationId: "web", question: "Biggest risk?", channel: "web" });
    await store.finishChatTurn("a", {
      status: "answered",
      answer: "Output prices: £149k in a bad year.",
      tools: [{ name: "get_risk_profile", input: {}, ms: 12 }],
      checker: { flagged: ["£150k"], untraced: [], rewritten: true },
    });
    await store.claimChatTurn({ inboundMessageId: "b", conversationId: "c1", question: "Fix the loan?", channel: "imessage" });
    await store.finishChatTurn("b", { status: "answered", answer: "held", tools: [], checker: { flagged: ["£9k"], untraced: ["£8.1k"], rewritten: true, blocked: true } });
    await data.rejectChange("pc-lender");
    await data.updateRiskProfile("Checked");

    const a = await data.getActivity();
    expect(a.totals).toEqual({ answered: 2, failed: 0, toolCalls: 1, caught: 2, caughtReplies: 2, heldBack: 1 });
    expect(a.turns[0].inboundMessageId).toBe("b"); // newest first
    expect(a.decisions).toMatchObject([{ id: "pc-lender", status: "rejected" }]);
    expect(a.snapshots.map((s) => s.version)).toEqual([2, 1]);
  });
});
