import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MEMORY_MAX_CHARS, memoryBlock, updateMemory } from "@/lib/agents/chat/memory";

/** A fake Messages API that returns one scripted response and records the request. */
function fakeClient(response: Partial<Anthropic.Message>) {
  const requests: Record<string, unknown>[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const body = { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...response };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { client: new Anthropic({ apiKey: "test", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 }), requests };
}

const exchange = { question: "Should I fix my loan?", answer: "A bad year for rates costs £11k.", at: "2026-11-07T20:00:00Z" };

describe("chat memory", () => {
  it("folds the newest exchange into the notes", async () => {
    const { client, requests } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "- 7 Nov: asked about fixing the loan\n", citations: null }] });
    const notes = await updateMemory("- 6 Nov: said hello", exchange, client);
    expect(notes).toBe("- 7 Nov: asked about fixing the loan");
    const prompt = (requests[0].messages as { content: string }[])[0].content;
    expect(prompt).toContain("- 6 Nov: said hello");
    expect(prompt).toContain("7 Nov 2026");
    expect(prompt).toContain("Should I fix my loan?");
    expect(String(requests[0].system)).toMatch(/No figures from the assistant/);
  });

  it("keeps the old notes on a refusal or an empty reply", async () => {
    const refusal = fakeClient({ stop_reason: "refusal", content: [] });
    expect(await updateMemory("- old", exchange, refusal.client)).toBe("- old");
    const empty = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "  ", citations: null }] });
    expect(await updateMemory(null, exchange, empty.client)).toBe("");
  });

  it("caps the notes at a whole line", async () => {
    const long = Array.from({ length: 100 }, (_, i) => `- line ${i} ${"x".repeat(40)}`).join("\n");
    const { client } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: long, citations: null }] });
    const notes = await updateMemory(null, exchange, client);
    expect(notes.length).toBeLessThanOrEqual(MEMORY_MAX_CHARS);
    expect(notes.split("\n").every((l) => /^- line \d+ x{40}$/.test(l))).toBe(true);
  });

  it("labels the notes as context, not a source", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    expect(memoryBlock(null, now)).toBe("Today is 7 Nov 2026. This is the first conversation with the farmer, or there are no notes on earlier ones.");
    const block = memoryBlock({ notes: "- asked about rates", updatedAt: "2026-11-06T09:00:00Z" }, now);
    expect(block).toContain("last updated 6 Nov 2026");
    expect(block).toContain("not a source for any figure");
    expect(block.endsWith("- asked about rates")).toBe(true);
  });
});
