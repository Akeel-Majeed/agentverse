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
