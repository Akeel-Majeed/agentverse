import { describe, expect, it } from "vitest";
import { canonical, GENESIS, TraceWriter, verifyChain } from "@/lib/trace/chain";
import { createMemoryAgentStore } from "@/lib/server/agent-store";

describe("canonical JSON", () => {
  it("sorts keys at every depth", () => {
    expect(canonical({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } })).toBe('{"a":{"c":[3,{"e":2,"f":1}],"d":2},"b":1}');
  });
});

describe("trace", () => {
  it("chains hashes and verifies", async () => {
    const store = createMemoryAgentStore();
    const run = await store.createRun({ farmId: "f", trigger: "demo", asOf: "2026-11-08", seed: 42, engineVersion: "1", configHash: "c" });
    const w = new TraceWriter(run.id, store);
    await Promise.all([w.append("a", "code", { x: 1 }), w.append("b", "jev", { p: 0.9 }), w.append("c", "gemini", { y: "z" })]);
    const events = await store.getEvents(run.id);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events[0].prevHash).toBe(GENESIS);
    const v = verifyChain(events);
    expect(v.ok).toBe(true);
    expect(v.head).toBe(w.head());
  });
  it("detects an edited body", async () => {
    const store = createMemoryAgentStore();
    const run = await store.createRun({ farmId: "f", trigger: "demo", asOf: "2026-11-08", seed: 42, engineVersion: "1", configHash: "c" });
    const w = new TraceWriter(run.id, store);
    await w.append("a", "code", { x: 1 });
    await w.append("b", "code", { x: 2 });
    const events = structuredClone(await store.getEvents(run.id));
    events[0].body = '{"x":999}';
    expect(verifyChain(events)).toMatchObject({ ok: false, brokenAt: 1 });
  });
  it("detects an edited type, actor or seq", async () => {
    const store = createMemoryAgentStore();
    const run = await store.createRun({ farmId: "f", trigger: "demo", asOf: "2026-11-08", seed: 42, engineVersion: "1", configHash: "c" });
    const w = new TraceWriter(run.id, store);
    await w.append("judge.output", "gemini", { x: 1 });
    await w.append("b", "code", { x: 2 });
    const original = await store.getEvents(run.id);
    for (const edit of [{ type: "checker.result" }, { actor: "human" as const }, { seq: 7 }]) {
      const events = structuredClone(original);
      Object.assign(events[1], edit);
      expect(verifyChain(events).ok).toBe(false);
    }
  });
  it("controls default to not paused and can be paused", async () => {
    const store = createMemoryAgentStore();
    expect((await store.getControls()).paused).toBe(false);
    await store.setPaused(true, "akeel");
    expect(await store.getControls()).toMatchObject({ paused: true, updatedBy: "akeel" });
  });
});
