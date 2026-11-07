export type RiskLevel = "Low" | "Moderate" | "High" | "Severe";

export interface Band {
  level: RiskLevel;
  /** Fill colour for rings, dots and bars. */
  color: string;
  /** Text colour with ≥ 4.5:1 contrast on white. */
  text: string;
  range: string;
}

export const BANDS: Band[] = [
  { level: "Low", color: "#16A34A", text: "#15803D", range: "1–3" },
  { level: "Moderate", color: "#D97706", text: "#B45309", range: "4–5" },
  { level: "High", color: "#EA580C", text: "#C2410C", range: "6–7" },
  { level: "Severe", color: "#DC2626", text: "#B91C1C", range: "8–10" },
];

const THRESHOLDS = [10, 15, 25, 35, 45, 60, 75, 90, 100];

/** Score 1–10 from the bad-year hit as a % of typical profit. */
export function scoreFromPct(pct: number): number {
  const idx = THRESHOLDS.findIndex((t) => pct <= t);
  return idx === -1 ? 10 : idx + 1;
}

export function scoreFromBadYear(badYear: number, typicalProfit: number): number {
  return scoreFromPct((badYear / typicalProfit) * 100);
}

export function bandFor(score: number): Band {
  if (score <= 3) return BANDS[0];
  if (score <= 5) return BANDS[1];
  if (score <= 7) return BANDS[2];
  return BANDS[3];
}

export const SCORE_MAX = 10;

/** Share of a ring to fill for a score: 0 for missing or ≤ 0, 1 for ≥ 10. */
export function ringFraction(score: number | null): number {
  if (score === null || !Number.isFinite(score)) return 0;
  return Math.min(Math.max(score / SCORE_MAX, 0), 1);
}

export interface RingGeometry {
  circumference: number;
  /** Length of the drawable track once the label gap is removed. */
  trackLength: number;
  /** Length of the filled arc. */
  fillLength: number;
  /** Degrees to rotate an SVG circle (which starts at 3 o'clock) so the arc starts just after the gap at 12 o'clock. */
  rotation: number;
}

/**
 * Geometry for a progress ring drawn with stroke-dasharray. `gapDeg` leaves a gap at 12 o'clock for a
 * ring label; the full scale is the remaining track, so a 10 fills the whole track and a 0 draws nothing.
 */
export function ringGeometry(score: number | null, radius: number, gapDeg = 0): RingGeometry {
  const circumference = 2 * Math.PI * radius;
  const trackLength = circumference * (1 - gapDeg / 360);
  return {
    circumference,
    trackLength,
    fillLength: trackLength * ringFraction(score),
    rotation: -90 + gapDeg / 2,
  };
}
