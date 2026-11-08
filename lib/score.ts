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
  // Hedged risk scale. `text` is the same hue darkened to pass 4.5:1 on paper.
  { level: "Low", color: "#7FA20E", text: "#556F06", range: "1–3" },
  { level: "Moderate", color: "#D9A800", text: "#8A6A00", range: "4–5" },
  { level: "High", color: "#D86A1E", text: "#A6500F", range: "6–7" },
  { level: "Severe", color: "#C8361C", text: "#C8361C", range: "8–10" },
];

export const THRESHOLDS = [10, 15, 25, 35, 45, 60, 75, 90, 100];

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
