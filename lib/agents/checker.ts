/**
 * Blocks untraceable numbers: every figure in an agent's reply must appear in a tool result
 * (computed by code) or in what the person said. Deterministic, no model call.
 */

export interface Figure {
  /** As written in the text, e.g. "−£17k". */
  text: string;
  /** Kind plus absolute value, e.g. "gbp:17000", "pct:11.4". */
  key: string;
  /** −1 or +1 when the text says which way the figure goes ("−£17k", "fell £17k", "+£2k"); 0 if it doesn't. */
  sign: -1 | 0 | 1;
}

const PATTERNS: { kind: string; re: RegExp; value: (m: RegExpMatchArray) => number; signed?: boolean }[] = [
  {
    // £149k, £1,028, −£17.4k, £0.6k, £2m, £185/t
    kind: "gbp",
    re: /[−+-]?£\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn)?\b(\/(?:t|ha|yr|year|L))?/gi,
    value: (m) => Number(m[1].replace(/,/g, "")) * mult(m[2]),
    signed: true,
  },
  {
    // A money figure without the £ sign: "840k", "1.2m". Counted as £ so it must match a £ figure.
    kind: "gbp",
    re: /(?<![£\d.,])[−+-]?\b(\d[\d,]*(?:\.\d+)?)(k|m|bn)\b/g,
    value: (m) => Number(m[1].replace(/,/g, "")) * mult(m[2]),
    signed: true,
  },
  { kind: "pct", re: /[−+-]?(\d+(?:\.\d+)?)\s?%/g, value: (m) => Number(m[1]), signed: true },
  { kind: "in20", re: /\b(\d{1,2})\s+in\s+20\b/gi, value: (m) => Number(m[1]) },
  { kind: "score", re: /\b(\d{1,2})\s?\/\s?10\b/g, value: (m) => Number(m[1]) },
  { kind: "t", re: /\b(\d[\d,]*(?:\.\d+)?)\s?(?:t|tonnes?)\b(?!\/)/gi, value: (m) => Number(m[1].replace(/,/g, "")) },
  { kind: "ha", re: /\b(\d[\d,]*(?:\.\d+)?)\s?(?:ha|hectares?)\b/gi, value: (m) => Number(m[1].replace(/,/g, "")) },
  { kind: "ppl", re: /\b(\d+(?:\.\d+)?)\s?p\s?\/\s?L\b/g, value: (m) => Number(m[1]) },
  { kind: "litres", re: /\b(\d[\d,]*(?:\.\d+)?)\s?(?:L\b|litres?\b|liters?\b)/g, value: (m) => Number(m[1].replace(/,/g, "")) },
  { kind: "points", re: /[−+-]?\b(\d+(?:\.\d+)?)\s?(?:percentage\s)?points?\b/gi, value: (m) => Number(m[1]), signed: true },
];

function mult(suffix: string | undefined): number {
  return { k: 1e3, m: 1e6, bn: 1e9 }[(suffix ?? "").toLowerCase() as "k" | "m" | "bn"] ?? 1;
}

/** Numbers written out in words ("a hundred and fifty thousand pounds") can't be traced: always flagged. */
const WORDED = new RegExp(
  "\\b(?:(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|and)[\\s-]+)*" +
    "(?:hundred|thousand|million|billion)\\s+(?:pounds|quid|tonnes|hectares|litres)\\b|\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)[\\s-]+(?:per\\s?cent|percent)\\b",
  "gi"
);

const UP = /\b(?:rose|risen|rises|rising|increased?|increases|higher|gained?|gains|jumped|climbed|went up|goes up|is up|are up|was up|adds?)\s*(?:by\s*|to\s*|about\s*|around\s*)?$/i;
const DOWN = /\b(?:fell|fallen|falls|falling|dropped|drops|decreased?|decreases|lower|lost|cuts?|cutting|went down|goes down|is down|are down|was down|reduced?|reduces|takes? off)\s*(?:by\s*|to\s*|about\s*|around\s*)?$/i;

/** Which way a figure goes: a written sign, or a direction word just before it. */
function signOf(text: string, m: RegExpMatchArray): -1 | 0 | 1 {
  const written = m[0].trim()[0];
  if (written === "−" || written === "-") return -1;
  if (written === "+") return 1;
  const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index);
  if (DOWN.test(before)) return -1;
  if (UP.test(before)) return 1;
  return 0;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function extractFigures(text: string): Figure[] {
  const out: Figure[] = [];
  for (const p of PATTERNS) {
    for (const m of Array.from(text.matchAll(p.re))) {
      const unit = p.kind === "gbp" && m[3] ? `gbp${m[3].toLowerCase()}` : p.kind;
      out.push({ text: m[0].trim(), key: `${unit}:${round(Math.abs(p.value(m)))}`, sign: p.signed ? signOf(text, m) : 0 });
    }
  }
  for (const m of Array.from(text.matchAll(WORDED))) out.push({ text: m[0].trim(), key: `words:${m[0].toLowerCase()}`, sign: 0 });
  return out;
}

export interface CheckResult {
  figures: string[];
  /** Figures in the reply that no source contains, or that a source says go the other way. */
  untraced: string[];
}

/** Zero is never worth blocking ("£0", "0 t"). */
const trivial = (f: Figure) => f.key.endsWith(":0");

/**
 * Every figure in `reply` must appear in a source with the same unit and size. If the reply says
 * which way it goes ("fell £17k", "+£2k") and every source that has it says the opposite, it is
 * flagged too: the right number pointing the wrong way is still wrong.
 */
export function checkFigures(reply: string, sources: string[]): CheckResult {
  const known = new Map<string, Set<number>>();
  for (const f of sources.flatMap((s) => extractFigures(s))) {
    if (!known.has(f.key)) known.set(f.key, new Set());
    known.get(f.key)!.add(f.sign);
  }
  const figures = extractFigures(reply);
  const bad = figures.filter((f) => {
    if (trivial(f)) return false;
    const signs = known.get(f.key);
    if (!signs) return true;
    return f.sign !== 0 && !signs.has(0) && !signs.has(f.sign);
  });
  return { figures: figures.map((f) => f.text), untraced: Array.from(new Set(bad.map((f) => f.text))) };
}
