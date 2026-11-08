/**
 * Downloads the real history the engine is fitted on, hashes each raw file, and writes
 * data/history.json. Run: bun run history:load. Sources are OGL v3 (Defra) and BoE.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import type { FactorId, History, Series, SeriesPoint } from "../lib/engine/types";

const OGL = "Open Government Licence v3.0";
const sha = (b: ArrayBuffer) => createHash("sha256").update(Buffer.from(b)).digest("hex");
const now = new Date().toISOString();

async function get(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { headers: { "user-agent": "farm-risk-agent/1.0 (hackathon)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
}

async function defraPriceIndex(): Promise<Pick<History, "wheat" | "barley" | "osr" | "an" | "fuel">> {
  const meta = (await (await fetch("https://www.gov.uk/api/content/government/statistics/agricultural-price-indices")).json()) as {
    details: { attachments: { title: string; url: string }[] };
  };
  const att = meta.details.attachments.find((a) => a.title.includes("2020 =100") && a.title.includes("CSV"));
  if (!att) throw new Error("Defra API CSV attachment not found");
  const raw = await get(att.url);
  const rows = new TextDecoder().decode(raw).trim().split("\n").slice(1).map((l) => l.split(","));
  const pick = (id: FactorId, category: string, label: string): Series => ({
    id,
    label,
    unit: "index (2020=100)",
    frequency: "monthly",
    source: `Defra Agricultural Price Index, ${category}`,
    url: att.url,
    licence: OGL,
    fetchedAt: now,
    sha256: sha(raw),
    points: rows
      .filter((r) => r[1] === category)
      .map((r) => ({ date: r[2], value: Number(r[3]) }))
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
  return {
    wheat: pick("wheat", "wheat_feeding", "Feed wheat price index"),
    barley: pick("barley", "barley_feeding", "Feed barley price index"),
    osr: pick("osr", "oilseed_rape", "Oilseed rape price index"),
    an: pick("an", "straight_fertilisers_nitrogenous", "Nitrogen fertiliser price index"),
    fuel: pick("fuel", "motor_fuels", "Motor fuels price index"),
  };
}

const YIELDS_URL = "https://assets.publishing.service.gov.uk/media/6ac66b15f1ba855cc196a8c8/UK-cops-webseries_261008.ods";

/** East Midlands yield row from the block whose first header cell mentions "yield". */
function eastMidlandsYields(rows: (string | number | null)[][]): SeriesPoint[] {
  const header = rows.findIndex((r) => typeof r[0] === "string" && /yield/i.test(r[0]) && r.some((c) => typeof c === "number" && c >= 1999)); // OSR block starts 2008
  if (header === -1) throw new Error("Yield block not found");
  const years = rows[header];
  const row = rows.slice(header + 1).find((r) => r[0] === "East Midlands");
  if (!row) throw new Error("East Midlands row not found");
  return years
    .map((y, i) => ({ y, v: row[i] }))
    .filter((c): c is { y: number; v: number } => typeof c.y === "number" && typeof c.v === "number" && c.y >= 1999)
    .map((c) => ({ date: String(c.y), value: c.v }));
}

async function defraYields(): Promise<Pick<History, "yield_wheat" | "yield_barley" | "yield_osr">> {
  const raw = await get(YIELDS_URL);
  const wb = XLSX.read(raw, { type: "array" });
  const sheet = (n: string) => XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[n], { header: 1, defval: null });
  const make = (id: FactorId, name: string, label: string): Series => ({
    id,
    label,
    unit: "t/ha",
    frequency: "annual",
    source: `Defra cereal and oilseed production, ${name}, East Midlands`,
    url: YIELDS_URL,
    licence: OGL,
    fetchedAt: now,
    sha256: sha(raw),
    points: eastMidlandsYields(sheet(name)),
  });
  return {
    yield_wheat: make("yield_wheat", "Regional_wheat", "Wheat yield, East Midlands"),
    yield_barley: make("yield_barley", "Regional_total_barley", "Barley yield, East Midlands"),
    yield_osr: make("yield_osr", "Regional_OSR", "Oilseed rape yield, East Midlands"),
  };
}

const BOE_URL =
  "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2010&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N";
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

async function bankRate(): Promise<Series> {
  const raw = await get(BOE_URL);
  const lines = new TextDecoder().decode(raw).trim().split("\n").slice(1);
  const byMonth = new Map<string, number>();
  for (const l of lines) {
    const [d, v] = l.split(",");
    const [, mon, year] = d.trim().split(" ");
    byMonth.set(`${year}-${MONTHS[mon]}-01`, Number(v)); // last day of the month wins
  }
  return {
    id: "bank_rate",
    label: "Bank Rate",
    unit: "%",
    frequency: "monthly",
    source: "Bank of England IADB, IUDBEDR, month-end",
    url: BOE_URL,
    licence: "Bank of England, free reuse with attribution",
    fetchedAt: now,
    sha256: sha(raw),
    points: Array.from(byMonth, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function main() {
  const history: History = { ...(await defraPriceIndex()), ...(await defraYields()), bank_rate: await bankRate() };
  writeFileSync("data/history.json", JSON.stringify(history, null, 1));
  for (const s of Object.values(history)) {
    console.log(`${s.id.padEnd(13)} ${s.points.length} points ${s.points[0]?.date} → ${s.points.at(-1)?.date}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
