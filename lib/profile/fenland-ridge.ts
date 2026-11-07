/**
 * Fictional profile for the demo farm, Fenland Ridge Farm Ltd. Figures agree with the
 * risk models in lib/mock.ts. Used as mock data and to generate supabase/seed.sql.
 */
import type { Confidence, MarketBaseline, MetricId, ProfileFieldValue, ProfileValue, Signal } from "../types";
import { fieldDef } from "./catalogue";
import { addDays } from "./values";

export const FARM_ID = "fenland-ridge";

/** When onboarding was confirmed and the first risk profile was made. */
const ONBOARDED = "2026-10-12T10:00:00Z";
export const SNAPSHOT_AT = "2026-11-07T06:00:00Z";

type Seed = [value: ProfileValue, source: string, confidence: Confidence, confirmedAt?: string | null];

const VALUES: Record<string, Seed> = {
  "business.name": ["Fenland Ridge Farm Ltd", "Companies House", "high", ONBOARDED],
  "business.legal_form": ["Private limited company", "Companies House", "high", ONBOARDED],
  "business.location": ["Near Sleaford, Lincolnshire (NG34)", "Onboarding chat", "high", ONBOARDED],
  "business.staff": [3, "Onboarding chat", "high", ONBOARDED],
  "land.area_ha": [450, "RPA land parcels", "high", ONBOARDED],
  "land.owned_ha": [390, "Onboarding chat", "check", ONBOARDED],
  "land.rented_ha": [60, "Onboarding chat", "check", ONBOARDED],
  "land.rent_gbp_ha": [280, "Tenancy agreement · Upload", "high", ONBOARDED],
  "land.rent_review": ["2028-09-29", "Tenancy agreement · Upload", "high", ONBOARDED],

  "land.soils": ["Silty clay loam 60%, sandy loam 40%", "Soil survey · RPA parcels", "high", ONBOARDED],
  "land.flood_zone_pct": [18, "Environment Agency flood map", "high", ONBOARDED],
  "land.drainage": ["Fair; a third of field drains are over 40 years old", "Onboarding chat", "check", ONBOARDED],
  "land.irrigation": ["None", "Onboarding chat", "high", ONBOARDED],

  "crop.wheat.area_ha": [220, "Cropping plan · Upload", "high", ONBOARDED],
  "crop.wheat.yield_t_ha": [8.5, "Yield records 2021–25", "high", ONBOARDED],
  "crop.wheat.yield_sd_t_ha": [0.9, "Yield records 2021–25", "high", ONBOARDED],
  "crop.wheat.end_market": ["Feed, delivered to merchant", "Grain store sheet", "high", ONBOARDED],
  "crop.barley.area_ha": [130, "Cropping plan · Upload", "high", ONBOARDED],
  "crop.barley.yield_t_ha": [6.0, "Yield records 2021–25", "high", ONBOARDED],
  "crop.barley.yield_sd_t_ha": [0.7, "Yield records 2021–25", "high", ONBOARDED],
  "crop.barley.end_market": ["Malting if it meets spec, otherwise feed", "Onboarding chat", "check", ONBOARDED],
  "crop.osr.area_ha": [100, "Cropping plan · Upload", "high", ONBOARDED],
  "crop.osr.yield_t_ha": [3.4, "Adviser agent · via MCP", "check", ONBOARDED],
  "crop.osr.yield_sd_t_ha": [0.5, "Yield records 2021–25", "high", ONBOARDED],
  "crop.osr.end_market": ["Crush, delivered to Hull", "Onboarding chat", "high", ONBOARDED],

  "sales.wheat_2026_unsold_t": [1028, "Grain store sheet · Upload", "high", "2026-10-28T09:00:00Z"],
  "sales.barley_2026_unsold_t": [0, "Grain store sheet · Upload", "high", "2026-10-28T09:00:00Z"],
  "sales.wheat_2027_forward_t": [0, "Assumed · No contracts found", "check", null],
  "sales.barley_2027_forward_t": [0, "Assumed · No contracts found", "check", null],
  "sales.osr_2027_forward_t": [0, "Assumed · No contracts found", "check", null],
  "sales.storage_t": [1600, "Onboarding chat", "high", ONBOARDED],

  "inputs.n_need_t": [166, "Agronomist N plan · via MCP", "high", "2026-10-20T09:00:00Z"],
  "inputs.n_bought_t": [0, "Freshness check", "check", "2026-09-27T09:00:00Z"],
  "inputs.n_price_paid": [640, "Merchant invoice 2025", "high", ONBOARDED],
  "inputs.diesel_l": [38000, "Fuel invoices 2025 · Upload", "high", ONBOARDED],
  "inputs.diesel_bought_pct": [40, "Fuel invoices 2025 · Upload", "check", ONBOARDED],
  "inputs.spray_gbp_ha": [96, "Agronomist plan · via MCP", "high", "2026-10-20T09:00:00Z"],
  "inputs.spray_bought_pct": [50, "Merchant statement · Upload", "check", ONBOARDED],
  "inputs.drying_energy": [14000, "Accounts 2025 · Upload", "high", ONBOARDED],

  "schemes.sfi_annual": [40000, "RPA agreement PDF · Upload", "high", ONBOARDED],
  "schemes.sfi_end": ["2027-03-31", "RPA agreement PDF · Upload", "high", ONBOARDED],
  "schemes.delinked": [9600, "RPA statement 2025", "check", ONBOARDED],
  "schemes.countryside_stewardship": ["None; Higher Tier eligibility checked Oct 2026", "Onboarding chat", "high", ONBOARDED],
  "reg.nvz": ["All land in an NVZ", "Environment Agency NVZ map", "high", ONBOARDED],
  "reg.glyphosate_ha": [350, "Agronomist plan · via MCP", "check", ONBOARDED],
  "reg.assurance": ["Red Tractor Combinable Crops", "Red Tractor certificate · Upload", "high", ONBOARDED],

  "fin.loan": [840000, "Bank statement · Upload", "high", ONBOARDED],
  "fin.loan_rate_type": ["Variable", "Bank statement · Upload", "high", ONBOARDED],
  "fin.loan_margin_pct": [3.1, "Bank facility letter · Upload", "high", ONBOARDED],
  "fin.loan_renewal": ["2027-05-14", "Bank facility letter · Upload", "high", ONBOARDED],
  "fin.lender": [null, "Not recorded", "check", null],
  "fin.overdraft_limit": [null, "Not recorded", "check", null],
  "fin.overdraft_peak": [120000, "Bank statements 2025 · Upload", "check", ONBOARDED],
  "fin.hire_purchase": [64000, "HP agreement · Upload", "high", ONBOARDED],
  "fin.cash_buffer": [25000, "Onboarding chat", "check", ONBOARDED],

  "pnl.typical_profit": [85000, "Accounts 2023–25 · Average", "check", ONBOARDED],
  "pnl.fixed_costs": [312000, "Accounts 2025 · Upload", "high", ONBOARDED],
  "pnl.wheat_breakeven": [185, "Accounts 2025 · Upload", "high", ONBOARDED],
  "pnl.drawings": [45000, "Accounts 2025 · Upload", "high", ONBOARDED],

  "ins.crop_cover": ["None", "Onboarding chat", "high", ONBOARDED],
  "ins.max_loss": [60000, "Onboarding chat", "check", null],
};

