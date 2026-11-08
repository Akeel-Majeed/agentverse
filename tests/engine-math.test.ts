import { describe, expect, it } from "vitest";
import { mulberry32, normalSampler, tScale } from "@/lib/engine/rng";
import { cholesky, mean, sd, shrunkCorrelation } from "@/lib/engine/linalg";
import { christoffersen, kupiec, pinball, quantile, wilson } from "@/lib/engine/stats";

describe("rng", () => {
  it("is reproducible from the seed", () => {
    const a = mulberry32(7), b = mulberry32(7);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });
  it("gives standard normals", () => {
    const n = normalSampler(mulberry32(1));
    const xs = Array.from({ length: 100_000 }, n);
    expect(Math.abs(mean(xs))).toBeLessThan(0.01);
    expect(Math.abs(sd(xs) - 1)).toBeLessThan(0.02);
  });
  it("t draws have unit variance and fat tails", () => {
    const n = normalSampler(mulberry32(2));
    const xs = Array.from({ length: 200_000 }, () => n() * tScale(n, 5));
    expect(Math.abs(sd(xs) - 1)).toBeLessThan(0.05);
    const m = mean(xs);
    const kurt = mean(xs.map((x) => (x - m) ** 4)) / sd(xs) ** 4;
    expect(kurt).toBeGreaterThan(4);
  });
});

describe("linalg", () => {
  it("cholesky reproduces the matrix", () => {
    const a = [[4, 2], [2, 3]];
    const l = cholesky(a);
    expect(l[0][0] * l[0][0]).toBeCloseTo(4);
    expect(l[1][0] * l[0][0]).toBeCloseTo(2);
    expect(l[1][0] ** 2 + l[1][1] ** 2).toBeCloseTo(3);
  });
  it("shrunk correlation is a valid correlation matrix even with few rows", () => {
    const r = normalSampler(mulberry32(3));
    const rows = Array.from({ length: 12 }, () => Array.from({ length: 9 }, r));
    const { corr, intensity } = shrunkCorrelation(rows);
    corr.forEach((row, i) => expect(row[i]).toBeCloseTo(1));
    expect(corr[0][1]).toBeCloseTo(corr[1][0]);
    expect(intensity).toBeGreaterThan(0);
    expect(() => cholesky(corr)).not.toThrow();
  });
  it("keeps a strong real correlation", () => {
    const r = normalSampler(mulberry32(4));
    const rows = Array.from({ length: 200 }, () => { const x = r(); return [x, x + 0.1 * r()]; });
    expect(shrunkCorrelation(rows).corr[0][1]).toBeGreaterThan(0.9);
  });
});

describe("stats", () => {
  it("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.05)).toBeCloseTo(0.5);
  });
  it("wilson matches published values", () => {
    const [lo, hi] = wilson(0, 10);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(0.2775, 3);
    const [lo1, hi1] = wilson(1, 10);
    expect(lo1).toBeCloseTo(0.0179, 3);
    expect(hi1).toBeCloseTo(0.4042, 3);
  });
  it("kupiec matches hand calculation at n=10", () => {
    expect(kupiec(0, 10, 0.05)).toBeCloseTo(0.31, 2);
    expect(kupiec(1, 10, 0.05)).toBeCloseTo(0.52, 2);
    expect(kupiec(3, 10, 0.05)).toBeCloseTo(0.011, 2);
  });
  it("christoffersen flags clustered breaches", () => {
    const clustered = Array.from({ length: 100 }, (_, i) => i >= 40 && i < 50);
    const spread = Array.from({ length: 100 }, (_, i) => i % 10 === 0);
    expect(christoffersen(clustered)).toBeLessThan(0.01);
    expect(christoffersen(spread)).toBeGreaterThan(0.1);
  });
  it("pinball loss", () => {
    expect(pinball(10, 0.05, 12)).toBeCloseTo(0.95 * 2);
    expect(pinball(10, 0.95, 8)).toBeCloseTo(0.95 * 2);
  });
});
