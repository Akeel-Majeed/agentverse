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

/*
 * Strict mode, for the risk judge: fails closed.
 * Every digit in the prose must belong to a figure some source wrote the same way (same unit, same
 * number text, so "£17,000" does not match "£17k" and "31 per cent" does not match "31.0%"), a
 * harmless token (years 2019–2030, crop years like 2026/27, the "1-in-20" label, P5/P95/CVaR5, or
 * an id the caller passes as known, e.g. figure ids and catalogue keys), or it is untraced. Text is
 * NFKC-normalised first (full-width "２００" reads as "200") and the residual sweep catches any
 * Unicode digit (\p{Nd}) left over. Signs count: "+£17k" or "−£17k" must match the
 * source's sign, and an unsigned figure that only exists as a negative cannot sit after a word like
 * "gains" or "protects".
 * ponytail: spelled-out numbers ("one in four") are not parsed; the prompt forbids them, add a
 * word-number pass if a live run ever uses one. The gain-word test looks 40 characters back only.
 */
const SIGN = String.raw`(?:(?<![\w.])([−+-]|minus\s+))?`;
const NUM = String.raw`(?<![\w.])(\d[\d,]*(?:\.\d+)?)`;
const MULT = String.raw`\s?(k|m|bn)?`;

type StrictPattern = { kind: string | null; re: RegExp };
const STRICT: StrictPattern[] = [
  { kind: null, re: /\b1[\s-]in[\s-]20\b/gi },
  { kind: "gbp", re: new RegExp(String.raw`${SIGN}(?:£|GBP\s?)\s?${NUM}${MULT}\b(\/(?:t|ha|yr|year|L))?`, "gi") },
  { kind: "gbp", re: new RegExp(String.raw`${SIGN}${NUM}${MULT}\s?(?:pounds?|GBP)\b`, "gi") },
  { kind: "pct", re: new RegExp(String.raw`${SIGN}${NUM}\s?(?:%|per\s?cent\b|percent\b)`, "gi") },
  { kind: "in20", re: /\b(\d{1,2})\s+in\s+20\b/gi },
  { kind: "score", re: /(?<![\w.])(\d{1,2})\s?\/\s?10\b/g },
  { kind: "t", re: new RegExp(String.raw`${SIGN}${NUM}\s?(?:t|tonnes?)\b(?!\/)`, "gi") },
  { kind: "ha", re: new RegExp(String.raw`${SIGN}${NUM}\s?(?:ha|hectares?)\b`, "gi") },
  { kind: null, re: /\b(?:2019|202\d|2030)\s?[/–-]\s?\d{2}\b/g },
  { kind: null, re: /\b(?:2019|202\d|2030)\b/g },
  { kind: "num", re: new RegExp(String.raw`${SIGN}${NUM}${MULT}(?!\w)`, "g") },
  { kind: null, re: /(?<![\w.])(?:p|cvar)\d{1,2}(?!\w)/gi },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface StrictFigure { text: string; key: string; sign: -1 | 0 | 1; at: number }

function strictFigures(text: string, ids: string[] = []): { figures: StrictFigure[]; residual: string[] } {
  let rest = text;
  const figures: StrictFigure[] = [];
  // Known ids (longest first) are whole tokens; any other dotted token with a digit stays residual.
  const idPattern: StrictPattern[] = ids.length
    ? [{ kind: null, re: new RegExp(`(?<![\\w.])(?:${[...ids].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?![\\w])`, "g") }]
    : [];
  for (const p of [...idPattern, ...STRICT]) {
    for (const m of Array.from(rest.matchAll(p.re))) {
      rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index! + m[0].length);
      if (!p.kind) continue;
      // Groups: in20/score have only the number; the others are (sign, number, multiplier?, per-unit?).
      const [sign, n, mult, per] = p.kind === "in20" || p.kind === "score" ? [undefined, m[1]] : [m[1], m[2], m[3], m[4]];
      const kind = p.kind === "gbp" && per ? `gbp${per.toLowerCase()}` : p.kind;
      figures.push({
        text: m[0].trim(),
        key: `${kind}:${n.replace(/,/g, "")}${(mult ?? "").toLowerCase()}`,
        sign: !sign ? 0 : sign === "+" ? 1 : -1,
        at: m.index!,
      });
    }
  }
  const residual = Array.from(rest.matchAll(new RegExp(String.raw`\S*\p{Nd}\S*`, "gu"))).map((m) => text.slice(m.index, m.index! + m[0].length));
  return { figures, residual };
}

const GAIN_WORD = /\b(gain\w*|sav(e|es|ed|ing|ings)|protect\w*|improv\w*|benefit\w*|boost\w*|adds?)\b/i;
const zero = (key: string) => /:0(\.0+)?$/.test(key);

/** `ids`: tokens that are names, not numbers (figure ids, catalogue keys); only these may carry digits. */
export function checkFiguresStrict(text: string, sources: string[], ids: string[] = []): CheckResult {
  const reply = text.normalize("NFKC");
  /** key → signs the sources wrote it with (an unsigned source figure counts as positive). */
  const known = new Map<string, Set<number>>();
  const add = (key: string, sign: number) => {
    if (!known.has(key)) known.set(key, new Set());
    known.get(key)!.add(sign === -1 ? -1 : 1);
  };
  for (const s of sources) {
    for (const f of strictFigures(s.normalize("NFKC")).figures) {
      add(f.key, f.sign);
      // A bare number ("200" as a conflict's document value) traces to the same number text in any unit.
      add(`num:${f.key.slice(f.key.indexOf(":") + 1)}`, f.sign);
    }
  }
  const { figures, residual } = strictFigures(reply, ids);
  const traced = (f: StrictFigure) => {
    if (zero(f.key)) return true;
    const signs = known.get(f.key);
    if (!signs) return false;
    if (f.sign !== 0) return signs.has(f.sign);
    if (signs.has(1)) return true;
    const before = reply.slice(Math.max(0, f.at - 40), f.at).split(/[.;:\n]/).pop() ?? "";
    return !GAIN_WORD.test(before);
  };
  const untraced = Array.from(new Set([...figures.filter((f) => !traced(f)).map((f) => f.text), ...residual]));
  return { figures: figures.map((f) => f.text), untraced };
}
