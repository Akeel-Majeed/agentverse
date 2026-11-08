import { describe, expect, it } from "vitest";
import { risks } from "@/lib/mock";
import { simulateExposure } from "@/lib/sim";
import { scoreFromBadYear } from "@/lib/score";
import { whatWouldChange } from "@/lib/what-would-change";

const model = (id: string) => risks.find((r) => r.id === id)!.model;

describe("what would change a risk's score", () => {
  it("solves the exposure for the next score and the next band, and the answer checks out", () => {
    const m = model("output_prices"); // £793k unsold, score 10
    const points = whatWouldChange(m, 85_000);
    expect(points[0].text).toMatch(/^Score falls to 9 \(Severe\) if crop value unsold comes down by £\d+k, to £(\d+)k\.$/);
    const to7 = points.find((p) => p.text.startsWith("Score falls to 7"))!;
    const target = Number(to7.text.match(/, to £(\d+)k/)![1]);
    // Re-score at the target exposure: it lands in the promised band.
    expect(scoreFromBadYear(simulateExposure(m, target, m.meanK).hitK * 1000, 85_000)).toBe(7);
    expect(scoreFromBadYear(simulateExposure(m, target + 2, m.meanK).hitK * 1000, 85_000)).toBe(8);
  });

  it("says what would make it worse", () => {
    const points = whatWouldChange(model("interest_rates"), 85_000); // score 2
    expect(points.some((p) => p.direction === "worse" && /Score rises to 3/.test(p.text))).toBe(true);
  });

  it("solves the exposure that brings the farm back inside the loss limit", () => {
    const m = model("output_prices");
    const p = whatWouldChange(m, 85_000, 60_000).find((x) => /loss limit/.test(x.text))!;
    const target = Number(p.text.match(/, to £(\d+)k/)![1]);
    expect(-simulateExposure(m, target, m.meanK).badYearProfitK).toBeLessThanOrEqual(60.5);
    expect(-simulateExposure(m, target + 5, m.meanK).badYearProfitK).toBeGreaterThan(60);
  });

  it("says when cutting one risk can't fix the farm's loss on its own", () => {
    const m = { ...model("interest_rates"), otherSdK: 200 };
    expect(whatWouldChange(m, 85_000, 60_000).some((p) => /can't bring the farm back inside/.test(p.text))).toBe(true);
  });
});