export const profileFields: ProfileFieldValue[] = Object.entries(VALUES).map(([key, [value, source, confidence, confirmedAt]]) => {
  const days = fieldDef(key)?.validDays;
  return {
    key,
    value,
    source,
    confidence,
    confirmedAt: confirmedAt ?? null,
    validUntil: days && confirmedAt ? addDays(confirmedAt, days) : null,
  };
});

/** Sections the farmer has confirmed, with when. */
export const sectionConfirmations: Record<string, string> = {
  "farm-basics": ONBOARDED,
  land: ONBOARDED,
  cropping: ONBOARDED,
};

/** Market figures on the day of the first risk profile. */
export const market: MarketBaseline = {
  wheat_feed_gbp_t: { value: 178, unit: "£/t", label: "Feed wheat, delivered", source: "AHDB delivered prices", date: "2026-11-06" },
  barley_feed_gbp_t: { value: 158, unit: "£/t", label: "Feed barley, delivered", source: "AHDB delivered prices", date: "2026-11-06" },
  osr_gbp_t: { value: 452, unit: "£/t", label: "Oilseed rape, delivered", source: "AHDB delivered prices", date: "2026-11-06" },
  an_gbp_t: { value: 504, unit: "£/t", label: "Ammonium nitrate", source: "AHDB fertiliser prices", date: "2026-10-31" },
  diesel_ppl: { value: 68, unit: "p/L", label: "Red diesel", source: "AHDB input prices", date: "2026-10-31" },
  bank_rate_pct: { value: 3.75, unit: "%", label: "Bank Rate", source: "Bank of England", date: "2026-11-06" },
  yield_outlook_pct: { value: 0, unit: "%", label: "Regional yield outlook vs normal", source: "Met Office · Model", date: "2026-11-06" },
  sfi_gap_months: { value: 0, unit: "months", label: "Months without SFI payments", source: "RPA agreement", date: "2026-10-12" },
};

