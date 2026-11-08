import { describe, expect, it, vi } from "vitest";
import { createTools } from "@/lib/agents/chat/tools";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
// React's cache() only exists in the Next server runtime; run the data layer without memoising.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

type Calls = Parameters<typeof createTools>[0];
async function call(name: string, input: Record<string, unknown> = {}) {
  const calls: Calls = [];
  const tool = createTools(calls).find((t) => t.name === name)!;
  const raw = await tool.run(input as never);
  expect(calls).toHaveLength(1);
  return JSON.parse(raw as string);
}

describe("chat agent tools", () => {
  it("lists the five risks in the risk profile", async () => {
    const out = await call("get_risk_profile");
    expect(out.risks.map((r: { id: string }) => r.id).sort()).toEqual(
      ["input_prices", "interest_rates", "output_prices", "regulation", "weather_yield"]
    );
    const output = out.risks.find((r: { id: string }) => r.id === "output_prices");
    expect(output).toMatchObject({ score: "10/10", bad_year_hit: "£149k", at_stake: "£793k" });
    expect(output.news_since_snapshot).toBe("−£17k");
  });

  it("gives one risk's figures as the risk page shows them", async () => {
    const out = await call("get_risk", { risk_id: "interest_rates" });
    expect(out).toMatchObject({ name: "Interest rates", bad_year_hit: "£11k", score: "2/10" });
    expect(out.mitigation_ids).toContain("rates-fix-half");
  });

  it("simulates options with the same maths as the risk page", async () => {
    const out = await call("simulate_mitigations", { risk_id: "input_prices", mitigation_ids: ["fert-buy-half", "nope"] });
    expect(out.before.bad_year_hit).toBe("£31k");
    expect(out.after.bad_year_hit).toBe("£20k");
    expect(out.unknown_ids).toEqual(["nope"]);
  });

  it("runs a what-if with untouched inputs at today's values", async () => {
    const today = await call("what_if");
    expect(today.change_vs_today).toBe("£0");
    const slump = await call("what_if", { wheat_price: 160 });
    expect(slump.scenario.wheat_price).toBe("£160/t");
    expect(slump.change_vs_today).toBe("−£52k"); // −£18/t on 2,898 t: 2026 in store plus the 2027 crop
    expect(slump.wheat_exposed_to_price).toBe("2,898 t");
  });

  it("lists the top three mitigations", async () => {
    const out = await call("get_mitigations");
    expect(out.top_three).toHaveLength(3);
    expect(out.by_risk).toHaveLength(5);
  });

  it("measures news against the snapshot", async () => {
    const out = await call("get_news", { risk_id: "regulation" });
    expect(out.items).toHaveLength(2);
    expect(out.total_effect).toBe("−£10k");
  });

  it("reports profile values with their source and the risks they feed", async () => {
    const [sales] = await call("get_profile", { section: "sales" });
    const wheat = sales.fields.find((f: { label: string }) => f.label === "2026 wheat unsold in store");
    expect(wheat).toMatchObject({ value: "1,028 t", feeds: ["Output prices"] });
  });

  it("turns a failing lookup into an error result, not a crash", async () => {
    const calls: Calls = [];
    const tool = createTools(calls).find((t) => t.name === "get_risk")!;
    const raw = await tool.run({ risk_id: "not_a_risk" } as never);
    expect(JSON.parse(raw as string)).toEqual({ error: "Unknown risk not_a_risk" });
    expect(calls).toHaveLength(1);
  });
});
