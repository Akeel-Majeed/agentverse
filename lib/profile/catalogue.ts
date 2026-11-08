/**
 * What the farm profile can hold. The database stores values; this file says what each
 * value means, how it is entered and which risks it feeds. That `risks` list is the link
 * between the farm profile and the risk profile.
 */
import type { FieldType, RiskId } from "../types";

export const RISKS: { id: RiskId; name: string }[] = [
  { id: "output_prices", name: "Output prices" },
  { id: "input_prices", name: "Input prices" },
  { id: "weather_yield", name: "Weather and yield" },
  { id: "regulation", name: "Regulation" },
  { id: "interest_rates", name: "Interest rates" },
];

export const riskName = (id: RiskId) => RISKS.find((r) => r.id === id)?.name ?? id;

export interface SectionDef {
  id: string;
  title: string;
  documentsHint: string;
  agentMessage: string;
}

export const SECTIONS: SectionDef[] = [
  {
    id: "farm-basics",
    title: "Farm basics",
    documentsHint: "RPA land parcel map, tenancy agreements",
    agentMessage:
      "I found Fenland Ridge Farm Ltd on Companies House and matched 450 ha of land parcels from the RPA. Tenure came from our chat.",
  },
  {
    id: "land",
    title: "Land and soils",
    documentsHint: "Soil maps, drainage records, flood map extracts",
    agentMessage:
      "Soil types are from your RPA parcels and the soil survey. The flood-zone share is from the Environment Agency map; please check the drainage note.",
  },
  {
    id: "cropping",
    title: "Cropping plan",
    documentsHint: "Cropping plan, yield records, agronomist reports",
    agentMessage:
      "Areas are from your cropping plan; yields and their swing are from your five-year records. The rape yield came from your agronomist's adviser agent.",
  },
  {
    id: "sales",
    title: "Sales position",
    documentsHint: "Grain store sheet, merchant contracts",
    agentMessage:
      "I read your grain store sheet. Can you check the 2027 lines? I couldn't find any forward contracts, so I've assumed nothing is sold yet.",
  },
  {
    id: "inputs",
    title: "Inputs",
    documentsHint: "Merchant invoices, agronomist N plan, fuel invoices",
    agentMessage:
      "Your agronomist's N plan says 166 t of AN for spring. Have you bought any yet? Upload a merchant invoice and I'll fill it in.",
  },
  {
    id: "support",
    title: "Schemes and regulation",
    documentsHint: "SFI agreement, RPA payment statements, NVZ records",
    agentMessage:
      "I read your SFI agreement. The delinked payment is an estimate from last year's statement, so please check it.",
  },
  {
    id: "finance",
    title: "Finance",
    documentsHint: "Bank statements, facility letters, HP agreements",
    agentMessage:
      "Borrowing is from your bank statement. I couldn't find an overdraft limit or the lender's name yet; both are in the approval queue.",
  },
  {
    id: "pnl",
    title: "Costs and profit",
    documentsHint: "Accounts for the last three years",
    agentMessage:
      "Typical profit is the average of your last three years, adjusted to today's prices. Check it matches how you think about a normal year.",
  },
  {
    id: "insurance",
    title: "Insurance and limits",
    documentsHint: "Insurance schedules",
    agentMessage:
      "No crop or weather cover found. Tell me the largest loss the farm could take in one year and I'll flag any risk that goes past it.",
  },
];

export interface FieldDef {
  key: string;
  section: string;
  label: string;
  type: FieldType;
  /** For number fields: "ha", "t", "t/ha", "£/t", "£/ha", "%", "L", "people". */
  unit?: string;
  risks: RiskId[];
  /** Largest believable value; defaults by unit (see maxFor in values.ts). */
  max?: number;
  /** Days a confirmed value stays fresh before a freshness check asks again. */
  validDays?: number;
  help?: string;
}

const crop = (id: string, name: string): FieldDef[] => [
  { key: `crop.${id}.area_ha`, section: "cropping", label: `${name}: area`, type: "number", unit: "ha", risks: ["output_prices", "weather_yield"] },
  {
    key: `crop.${id}.yield_t_ha`,
    section: "cropping",
    label: `${name}: expected yield`,
    type: "number",
    unit: "t/ha",
    risks: ["output_prices", "weather_yield"],
    help: "Five-year average, adjusted for this season so far.",
  },
  {
    key: `crop.${id}.yield_sd_t_ha`,
    section: "cropping",
    label: `${name}: yield swing`,
    type: "number",
    unit: "t/ha",
    risks: ["weather_yield"],
    help: "How far yield moves in a normal year either way (standard deviation of your records).",
  },
  { key: `crop.${id}.end_market`, section: "cropping", label: `${name}: end market`, type: "text", risks: ["output_prices"] },
];

