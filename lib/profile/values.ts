/** Show and parse profile values according to their catalogue definition. */
import type { ProfileValue } from "../types";
import type { FieldDef } from "./catalogue";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
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

/** Accepts what a farmer would type: "1,028 t", "£40k", "3.1%", "31 Mar 2027". Empty clears the value. */
export function parseValue(def: Pick<FieldDef, "type" | "unit" | "label">, input: string): ParseResult {
  const raw = input.trim();
  if (raw === "") return { ok: true, value: null };
  if (def.type === "text") return { ok: true, value: raw };

  if (def.type === "date") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: true, value: raw };
    const t = Date.parse(`${raw} 12:00 UTC`);
    if (Number.isNaN(t)) return { ok: false, error: `Enter a date like 31 Mar 2027.` };
    return { ok: true, value: new Date(t).toISOString().slice(0, 10) };
  }

  const match = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?\s*([km])?\b/i);
  if (!match) return { ok: false, error: `Enter a number for ${def.label.toLowerCase()}.` };
  let n = Number.parseFloat(match[0]);
  const suffix = match[2]?.toLowerCase();
  if (def.type === "money" && suffix === "k") n *= 1_000;
  if (def.type === "money" && suffix === "m") n *= 1_000_000;
  if (n < 0) return { ok: false, error: "Enter zero or more." };
  if (def.unit === "%" && n > 100) return { ok: false, error: "Enter a percentage up to 100." };
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
