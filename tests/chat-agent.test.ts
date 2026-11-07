import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ChatUnavailableError, runChatAgent } from "@/lib/agents/chat/agent";
import { checkFigures, extractFigures } from "@/lib/agents/checker";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
// React's cache() only exists in the Next server runtime; run the data layer without memoising.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

describe("figure checker", () => {
  it("finds money, percentages, tonnes, hectares, scores and x in 20", () => {
    const keys = extractFigures("Bad year −£149k (175%), 2,898 t on 450 ha, score 10/10, 4 in 20, wheat £178/t").map((f) => f.key);
    expect(keys).toEqual(["gbp:149000", "gbp/t:178", "pct:175", "in20:4", "score:10", "t:2898", "ha:450"]);
  });

  it("treats £11k and £11,000 as the same figure, and ignores sign", () => {
    expect(checkFigures("It costs £11,000, down £17k", ['{"a":"£11k","b":"−£17k"}']).untraced).toEqual([]);
  });

  it("flags figures no source contains", () => {
    expect(checkFigures("That saves £118k a year, about 12%", ['{"hit":"£149k","cut":"£31k"}']).untraced).toEqual(["£118k", "12%"]);
  });

  it("does not confuse t/ha yields with tonnes", () => {
    expect(extractFigures("8.5 t/ha").map((f) => f.key)).toEqual([]);
  });
});

/** A fake Messages API: returns the scripted responses in order and records the requests. */
function fakeClient(responses: Array<Partial<Anthropic.Beta.BetaMessage>>) {
  const requests: Record<string, unknown>[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const next = responses.shift();
    if (!next) throw new Error("No more scripted responses");
    const body = { id: `msg_${requests.length}`, type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...next };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { client: new Anthropic({ apiKey: "test", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 }), requests };
}

const ask = (q: string): Anthropic.Beta.BetaMessageParam[] => [{ role: "user", content: q }];

describe("chat agent", () => {
  it("answers from a tool result and passes the check", async () => {
    const { client, requests } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_1", name: "get_risk", input: { risk_id: "interest_rates" } } as never] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Interest rates score 2/10: a bad year costs £11k.", citations: null } as never] },
    ]);
    const out = await runChatAgent(ask("How exposed am I to rates?"), client);
    expect(out.text).toBe("Interest rates score 2/10: a bad year costs £11k.");
    expect(out.calls.map((c) => c.name)).toEqual(["get_risk"]);
    expect(out.check).toMatchObject({ untraced: [], flagged: [], rewritten: false });
    expect(requests[0]).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default", output_config: { effort: "low" } });
  });

  it("sends back a reply with an invented figure and keeps the rewrite", async () => {
    const { client, requests } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_1", name: "get_risk", input: { risk_id: "interest_rates" } } as never] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Fixing half would save you £9k a year.", citations: null } as never] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "A bad year for rates costs £11k; ask me to simulate fixing half.", citations: null } as never] },
    ]);
    const out = await runChatAgent(ask("Should I fix my loan?"), client);
    expect(out.check).toMatchObject({ flagged: ["£9k"], untraced: [], rewritten: true });
    expect(out.text).toContain("£11k");
    const lastMessages = requests[2].messages as { role: string; content: string }[];
    expect(lastMessages.at(-1)?.content).toContain("£9k");
  });

  it("answers a refusal with a fixed message", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal", content: [] }]);
    const out = await runChatAgent(ask("..."), client);
    expect(out.text).toMatch(/can't help with that/);
  });

  it("needs an API key when no client is given", async () => {
    await expect(runChatAgent(ask("hi"))).rejects.toBeInstanceOf(ChatUnavailableError);
  });
});
