import { describe, expect, it } from "vitest";
import { bandFor, ringFraction, ringGeometry, scoreFromPct } from "@/lib/score";

describe("scoreFromPct bands", () => {
  it("matches the documented thresholds", () => {
    const cases: [number, number][] = [
      [0, 1], [10, 1], [10.1, 2], [15, 2], [25, 3], [35, 4], [45, 5], [55, 6], [60, 6], [75, 7], [90, 8], [100, 9], [100.1, 10], [500, 10],
    ];
    for (const [pct, score] of cases) expect(scoreFromPct(pct), `${pct}%`).toBe(score);
  });

  it("maps scores to severity bands", () => {
    expect([1, 3, 4, 5, 6, 7, 8, 10].map((s) => bandFor(s).level)).toEqual([
      "Low", "Low", "Moderate", "Moderate", "High", "High", "Severe", "Severe",
    ]);
  });
});

describe("ring render math", () => {
  it("draws nothing for zero or missing scores", () => {
    expect(ringFraction(0)).toBe(0);
    expect(ringFraction(null)).toBe(0);
    expect(ringFraction(Number.NaN)).toBe(0);
    expect(ringGeometry(0, 100, 16).fillLength).toBe(0);
    expect(ringGeometry(null, 100, 16).fillLength).toBe(0);
  });

  it("fills the whole track for a full score and clamps above it", () => {
    const full = ringGeometry(10, 100, 16);
    expect(full.fillLength).toBeCloseTo(full.trackLength, 10);
    expect(ringGeometry(14, 100, 16).fillLength).toBeCloseTo(full.trackLength, 10);
    expect(ringGeometry(-3, 100, 16).fillLength).toBe(0);
  });

  it("leaves the label gap out of the scale", () => {
    const g = ringGeometry(5, 100, 18);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 100, 10);
    expect(g.trackLength).toBeCloseTo(g.circumference * (342 / 360), 10);
    expect(g.fillLength).toBeCloseTo(g.trackLength / 2, 10);
    expect(g.rotation).toBe(-81);
  });

  it("is a full circle with no gap", () => {
    const g = ringGeometry(10, 50);
    expect(g.trackLength).toBeCloseTo(g.circumference, 10);
    expect(g.rotation).toBe(-90);
  });
});
