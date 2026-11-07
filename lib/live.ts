/**
 * Live market, rate and weather inputs. Each adapter returns `ok: false` and the demo
 * fallback value when its source is unreachable, so pages always render.
 * Run `bun scripts/live-check.ts` to print what every source returns right now.
 */
import * as XLSX from "xlsx";

const REVALIDATE = 3600;
const BLOB = "https://projectblue.blob.core.windows.net/media/Default/";
export const SOURCE_URLS = {
  wheat: `${BLOB}MI%20Reports/D%26A%20Arable/Daily%20and%20Weekly%20Price%20Reports/UK%20Delivered%20Cereals%20Oilseed%20Prices.xlsx`,
  fert: `${BLOB}Market%20Intelligence/GBFertiliserPriceSeries.xlsx`,
  boe: "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2026&Dateto=now&SeriesCodes=IUDBEDR,IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N",
  // Sleaford, Lincolnshire
  weather:
    "https://api.open-meteo.com/v1/forecast?latitude=53.0&longitude=-0.41&daily=soil_moisture_0_to_7cm_mean,soil_moisture_7_to_28cm_mean,precipitation_sum&past_days=7&forecast_days=7&timezone=Europe/London",
};

export interface Wheat {
  ok: boolean;
  /** ICE UK feed wheat, Thursday close, £/t, nearest delivery month. */
  price: number;
  forward: { month: string; price: number }[];
  asOf: string;
}
export interface Osr {
  ok: boolean;
  price: number;
  asOf: string;
}
export interface Fert {
  ok: boolean;
  /** AN, UK produced, £/t. */
  price: number;
  prev: number;
  asOf: string;
}
export interface Rates {
  ok: boolean;
  bankRate: number;
  prevBankRate: number;
  changedOn: string;
  sonia: number;
  asOf: string;
}
export interface Soil {
  ok: boolean;
  /** Mean volumetric soil moisture, last 7 days, m³/m³. */
  m0to7: number;
  m7to28: number;
  rain7d: number;
  asOf: string;
}
export interface Live {
  wheat: Wheat;
  osr: Osr;
  fert: Fert;
  rates: Rates;
  soil: Soil;
  fetchedAt: string;
  errors: string[];
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDate = (d: Date | string) => DATE.format(new Date(d));

type Row = (string | number | null)[];

async function sheets(url: string): Promise<Record<string, Row[]>> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE } } as RequestInit);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const wb = XLSX.read(await res.arrayBuffer(), { type: "array" });
  return Object.fromEntries(
    wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<Row>(wb.Sheets[n], { header: 1, defval: null })]),
  );
}

const asAt = (rows: Row[]): string => {
  const cell = rows.flat().find((c) => typeof c === "string" && c.startsWith("As at:")) as string | undefined;
  return cell ? cell.replace(/^As at:\s*\w+\s+/, "") : "";
};

async function wheatAndOsr(): Promise<{ wheat: Wheat; osr: Osr }> {
  const s = await sheets(SOURCE_URLS.wheat);
  const w = s.Wheat;
  const i = w.findIndex((r) => r.some((c) => typeof c === "string" && /futures/i.test(c)));
  const months = w[i + 1].map((c, k) => (typeof c === "string" && /^\w{3}-\d{2}$/.test(c) ? k : -1)).filter((k) => k >= 0);
  const forward = months.map((k) => ({ month: w[i + 1][k] as string, price: Number(w[i + 2][k]) })).filter((f) => f.price > 0);
  if (!forward.length) throw new Error("no futures row");
  const o = s.OSR;
  const ea = o.find((r) => typeof r[0] === "string" && r[0].startsWith("East Anglia"));
  return {
    wheat: { ok: true, price: forward[0].price, forward, asOf: asAt(w) },
    osr: { ok: Number(ea?.[2]) > 0, price: Number(ea?.[2]) || 0, asOf: asAt(o) },
  };
}

