import { gbpK, gbpPerT } from "../format";
import type { Figure, FigureUnit } from "./types";

export function display(value: number, unit: FigureUnit): string {
  switch (unit) {
    case "gbp": return gbpK(value / 1000);
    case "gbp_t": return gbpPerT(value);
    case "pct": return `${value.toFixed(1)}%`;
    case "prob": return `${(value * 100).toFixed(1)}%`;
    case "ratio": return value.toFixed(2);
    case "score": return `${Math.round(value)}/10`;
  }
}

export function figure(id: string, label: string, value: number, unit: FigureUnit, formula: string, inputs: string[]): Figure {
  return { id, label, value, unit, display: display(value, unit), formula, inputs };
}
