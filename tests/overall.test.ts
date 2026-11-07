import { describe, expect, it } from "vitest";
import { getOverallRisk, getProfitSummary, getRisks } from "@/lib/data";
import { overallRisk, RING_ORDER, type CategoryExposure, type OverallInput } from "@/lib/overall";
import { scoreFromPct } from "@/lib/score";
import { Z95 } from "@/lib/sim";

const NAMES = ["Wheat price", "Weather and yield", "Fertiliser price", "Scheme payments", "Interest rates"];

/** Category with a given 1-in-20 hit (£k), so its sd is hit ÷ 1.65. */
function cat(i: number, hitK: number, quality: CategoryExposure["quality"] = "confirmed"): CategoryExposure {
  return { id: RING_ORDER[i], name: NAMES[i], score: scoreFromPct((hitK / 85) * 100), sdK: hitK / Z95, quality };
}

function input(hitsK: number[], unattributedSdK = 37.07): OverallInput {
  return { expectedProfitK: 85, typicalProfitK: 85, unattributedSdK, categories: hitsK.map((h, i) => cat(i, h)) };
}

describe("overall risk: demo baseline", () => {
  it("reproduces the published whole-farm bad year and scores 6 (High)", async () => {
    const [{ overall, categories, input: inp }, profit] = await Promise.all([getOverallRisk(), getProfitSummary()]);
    expect(categories.map((c) => c.id)).toEqual(RING_ORDER);
    expect(overall.farmSdK).toBeCloseTo(79.9, 1);
    expect(Math.round(overall.badYearProfitK)).toBe(profit.badYear / 1000);
    expect(Math.round(overall.badYearProfitK)).toBe(-47);
    expect(Math.round(overall.lossPct)).toBe(55);
    expect(Math.round(overall.lossChance * 100)).toBe(Math.round(profit.lossChance * 100));
    expect(overall.score).toBe(6);
    expect(overall.level).toBe("High");
    expect(inp.unattributedSdK).toBeCloseTo(37.1, 1);
  });

  it("is provisional while demo inputs are stale or unconfirmed, worst issue first", async () => {
    const { overall } = await getOverallRisk();
    expect(overall.state).toBe("provisional");
    expect(overall.issues.map((i) => i.id)).toEqual(["fertiliser-price", "wheat-price", "weather-yield"]);
    expect(overall.issues[0].quality).toBe("stale");
  });

  it("keeps the highest category visible and different from the aggregate", async () => {
    const { overall } = await getOverallRisk();
    expect(overall.highest).toEqual({ id: "wheat-price", name: "Wheat price", score: 10 });
    expect(overall.score).not.toBe(overall.highest?.score);
  });
});

describe("overall risk: category baselines are unchanged", () => {
  it("keeps every category score and bad-year hit", async () => {
    const risks = await getRisks();
    const byId = Object.fromEntries(risks.map((r) => [r.id, [r.score, r.badYear / 1000]]));
    expect(byId).toEqual({
      "wheat-price": [10, 96],
      "weather-yield": [7, 58],
      "fertiliser-price": [4, 25],
      "scheme-payments": [3, 20],
      "interest-rates": [2, 11],
    });
  });

  it("keeps the whole-farm profit summary", async () => {
    const p = await getProfitSummary();
    expect([p.expected, p.badYear, p.goodYear, p.lossChance, p.lossYearsOf20, p.deltaWeek]).toEqual([
      85_000, -47_000, 217_000, 0.14, 3, -9_000,
    ]);
  });
});

describe("overall risk: behaviour", () => {
  const baseHits = [96, 58, 25, 20, 11];

  it("never falls when any category's exposure rises", () => {
    for (let i = 0; i < baseHits.length; i++) {
      let previous = overallRisk(input(baseHits)).score!;
      let previousLoss = overallRisk(input(baseHits)).lossPct;
      for (let hit = baseHits[i]; hit <= 400; hit += 5) {
        const hits = baseHits.map((h, j) => (j === i ? hit : h));
        const r = overallRisk(input(hits));
        expect(r.score!).toBeGreaterThanOrEqual(previous);
        expect(r.lossPct).toBeGreaterThanOrEqual(previousLoss);
        previous = r.score!;
        previousLoss = r.lossPct;
      }
    }
  });

  it("treats risks as not peaking together: less than adding the category hits", () => {
    const r = overallRisk(input(baseHits));
    const added = baseHits.reduce((s, h) => s + h, 0);
    expect(85 - r.badYearProfitK).toBeLessThan(added);
  });

  it("scores all-low exposure as Low, never zero", () => {
    const r = overallRisk(input([5, 5, 5, 5, 5]));
    expect(r.score).toBe(1);
    expect(r.level).toBe("Low");
    expect(r.state).toBe("complete");
  });

  it("scores all-high exposure as Severe", () => {
    const r = overallRisk(input([100, 100, 100, 100, 100]));
    expect(r.score).toBe(10);
    expect(r.level).toBe("Severe");
  });

  it("keeps a severe single risk conspicuous even when the others are low", () => {
    const r = overallRisk(input([170, 5, 5, 5, 5]));
    expect(r.score).toBeGreaterThanOrEqual(9);
    expect(r.level).toBe("Severe");
    expect(r.highest?.id).toBe("wheat-price");
  });

  it("marks missing data as incomplete instead of treating it as zero risk", () => {
    const inp = input(baseHits);
    inp.categories[1] = { ...inp.categories[1], score: null, sdK: null, quality: "missing" };
    const r = overallRisk(inp);
    expect(r.state).toBe("incomplete");
    expect(r.score).toBeNull();
    expect(r.level).toBeNull();
    expect(r.issues[0]).toEqual({ id: "weather-yield", name: "Weather and yield", quality: "missing" });
    // The floor uses only known categories, so it can never exceed the complete score.
    expect(r.floorScore).toBeLessThanOrEqual(overallRisk(input(baseHits)).score!);
  });

  it("marks stale or unconfirmed inputs as provisional but still scores them", () => {
    const inp = input(baseHits);
    inp.categories[2] = { ...inp.categories[2], quality: "stale" };
    const r = overallRisk(inp);
    expect(r.state).toBe("provisional");
    expect(r.score).toBe(overallRisk(input(baseHits)).score);
  });
});