async function fert(): Promise<Fert> {
  const s = await sheets(SOURCE_URLS.fert);
  const t = s["HTML Table Price"];
  // Column A is empty, so SheetJS starts rows at column B: product, latest, previous week.
  const header = t.find((r) => typeof r[1] === "string" && /£\/tonne/.test(r[1]));
  const an = t.find((r) => typeof r[0] === "string" && /^AN\b.*UK produced/.test(r[0]));
  if (!an || !(Number(an[1]) > 0)) throw new Error("no AN row");
  const [d, m, y] = String(header?.[1] ?? "").split(" ")[0].split("/");
  return { ok: true, price: Number(an[1]), prev: Number(an[2]) || Number(an[1]), asOf: d ? fmtDate(`${y}-${m}-${d}`) : "" };
}

async function rates(): Promise<Rates> {
  const res = await fetch(SOURCE_URLS.boe, { next: { revalidate: REVALIDATE } } as RequestInit);
  if (!res.ok) throw new Error(`${res.status} boe`);
  const rows = (await res.text())
    .trim()
    .split("\n")
    .map((l) => l.split(","))
    .filter((r) => r.length >= 2 && /^\d{2} \w{3} \d{4}$/.test(r[0]) && r[1] !== "");
  if (!rows.length) throw new Error("no boe rows");
  const last = rows[rows.length - 1];
  const bankRate = Number(last[1]);
  const change = [...rows].reverse().find((r) => Number(r[1]) !== bankRate);
  const changedOn = change ? rows[rows.indexOf(change) + 1][0] : last[0];
  const sonia = [...rows].reverse().find((r) => r[2] && r[2] !== "")?.[2];
  return {
    ok: true,
    bankRate,
    prevBankRate: change ? Number(change[1]) : bankRate,
    changedOn: fmtDate(changedOn),
    sonia: Number(sonia) || 0,
    asOf: fmtDate(last[0]),
  };
}

async function soil(): Promise<Soil> {
  const res = await fetch(SOURCE_URLS.weather, { next: { revalidate: REVALIDATE } } as RequestInit);
  if (!res.ok) throw new Error(`${res.status} open-meteo`);
  const d = (await res.json()).daily as Record<string, (number | string | null)[]>;
  const today = new Date().toISOString().slice(0, 10);
  const past = (d.time as string[]).map((_, i) => i).filter((i) => (d.time[i] as string) < today);
  const mean = (k: string) => past.reduce((s, i) => s + Number(d[k][i] ?? 0), 0) / Math.max(1, past.length);
  return {
    ok: past.length > 0,
    m0to7: mean("soil_moisture_0_to_7cm_mean"),
    m7to28: mean("soil_moisture_7_to_28cm_mean"),
    rain7d: past.reduce((s, i) => s + Number(d.precipitation_sum[i] ?? 0), 0),
    asOf: fmtDate(d.time[past[past.length - 1]] as string),
  };
}

// Demo fallbacks: the numbers the mock pages were written around.
const FALLBACK: Omit<Live, "fetchedAt" | "errors"> = {
  wheat: { ok: false, price: 178, forward: [], asOf: "06 Nov 2026" },
  osr: { ok: false, price: 452, asOf: "06 Nov 2026" },
  fert: { ok: false, price: 504, prev: 504, asOf: "Oct 2026" },
  rates: { ok: false, bankRate: 3.75, prevBankRate: 3.75, changedOn: "", sonia: 3.73, asOf: "06 Nov 2026" },
  soil: { ok: false, m0to7: 0.4, m7to28: 0.4, rain7d: 0, asOf: "06 Nov 2026" },
};

export async function getLive(): Promise<Live> {
  const errors: string[] = [];
  const settle = async <T>(name: string, p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      return fallback;
    }
  };
  const [wo, f, r, s] = await Promise.all([
    settle("ahdb-wheat", wheatAndOsr(), { wheat: FALLBACK.wheat, osr: FALLBACK.osr }),
    settle("ahdb-fert", fert(), FALLBACK.fert),
    settle("boe", rates(), FALLBACK.rates),
    settle("open-meteo", soil(), FALLBACK.soil),
  ]);
  return { ...wo, fert: f, rates: r, soil: s, fetchedAt: new Date().toISOString(), errors };
}
