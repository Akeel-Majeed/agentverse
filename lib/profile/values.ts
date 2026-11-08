/** Show and parse profile values according to their catalogue definition. */
import { shortDate } from "../format";
import type { ProfileValue } from "../types";
import type { FieldDef } from "./catalogue";

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** "31 Mar 2027". Newer ICU writes September as "Sept"; the profile has always shown "Sep". */
export function formatDate(iso: string): string {
  return `${shortDate(iso.slice(0, 10)).replace("Sept", "Sep")} ${iso.slice(0, 4)}`;
}

export function formatValue(def: Pick<FieldDef, "type" | "unit">, value: ProfileValue): string {
  if (value === null || value === "") return "";
  if (def.type === "text") return String(value);
  if (def.type === "date") return formatDate(String(value));
  const n = Number(value);
  if (def.type === "money") return `£${fmt(n)}`;
  const unit = def.unit ?? "";
  if (unit.startsWith("£/")) return `£${fmt(n)}/${unit.slice(2)}`;
  if (unit === "%") return `${fmt(n)}%`;
  return unit ? `${fmt(n)} ${unit}` : fmt(n);
}

export type ParseResult = { ok: true; value: ProfileValue } | { ok: false; error: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Largest believable value by unit, so a slip of the keyboard (or a bad document read) is caught. */
const MAX_BY_UNIT: Record<string, number> = {
  ha: 25_000,
  "t/ha": 20,
  t: 250_000,
  "£/t": 5_000,
  "£/ha": 10_000,
  L: 5_000_000,
  people: 2_000,
  "%": 100,
};
const MAX_MONEY = 1_000_000_000;

export function maxFor(def: Pick<FieldDef, "type" | "unit" | "max">): number | undefined {
  if (def.max !== undefined) return def.max;
  if (def.type === "money") return MAX_MONEY;
  return def.unit ? MAX_BY_UNIT[def.unit] : undefined;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** A real calendar date in a sensible range, or null. */
function validDate(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso(y, m, d) : null;
}

/** UK dates: "31 Mar 2027", "31 March 2027", "31/03/2027", "31-3-27", "2027-03-31". Never US order. */
function parseDate(raw: string): string | null {
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return month ? validDate(+m[3], month, +m[1]) : null;
  }
  return null;
}

/**
 * Accepts what a farmer would type: "1,028 t", "£40k", "1.2k t", "3.1%", "31 Mar 2027", "31/03/2027".
 * Empty clears the value. Rejects anything it would have to guess at: two numbers ("12 or 13"),
 * decimal commas ("12,5"), scientific notation, negative amounts and values past a believable maximum.
 */
export function parseValue(def: Pick<FieldDef, "type" | "unit" | "label" | "max">, input: string): ParseResult {
  const raw = input.trim();
  if (raw === "") return { ok: true, value: null };
  if (def.type === "text") return { ok: true, value: raw };

  if (def.type === "date") {
    const date = parseDate(raw);
    return date ? { ok: true, value: date } : { ok: false, error: "Enter a real date like 31 Mar 2027 or 31/03/2027." };
  }

  if (/\d\s*e\s*\d/i.test(raw)) return { ok: false, error: `Enter ${def.label.toLowerCase()} as a plain number.` };
  // A comma between digits is a thousands separator only before exactly three digits.
  if (/\d,(?!\d{3}(?:\D|$))\d/.test(raw)) {
    return { ok: false, error: "Use a full stop for decimals, e.g. 12.5." };
  }
  const text = raw.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  if (numbers.length === 0) return { ok: false, error: `Enter a number for ${def.label.toLowerCase()}.` };
  if (numbers.length > 1) return { ok: false, error: `Enter one number for ${def.label.toLowerCase()}.` };
  if (/[-−]\s*£?\s*\d/.test(text)) return { ok: false, error: "Enter zero or more." };

  const match = text.match(/(\d+(?:\.\d+)?)\s*(k|m|bn)?\b/i)!;
  let n = Number.parseFloat(match[1]);
  const suffix = match[2]?.toLowerCase();
  if (suffix && def.unit !== "%" && !def.unit?.includes("/")) n *= suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1_000_000_000;
  const max = maxFor(def);
  if (def.unit === "%" && n > 100) return { ok: false, error: "Enter a percentage up to 100." };
  if (max !== undefined && n > max) {
    return { ok: false, error: `${formatValue(def, n)} is more than any farm would enter here (up to ${formatValue(def, max)}). Check the unit.` };
  }
  return { ok: true, value: n };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Form values after the server's values change (an approval saved a field, another tab saved a
 * section): fields the farmer hasn't edited take the new value, fields they're editing keep theirs.
 */
export function syncFormValues(form: Record<string, string>, before: Record<string, string>, after: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(after).map(([k, v]) => [k, form[k] === undefined || form[k] === before[k] ? v : form[k]]));
}