export const FIELDS: FieldDef[] = [
  // Farm basics
  { key: "business.name", section: "farm-basics", label: "Business name", type: "text", risks: [] },
  { key: "business.legal_form", section: "farm-basics", label: "Legal form", type: "text", risks: [] },
  { key: "business.location", section: "farm-basics", label: "Location", type: "text", risks: ["weather_yield"] },
  { key: "business.staff", section: "farm-basics", label: "Staff", type: "number", unit: "people", risks: [] },
  { key: "land.area_ha", section: "farm-basics", label: "Farmed area", type: "number", unit: "ha", risks: ["weather_yield"] },
  { key: "land.owned_ha", section: "farm-basics", label: "Owned", type: "number", unit: "ha", risks: [] },
  { key: "land.rented_ha", section: "farm-basics", label: "Rented (farm business tenancy)", type: "number", unit: "ha", risks: [] },
  { key: "land.rent_gbp_ha", section: "farm-basics", label: "Rent", type: "number", unit: "£/ha", risks: [] },
  { key: "land.rent_review", section: "farm-basics", label: "Next rent review", type: "date", risks: [] },

  // Land and soils
  { key: "land.soils", section: "land", label: "Soils", type: "text", risks: ["weather_yield"] },
  {
    key: "land.flood_zone_pct",
    section: "land",
    label: "Land in flood zone 3",
    type: "number",
    unit: "%",
    risks: ["weather_yield"],
  },
  { key: "land.drainage", section: "land", label: "Drainage", type: "text", risks: ["weather_yield"] },
  { key: "land.irrigation", section: "land", label: "Irrigation", type: "text", risks: ["weather_yield"] },

  // Cropping
  ...crop("wheat", "Winter wheat"),
  ...crop("barley", "Spring barley"),
  ...crop("osr", "Oilseed rape"),

  // Sales
  {
    key: "sales.wheat_2026_unsold_t",
    section: "sales",
    label: "2026 wheat unsold in store",
    type: "number",
    unit: "t",
    risks: ["output_prices"],
    validDays: 30,
  },
  {
    key: "sales.barley_2026_unsold_t",
    section: "sales",
    label: "2026 barley unsold in store",
    type: "number",
    unit: "t",
    risks: ["output_prices"],
    validDays: 30,
  },
  {
    key: "sales.wheat_2027_forward_t",
    section: "sales",
    label: "2027 wheat sold forward",
    type: "number",
    unit: "t",
    risks: ["output_prices"],
    validDays: 30,
    help: "Fixed-price and minimum-price contracts for harvest 2027.",
  },
  { key: "sales.barley_2027_forward_t", section: "sales", label: "2027 barley sold forward", type: "number", unit: "t", risks: ["output_prices"], validDays: 30 },
  { key: "sales.osr_2027_forward_t", section: "sales", label: "2027 rape sold forward", type: "number", unit: "t", risks: ["output_prices"], validDays: 30 },
  { key: "sales.storage_t", section: "sales", label: "Grain storage", type: "number", unit: "t", risks: ["output_prices"] },

  // Inputs
  { key: "inputs.n_need_t", section: "inputs", label: "Spring nitrogen needed", type: "number", unit: "t", risks: ["input_prices"], help: "Tonnes of ammonium nitrate (AN)." },
  { key: "inputs.n_bought_t", section: "inputs", label: "Spring nitrogen bought", type: "number", unit: "t", risks: ["input_prices"], validDays: 30 },
  { key: "inputs.n_price_paid", section: "inputs", label: "AN price paid last season", type: "number", unit: "£/t", risks: ["input_prices"] },
  { key: "inputs.diesel_l", section: "inputs", label: "Diesel used a year", type: "number", unit: "L", risks: ["input_prices"] },
  { key: "inputs.diesel_bought_pct", section: "inputs", label: "Diesel bought for the year", type: "number", unit: "%", risks: ["input_prices"], validDays: 30 },
  { key: "inputs.spray_gbp_ha", section: "inputs", label: "Spray budget", type: "number", unit: "£/ha", risks: ["input_prices"] },
  { key: "inputs.spray_bought_pct", section: "inputs", label: "Sprays bought", type: "number", unit: "%", risks: ["input_prices"], validDays: 30 },
  { key: "inputs.drying_energy", section: "inputs", label: "Grain drying energy a year", type: "money", risks: ["input_prices"] },

  // Schemes and regulation
  { key: "schemes.sfi_annual", section: "support", label: "SFI payments a year", type: "money", risks: ["regulation"] },
  { key: "schemes.sfi_end", section: "support", label: "SFI agreement ends", type: "date", risks: ["regulation"] },
  { key: "schemes.delinked", section: "support", label: "Delinked payment this year", type: "money", risks: ["regulation"] },
  { key: "schemes.countryside_stewardship", section: "support", label: "Countryside Stewardship", type: "text", risks: ["regulation"] },
  { key: "reg.nvz", section: "support", label: "Nitrate Vulnerable Zone", type: "text", risks: ["regulation", "input_prices"] },
  {
    key: "reg.glyphosate_ha",
    section: "support",
    label: "Area relying on glyphosate",
    type: "number",
    unit: "ha",
    risks: ["regulation"],
    help: "Hectares where glyphosate is used before drilling.",
  },
  { key: "reg.assurance", section: "support", label: "Assurance scheme", type: "text", risks: ["regulation", "output_prices"] },

  // Finance
  { key: "fin.loan", section: "finance", label: "Main loan", type: "money", risks: ["interest_rates"] },
  { key: "fin.loan_rate_type", section: "finance", label: "Loan rate type", type: "text", risks: ["interest_rates"], help: "Variable or fixed." },
  { key: "fin.loan_margin_pct", section: "finance", label: "Margin over Bank Rate", type: "number", unit: "%", max: 20, risks: ["interest_rates"] },
  { key: "fin.loan_renewal", section: "finance", label: "Loan renewal", type: "date", risks: ["interest_rates"] },
  { key: "fin.lender", section: "finance", label: "Secured lender", type: "text", risks: ["interest_rates"] },
  { key: "fin.overdraft_limit", section: "finance", label: "Overdraft limit", type: "money", risks: ["interest_rates"] },
  { key: "fin.overdraft_peak", section: "finance", label: "Overdraft at its peak", type: "money", risks: ["interest_rates"] },
  { key: "fin.hire_purchase", section: "finance", label: "Hire purchase (fixed rate)", type: "money", risks: [] },
  { key: "fin.cash_buffer", section: "finance", label: "Cash kept in reserve", type: "money", risks: [] },

  // Costs and profit
  { key: "pnl.typical_profit", section: "pnl", label: "Typical profit", type: "money", risks: ["output_prices", "input_prices", "weather_yield", "regulation", "interest_rates"] },
  { key: "pnl.fixed_costs", section: "pnl", label: "Fixed costs", type: "money", risks: [] },
  { key: "pnl.wheat_breakeven", section: "pnl", label: "Wheat break-even", type: "number", unit: "£/t", risks: ["output_prices"] },
  { key: "pnl.drawings", section: "pnl", label: "Drawings a year", type: "money", risks: [] },

  // Insurance and limits
  { key: "ins.crop_cover", section: "insurance", label: "Crop or weather cover", type: "text", risks: ["weather_yield"] },
  {
    key: "ins.max_loss",
    section: "insurance",
    label: "Largest loss you could take in one year",
    type: "money",
    risks: ["output_prices", "input_prices", "weather_yield", "regulation", "interest_rates"],
  },
];

export const fieldDef = (key: string) => FIELDS.find((f) => f.key === key);

export const fieldsForRisk = (riskId: RiskId) => FIELDS.filter((f) => f.risks.includes(riskId));

export const METRICS: Record<string, { label: string; unit: string }> = {
  wheat_feed_gbp_t: { label: "Feed wheat, delivered", unit: "£/t" },
  barley_feed_gbp_t: { label: "Feed barley, delivered", unit: "£/t" },
  osr_gbp_t: { label: "Oilseed rape, delivered", unit: "£/t" },
  an_gbp_t: { label: "Ammonium nitrate", unit: "£/t" },
  diesel_ppl: { label: "Red diesel", unit: "p/L" },
  bank_rate_pct: { label: "Bank Rate", unit: "%" },
  yield_outlook_pct: { label: "Regional yield outlook vs normal", unit: "%" },
  sfi_gap_months: { label: "Months without SFI payments", unit: "months" },
};