/** How market figures moved over the week before the first risk profile (expected profit "vs last week"). */
export const weekMoves: Partial<Record<MetricId, number>> = { wheat_feed_gbp_t: -4, an_gbp_t: 18 };

/** News, prices and policy items that arrived after the snapshot. */
export const signals: Signal[] = [
  {
    id: "sig-wheat-172",
    riskId: "output_prices",
    kind: "market",
    title: "Feed wheat down to £172/t",
    summary: "Delivered feed wheat fell £6/t on a bigger Black Sea export estimate.",
    source: "AHDB delivered prices",
    publishedAt: "2026-11-07T14:00:00Z",
    metric: "wheat_feed_gbp_t",
    value: 172,
  },
  {
    id: "sig-sfi-delay",
    riskId: "regulation",
    kind: "policy",
    title: "Next SFI offer expected June 2027, not January",
    summary: "DEFRA says the next Sustainable Farming Incentive window will open in early summer. Agreements ending in March face a gap.",
    source: "DEFRA announcement · Agent read",
    publishedAt: "2026-11-07T11:30:00Z",
    metric: "sfi_gap_months",
    value: 3,
  },
  {
    id: "sig-an-522",
    riskId: "input_prices",
    kind: "market",
    title: "Ammonium nitrate up to £522/t",
    summary: "UK-made AN rose £18/t as European gas prices firmed.",
    source: "AHDB fertiliser prices",
    publishedAt: "2026-11-07T10:00:00Z",
    metric: "an_gbp_t",
    value: 522,
  },
  {
    id: "sig-boe-cut",
    riskId: "interest_rates",
    kind: "market",
    title: "Markets now expect Bank Rate at 3.5% by February",
    summary: "Swap rates imply a quarter-point cut at the December or February meeting.",
    source: "Bank of England · Market curve",
    publishedAt: "2026-11-07T09:15:00Z",
    metric: "bank_rate_pct",
    value: 3.5,
  },
  {
    id: "sig-dry-spring",
    riskId: "weather_yield",
    kind: "weather",
    title: "Drier than normal spring slightly more likely",
    summary: "The Met Office long-range outlook leans dry for March to May in eastern England. No yield figure yet.",
    source: "Met Office long-range outlook",
    publishedAt: "2026-11-07T08:00:00Z",
    metric: null,
    value: null,
  },
  {
    id: "sig-glyphosate",
    riskId: "regulation",
    kind: "news",
    title: "Glyphosate approval review: decision moved to January",
    summary: "HSE has delayed its decision on renewing glyphosate approval. 350 ha of your rotation relies on it before drilling.",
    source: "HSE · Agent read",
    publishedAt: "2026-11-07T07:30:00Z",
    metric: null,
    value: null,
  },
];
