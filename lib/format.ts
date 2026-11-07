const MINUS = "−";

/** £96k, −£47k. Input in £k. */
export function gbpK(valueK: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? (Math.abs(valueK) < 10 && valueK % 1 !== 0 ? 1 : 0);
  const rounded = Number(Math.abs(valueK).toFixed(decimals));
  const body = `£${rounded.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}k`;
  if (rounded === 0) return opts.sign ? `£0` : "£0";
  if (valueK < 0) return `${MINUS}${body}`;
  return opts.sign ? `+${body}` : body;
}

/** Input in whole £. */
export function gbp(value: number, opts: { sign?: boolean } = {}): string {
  return gbpK(value / 1000, opts);
}

export function gbpPerT(value: number, opts: { sign?: boolean } = {}): string {
  const rounded = Math.round(Math.abs(value));
  const body = `£${rounded.toLocaleString("en-GB")}/t`;
  if (rounded === 0) return body;
  if (value < 0) return `${MINUS}${body}`;
  return opts.sign ? `+${body}` : body;
}

export function signed(value: number, decimals = 0, suffix = ""): string {
  const rounded = Number(Math.abs(value).toFixed(decimals));
  const body = `${rounded.toLocaleString("en-GB", { minimumFractionDigits: decimals })}${suffix}`;
  if (rounded === 0) return body;
  return value < 0 ? `${MINUS}${body}` : `+${body}`;
}

export function num(value: number, decimals = 0): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function amount(value: number, unit: "t" | "ha" | "£k"): string {
  if (unit === "£k") return gbpK(value);
  return `${num(Math.round(value))} ${unit}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function shortDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

export function longDate(iso: string): string {
  return LONG_FMT.format(new Date(iso)).replace(",", "");
}

export function trendTone(value: number): "good" | "bad" | "neutral" {
  if (Math.round(value) === 0) return "neutral";
  return value > 0 ? "bad" : "good";
}
