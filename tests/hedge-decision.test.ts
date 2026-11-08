import { beforeEach, describe, expect, it, vi } from "vitest";
import * as demo from "@/lib/profile/fenland-ridge";
import { TraceWriter, verifyChain } from "@/lib/trace/chain";
import { hedgeDecision } from "@/lib/trace/decision";
import { createMemoryAgentStore } from "@/lib/server/agent-store";
import type { TraceEvent } from "@/lib/trace/types";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const fig = (id: string, value: number, display: string) => ({ id, label: id, value, unit: "gbp", display, formula: "", inputs: [] });
const SIM = {
  options: [{ id: "sell_forward_wheat_50", label: "Sell half the unsold 2027 wheat forward" }, { id: "buy_an_now", label: "Buy the rest of the nitrogen now" }],
  figures: Object.fromEntries(
    [
      fig("profit.p5", -62000, "−£62k"),
      fig("option.sell_forward_wheat_50.p5_gain", 30000, "£30k"),
      fig("option.sell_forward_wheat_50.cost", 2800, "£2.8k"),
      fig("option.buy_an_now.p5_gain", -6300, "−£6.3k"),
      fig("option.buy_an_now.cost", 1000, "£1k"),
      fig("option.fix_rate.p5_gain", -3300, "−£3.3k"),
      fig("option.fix_rate.cost", 900, "£900"),
      { ...fig("threshold.wheat_breakeven", 160, "£160/t"), unit: "gbp_t" },
    ].map((f) => [f.id, f])
  ),
};
const judgement = (ranks: [string, number][]) => ({
  ranked_options: ranks.map(([option_id, rank]) => ({ option_id, rank, reason: `why ${option_id}`, cites: [`option.${option_id}.p5_gain`] })),
  risks: [], conflicts: [], hold_for_human: false, hold_reason: null,
  change_my_mind: [{ threshold_id: "threshold.wheat_breakeven", statement: "Wheat below £160/t" }],
});

async function events(ranks: [string, number][] | null, decisions: object[] = []): Promise<TraceEvent[]> {
  const store = createMemoryAgentStore();
  const w = new TraceWriter("r", store);
  await w.append("engine.result", "code", { sim: SIM, observationIds: [] });
  if (ranks) {
    await w.append("checker.result", "code", { untraced: [], figures: [] });
    await w.append("judge.output", "gemini", judgement(ranks));
  }
  for (const d of decisions) await w.append("decision.farmer", "human", d);
  return store.getEvents("r");
}

describe("hedgeDecision", () => {
  it("picks the rank-1 option when it protects the bad year", async () => {
    const d = hedgeDecision(await events([["sell_forward_wheat_50", 1], ["fix_rate", 2], ["buy_an_now", 3]]))!;
    expect(d.hedge).toMatchObject({ optionId: "sell_forward_wheat_50", label: "Sell half the unsold 2027 wheat forward", reason: "why sell_forward_wheat_50" });
    expect(d.badYearBefore.display).toBe("−£62k");
    expect(d.badYearAfter).toBe("−£32k");
    expect(d.ruledOut.map((o) => [o.optionId, o.p5Gain.display])).toEqual([["fix_rate", "−£3.3k"], ["buy_an_now", "−£6.3k"]]);
    expect(d.changeMyMind).toEqual([{ thresholdId: "threshold.wheat_breakeven", statement: "Wheat below £160/t", display: "£160/t" }]);
    expect(d.farmerDecision).toBeNull();
  });
  it("skips a rank-1 option with a negative p5_gain", async () => {
    const d = hedgeDecision(await events([["buy_an_now", 1], ["sell_forward_wheat_50", 2]]))!;
    expect(d.hedge?.optionId).toBe("sell_forward_wheat_50");
    expect(d.ruledOut.map((o) => o.optionId)).toEqual(["buy_an_now"]);
  });
  it("says no hedge improves the bad year when every option makes it worse", async () => {
    const d = hedgeDecision(await events([["buy_an_now", 1], ["fix_rate", 2]]))!;
    expect(d.hedge).toBeNull();
    expect(d.badYearAfter).toBeNull();
    expect(d.ruledOut).toHaveLength(2);
  });
  it("takes the latest farmer decision", async () => {
    const d = hedgeDecision(await events([["sell_forward_wheat_50", 1]], [
      { optionId: "sell_forward_wheat_50", choice: "discuss", at: "2026-11-08T10:00:00.000Z" },
      { optionId: "sell_forward_wheat_50", choice: "not_now", at: "2026-11-08T10:05:00.000Z" },
    ]))!;
    expect(d.farmerDecision).toEqual({ optionId: "sell_forward_wheat_50", choice: "not_now", at: "2026-11-08T10:05:00.000Z" });
  });
  it("is null without a judge.output", async () => {
    expect(hedgeDecision(await events(null))).toBeNull();
  });
});

describe("recordHedgeDecision", () => {
  beforeEach(() => {
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "GEMINI_API_KEY", "AGENT_TABLES", "RISK_AGENT_DATABASE_URL"]) delete process.env[k];
    delete (globalThis as { __agentStore?: unknown }).__agentStore;
    vi.resetModules();
  });

  it("appends a human decision to a published run's chain, only for the code-picked hedge", async () => {
    const { getAgentStore } = await import("@/lib/server/agent-store");
    const { runPhaseOne } = await import("@/lib/assess/phase-one");
    const store = await getAgentStore();
    const { run } = await runPhaseOne({
      store, farmId: demo.FARM_ID, trigger: "demo", fields: demo.profileFields, market: demo.market,
      now: new Date(), jev: null, extract: null, geminiAvailable: false,
    });
    // Stand in for the judge: a clean check and a ranking of all three options.
    const prior = await store.getEvents(run.id);
    const w = TraceWriter.resume(run.id, store, prior.at(-1)!.seq, prior.at(-1)!.hash);
    await w.append("checker.result", "code", { untraced: [], figures: [] });
    await w.append("judge.output", "gemini", judgement([["buy_an_now", 1], ["sell_forward_wheat_50", 2], ["fix_rate", 3]]));
    await w.append("run.end", "code", { status: "published" });
    const hedge = hedgeDecision(await store.getEvents(run.id))?.hedge;
    expect(hedge).toBeTruthy();

    const data = await import("@/lib/data");
    await expect(data.recordHedgeDecision(run.id, hedge!.optionId, "discuss")).rejects.toThrow(/published/);
    await store.updateRun(run.id, { status: "published" });
    const wrong = ["sell_forward_wheat_50", "buy_an_now", "fix_rate"].find((id) => id !== hedge!.optionId)!;
    await expect(data.recordHedgeDecision(run.id, wrong, "discuss")).rejects.toThrow(/isn't the hedge/);
    await expect(data.recordHedgeDecision("no-such-run", hedge!.optionId, "discuss")).rejects.toThrow(/No such run/);

    await data.recordHedgeDecision(run.id, hedge!.optionId, "discuss");
    await data.recordHedgeDecision(run.id, hedge!.optionId, "not_now");
    const after = await store.getEvents(run.id);
    expect(after.slice(-2).map((e) => [e.type, e.actor])).toEqual([["decision.farmer", "human"], ["decision.farmer", "human"]]);
    expect(verifyChain(after).ok).toBe(true);
    expect(hedgeDecision(after)?.farmerDecision?.choice).toBe("not_now");
  });
});
