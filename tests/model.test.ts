import { describe, expect, it } from "vitest";
import { getRisk, getRisks, getWhatIfConfig } from "@/lib/data";
import { exposureRemoved, simulateRisk, whatIf } from "@/lib/sim";
import { scoreFromBadYear } from "@/lib/score";

describe("wheat price risk page baseline", () => {
  it("keeps exposure, swings and bad years", async () => {
    const wheat = (await getRisk("wheat-price"))!;
    expect(wheat.model.exposure).toBe(2898);
    expect(wheat.model.unitSd).toBe(20);
    expect(wheat.model.otherSdK).toBe(55);
    const sim = simulateRisk(wheat.model);
    expect(sim.sdK).toBeCloseTo(79.9, 1);
    expect(Math.round(sim.hitK)).toBe(96);
    expect(Math.round(sim.badYearProfitK)).toBe(-47);
    expect(sim.lossYears).toBe(3);
  });

  it("min-price option takes the score from 10 to 8 and the hit to £65k", async () => {
    const wheat = (await getRisk("wheat-price"))!;
    const option = wheat.mitigations.find((m) => m.id === "wheat-minprice-half-2027")!;
    const sim = simulateRisk(wheat.model, [option]);
    expect(Math.round(sim.hitK)).toBe(65);
    expect(scoreFromBadYear(sim.hitK * 1000, 85_000)).toBe(8);
    expect(option.scoreAfter).toBe(8);
  });

  it("every risk page reconciles to the same whole-farm swing", async () => {
    for (const risk of await getRisks()) expect(simulateRisk(risk.model).sdK).toBeCloseTo(79.9, 1);
  });

  it("selecting every option never removes more exposure than exists", async () => {
    for (const risk of await getRisks()) {
      const removed = risk.mitigations.reduce((s, m) => s + exposureRemoved(m), 0);
      expect(removed, risk.id).toBeLessThanOrEqual(risk.model.exposure);
    }
  });
});

describe("what-if baseline", () => {
  it("returns £85k at today's inputs with a loss price of £133/t", async () => {
    const { baseline } = await getWhatIfConfig();
    const r = whatIf(baseline);
    expect(Math.round(r.profitK)).toBe(85);
    expect(Math.round(r.lossPrice)).toBe(133);
  });

  it("wheat price slump preset gives £33k, −£52k", async () => {
    const { presets } = await getWhatIfConfig();
    const slump = presets.find((p) => p.id === "wheat-slump")!;
    expect(slump.inputs.wheatPrice).toBe(150);
    const r = whatIf(slump.inputs);
    expect(Math.round(r.profitK)).toBe(33);
    expect(Math.round(r.deltaK)).toBe(-52);
  });
});
