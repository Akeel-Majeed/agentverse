/**
 * Blocks untraceable numbers: every figure in an agent's reply must appear in a tool result
 * (computed by code) or in what the person said. Deterministic, no model call.
 */

export interface Figure {
  /** As written in the text, e.g. "−£17k". */
  text: string;
  /** Kind plus absolute value, e.g. "gbp:17000", "pct:11.4". */
  key: string;
}

const PATTERNS: { kind: string; re: RegExp; value: (m: RegExpMatchArray) => number }[] = [
  {
    // £149k, £1,028, −£17.4k, £0.6k, £2m, £185/t
    kind: "gbp",
    re: /[−-]?£\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn)?\b(\/(?:t|ha|yr|year|L))?/gi,
    value: (m) => {
      const n = Number(m[1].replace(/,/g, ""));
      const mult = { k: 1e3, m: 1e6, bn: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "bn"] ?? 1;
      return n * mult;
    },
  },
  { kind: "pct", re: /(\d+(?:\.\d+)?)\s?%/g, value: (m) => Number(m[1]) },
  { kind: "in20", re: /\b(\d{1,2})\s+in\s+20\b/gi, value: (m) => Number(m[1]) },
  { kind: "score", re: /\b(\d{1,2})\s?\/\s?10\b/g, value: (m) => Number(m[1]) },
  { kind: "t", re: /\b(\d[\d,]*(?:\.\d+)?)\s?(?:t|tonnes?)\b(?!\/)/gi, value: (m) => Number(m[1].replace(/,/g, "")) },
  { kind: "ha", re: /\b(\d[\d,]*(?:\.\d+)?)\s?(?:ha|hectares?)\b/gi, value: (m) => Number(m[1].replace(/,/g, "")) },
];

const round = (n: number) => Math.round(n * 100) / 100;

export function extractFigures(text: string): Figure[] {
  const out: Figure[] = [];
  for (const p of PATTERNS) {
    for (const m of Array.from(text.matchAll(p.re))) {
      const unit = p.kind === "gbp" && m[3] ? `gbp${m[3].toLowerCase()}` : p.kind;
      out.push({ text: m[0].trim(), key: `${unit}:${round(Math.abs(p.value(m)))}` });
    }
  }
  return out;
}

export interface CheckResult {
  figures: string[];
  /** Figures in the reply that no source contains. */
  untraced: string[];
}

/** Zero is never worth blocking ("£0", "0 t"). */
const trivial = (f: Figure) => f.key.endsWith(":0");

export function checkFigures(reply: string, sources: string[]): CheckResult {
  const known = new Set(sources.flatMap((s) => extractFigures(s).map((f) => f.key)));
  const figures = extractFigures(reply);
  const untraced = Array.from(new Set(figures.filter((f) => !trivial(f) && !known.has(f.key)).map((f) => f.text)));
  return { figures: figures.map((f) => f.text), untraced };
}
