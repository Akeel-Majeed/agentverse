import { describe, expect, it } from "vitest";
import { FACTORS } from "@/lib/engine/types";
import { loadHistory } from "@/lib/engine/history";

describe("committed history", () => {
  const h = loadHistory();
  it("has every factor with provenance", () => {
    for (const f of FACTORS) {
      expect(h[f].points.length).toBeGreaterThan(10);
      expect(h[f].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(h[f].url).toMatch(/^https:\/\//);
      expect(h[f].licence).toBeTruthy();
    }
  });
  it("monthly price series start by 2014-01 and are sorted", () => {
    for (const f of ["wheat", "barley", "osr", "an", "fuel"] as const) {
      expect(h[f].points[0].date <= "2014-01-01").toBe(true);
      const dates = h[f].points.map((p) => p.date);
      expect([...dates].sort()).toEqual(dates);
    }
  });
  it("yields are annual from 1999 and plausible", () => {
    expect(h.yield_wheat.points[0].date).toBe("1999");
    for (const p of h.yield_wheat.points) expect(p.value).toBeGreaterThan(5);
    for (const p of h.yield_osr.points) expect(p.value).toBeGreaterThan(1.5);
  });
  it("bank rate is monthly in percent", () => {
    for (const p of h.bank_rate.points) expect(p.value).toBeGreaterThanOrEqual(0);
    expect(h.bank_rate.points.length).toBeGreaterThan(150);
  });
});
