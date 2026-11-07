/**
 * Fictional demo data for Fenland Ridge Farm Ltd. Only lib/data.ts may import this file;
 * swap those functions for API calls when the backend is ready.
 */
import { scoreFromBadYear } from "./score";
import { riskWorking, simulateExposure, Z95 } from "./sim";
import type {
  AssessmentMeta,
  BreakEven,
  CalendarItem,
  ExposureModel,
  Farm,
  Mitigation,
  OnboardingSection,
  PendingChange,
  ProfitSummary,
  Reminder,
  RiskResult,
  WhatIfPreset,
  WhatIfSlider,
} from "./types";

export const TYPICAL_PROFIT = 85_000;
const MEAN_K = 85;
const WHEAT_SD_K = (2898 * 20) / 1000;
const OTHER_SD_K = 55;
const FARM_SD_K = Math.sqrt(WHEAT_SD_K ** 2 + OTHER_SD_K ** 2);

export const farm: Farm = {
  id: "fenland-ridge",
  name: "Fenland Ridge Farm Ltd",
  hectares: 450,
  location: "Near Sleaford, Lincolnshire",
  crops: ["Winter wheat", "Spring barley", "Oilseed rape"],
};

export const meta: AssessmentMeta = {
  date: "2026-11-07",
  updatedAt: "06:00",
  harvestYear: 2027,
  typicalProfit: TYPICAL_PROFIT,
};

/** Other-risk sd chosen so every risk page reconciles to the same whole-farm sd. */
function otherSdFor(exposure: number, unitSd: number): number {
  const riskSdK = (exposure * unitSd) / 1000;
  return Math.sqrt(Math.max(FARM_SD_K ** 2 - riskSdK ** 2, 0));
}

type ModelInput = Omit<ExposureModel, "otherSdK" | "meanK"> & { otherSdK?: number };

function model(input: ModelInput): ExposureModel {
  return {
    ...input,
    meanK: MEAN_K,
    otherSdK: input.otherSdK ?? otherSdFor(input.exposure, input.unitSd),
  };
}

type MitigationInput = Omit<Mitigation, "riskId" | "badYearReduction" | "scoreAfter"> &
  Partial<Pick<Mitigation, "badYearReduction" | "scoreAfter">>;

function mitigations(riskId: string, badYear: number, m: ExposureModel, items: MitigationInput[]): Mitigation[] {
  return items.map((item) => {
    const removed = item.effect.tonnesRemoved ?? item.effect.unitsRemoved ?? 0;
    const reduction = item.badYearReduction ?? Math.round(removed * m.unitSd * Z95);
    return {
      ...item,
      riskId,
      badYearReduction: reduction,
      scoreAfter:
        item.scoreAfter ??
        scoreFromBadYear(item.benefitKind === "profit" ? badYear : badYear - reduction, TYPICAL_PROFIT),
    };
  });
}

interface RiskInput extends Omit<RiskResult, "mitigations" | "working" | "pctOfProfit" | "score" | "model"> {
  model: ModelInput;
  mitigations: MitigationInput[];
}

function risk(input: RiskInput): RiskResult {
  const m = model(input.model);
  const pct = (input.badYear / TYPICAL_PROFIT) * 100;
  return {
    ...input,
    model: m,
    score: scoreFromBadYear(input.badYear, TYPICAL_PROFIT),
    pctOfProfit: Math.round(pct),
    working: riskWorking(m, simulateExposure(m, m.exposure, m.meanK)),
    mitigations: mitigations(input.id, input.badYear, m, input.mitigations),
  };
}

export const risks: RiskResult[] = [
  risk({
    id: "wheat-price",
    name: "Wheat price",
    badYear: 96_000,
    expected: 12_000,
    trend7d: 11_000,
    driver: "1,028 t of 2026 unsold, 2027 crop unsold",
    summary:
      "Most of your downside sits in unsold wheat: one bad price year would wipe out more than a typical year's profit.",
    reasoning: [
      "You hold 1,028 t of 2026 wheat in store and none of the expected 1,870 t 2027 crop is sold, so 2,898 t move with the market.",
      "Delivered feed wheat is £178/t, £7 under your £185/t break-even. A 1-in-20 bad year takes another £33/t off.",
      "The bad-year hit rose £11k this week because the price fell £4/t while tonnes stayed the same.",
      "A minimum-price contract on half the 2027 crop keeps the upside and takes the score from 10 to 8 for about £7.5k.",
    ],
    sources: [
      { label: "2026 wheat unsold: 1,028 t", origin: "Grain store sheet · Onboarding", date: "12 Oct 2026" },
      { label: "2027 wheat expected: 1,870 t (220 ha × 8.5 t/ha)", origin: "Cropping plan · Onboarding", date: "12 Oct 2026" },
      { label: "Feed wheat, delivered: £178/t", origin: "AHDB delivered prices", date: "06 Nov 2026" },
      { label: "Price volatility: £20/t standard deviation", origin: "AHDB 10-yr history · Headwind model" },
      { label: "Wheat break-even: £185/t", origin: "Accounts 2025 · Upload", date: "14 Oct 2026" },
      { label: "Minimum-price premium: ~£8/t", origin: "Merchant quote · via MCP", date: "05 Nov 2026" },
    ],
    model: {
      exposure: 2898,
      unit: "t",
      unitSd: 20,
      otherSdK: OTHER_SD_K,
      exposureLabel: "Tonnes exposed",
      keys: { exposure: "tonnes_exposed", sd: "price_sd", shock: "bad_price_fall" },
      shockLabel: "Bad-year price fall",
      tradeoff: {
        title: "How much to sell forward",
        actionLabel: "2027 crop sold forward",
        hedgeable: 1870,
        note: "Share of the expected 1,870 t 2027 crop. Before any options above.",
      },
    },
    mitigations: [
      {
        id: "wheat-minprice-half-2027",
        title: "Minimum-price contract on half the 2027 wheat",
        description: "Sets a floor under 935 t while keeping any price rise. Premium about £8/t.",
        cost: "Premium ~£7.5k",
        status: "suggested",
        effect: { tonnesRemoved: 935, meanCost: 7.5 },
      },
      {
        id: "wheat-sell-2026",
        title: "Sell 20% more of the 2026 crop",
        description: "Move 374 t from store at today's £178/t before the 20 Nov movement date.",
        cost: "No premium · locks in £178/t",
        status: "suggested",
        effect: { tonnesRemoved: 374 },
      },
      {
        id: "wheat-forward-30",
        title: "Sell 30% of the 2027 crop forward",
        description: "Fixed-price contract on 561 t for harvest 2027 delivery.",
        cost: "No premium · gives up upside on 561 t",
        status: "suggested",
        effect: { tonnesRemoved: 561 },
      },
    ],
  }),
  risk({
    id: "weather-yield",
    name: "Weather and yield",
    badYear: 58_000,
    expected: 9_000,
    trend7d: 0,
    driver: "Dry spring or wet harvest, all crops",
    summary: "A dry spring or wet harvest hits every crop at once, which makes this the hardest risk to offset.",
    reasoning: [
      "All 450 ha are exposed to the same weather, so a bad season cuts wheat, barley and rape together.",
      "Your five-year yield record swings about £78/ha either side of normal; a 1-in-20 season costs £58k.",
      "Nothing changed this week: soil moisture is normal for the time of year.",
      "Yield-index insurance on the wheat area is the main lever; splitting barley drilling helps at the margin.",
    ],
    sources: [
      { label: "Farmed area: 450 ha", origin: "RPA land parcels", date: "12 Oct 2026" },
      { label: "Yield swing: £78/ha standard deviation", origin: "Yield records 2021–25 · Upload" },
      { label: "Soil moisture: normal", origin: "Met Office · Lincs", date: "06 Nov 2026" },
      { label: "Index insurance quote: ~£4.2k/yr", origin: "Broker quote · via MCP", date: "02 Nov 2026" },
    ],
    model: {
      exposure: 450,
      unit: "ha",
      unitSd: 78,
      exposureLabel: "Hectares exposed",
      keys: { exposure: "hectares_exposed", sd: "yield_sd_per_ha", shock: "bad_loss_per_ha" },
      shockLabel: "Bad-year loss per hectare",
      tradeoff: {
        title: "How much area to insure",
        actionLabel: "Area insured",
        hedgeable: 450,
        note: "Share of the 450 ha farmed. Index cover pays on regional yield, not your own.",
      },
    },
    mitigations: [
      {
        id: "weather-index-insurance",
        title: "Yield-index insurance on the wheat area",
        description: "Pays out when regional wheat yield falls below trend. Covers about 160 ha-equivalent.",
        cost: "Premium ~£4.2k/yr",
        status: "suggested",
        effect: { unitsRemoved: 160, meanCost: 4.2 },
      },
      {
        id: "weather-split-drilling",
        title: "Split spring barley drilling across two windows",
        description: "Halves the chance that one dry spell catches the whole barley crop.",
        cost: "No direct cost · more planning",
        status: "planned",
        effect: { unitsRemoved: 60 },
      },
    ],
  }),
  risk({
    id: "fertiliser-price",
    name: "Fertiliser price",
    badYear: 25_000,
    expected: 3_000,
    trend7d: 3_000,
    driver: "166 t spring nitrogen unbought",
    summary: "Spring nitrogen is still unbought, so a price spike before February lands straight on margin.",
    reasoning: [
      "Your agronomist's plan needs 166 t of ammonium nitrate for spring; none is bought yet.",
      "AN is £504/t today. In a 1-in-20 year it rises about £150/t before you buy.",
      "The hit rose £3k this week as gas prices firmed.",
      "Buying half now removes half the exposure for roughly the interest on paying early.",
    ],
    sources: [
      { label: "Spring N needed: 166 t AN", origin: "Agronomist N plan · via MCP", date: "20 Oct 2026" },
      { label: "Spring N bought: 0 t", origin: "Freshness check", date: "27 Sep 2026" },
      { label: "AN price: £504/t", origin: "AHDB fertiliser prices", date: "Oct 2026" },
      { label: "Price volatility: £91/t standard deviation", origin: "AHDB 10-yr history · Headwind model" },
    ],
    model: {
      exposure: 166,
      unit: "t",
      unitSd: 91,
      exposureLabel: "Tonnes unbought",
      keys: { exposure: "tonnes_unbought", sd: "price_sd", shock: "bad_price_rise" },
      shockLabel: "Bad-year price rise",
      tradeoff: {
        title: "How much nitrogen to buy now",
        actionLabel: "Spring N bought now",
        hedgeable: 166,
        note: "Share of the 166 t spring requirement. Buying early ties up cash until spring.",
      },
    },
    mitigations: [
      {
        id: "fert-buy-half",
        title: "Buy half of spring nitrogen now",
        description: "83 t at today's £504/t, delivered in January.",
        cost: "~£0.6k interest on paying early",
        status: "suggested",
        effect: { tonnesRemoved: 83, meanCost: 0.6 },
      },
      {
        id: "fert-fixed-pod",
        title: "Fixed price, pay on delivery for the rest",
        description: "Ask the merchant to fix the other 83 t now and invoice in March.",
        cost: "~£11/t above spot",
        status: "suggested",
        effect: { tonnesRemoved: 83, meanCost: 0.9 },
      },
    ],
  }),
  risk({
    id: "scheme-payments",
    name: "Scheme payments",
    badYear: 20_000,
    expected: 4_000,
    trend7d: 0,
    driver: "Agreement ends March 2027",
    summary: "Your SFI agreement ends in March 2027 and nothing is lined up yet to replace the £40k a year.",
    reasoning: [
      "Support payments bring in about £40k a year; the current agreement ends on 31 March 2027.",
      "If the next offer is delayed or smaller, about half of that could be missing in the 2027 harvest year.",
      "An application in the next window would protect roughly half the income at stake.",
    ],
    sources: [
      { label: "SFI agreement: £40k/yr, ends 31 Mar 2027", origin: "RPA agreement PDF · Upload", date: "12 Oct 2026" },
      { label: "Next offer window: expected Jan–Mar 2027", origin: "DEFRA announcement · Headwind read", date: "28 Oct 2026" },
    ],
    model: {
      exposure: 40,
      unit: "£k",
      unitSd: 303,
      exposureLabel: "Payments at risk",
      keys: { exposure: "payments_at_risk", sd: "payment_sd", shock: "bad_year_shortfall" },
      shockLabel: "Bad-year shortfall",
      tradeoff: {
        title: "How much income to secure",
        actionLabel: "Payments secured",
        hedgeable: 40,
        note: "Share of the £40k a year at stake if the agreement is not replaced.",
      },
    },
    mitigations: [
      {
        id: "scheme-apply-next",
        title: "Apply for the next SFI offer before the agreement ends",
        description: "Line up actions that fit the rotation so payments carry on from April.",
        cost: "~£1.2k adviser time",
        status: "suggested",
        effect: { unitsRemoved: 20, meanCost: 1.2 },
      },
      {
        id: "scheme-cs-check",
        title: "Check Countryside Stewardship Higher Tier eligibility",
        description: "Field margins along the drain may qualify.",
        cost: "Free · one call",
        status: "done",
        effect: { unitsRemoved: 6 },
      },
    ],
  }),
  risk({
    id: "interest-rates",
    name: "Interest rates",
    badYear: 11_000,
    expected: 2_000,
    trend7d: -1_000,
    driver: "£840k variable at base + 3.1%",
    summary: "£840k of variable debt means every 1-point rise in Bank Rate costs about £8k a year.",
    reasoning: [
      "All £840k of borrowing is variable at Bank Rate + 3.1%.",
      "A 1-in-20 rise of 1.3 points over the year would cost about £11k.",
      "Markets priced in slightly lower rates this week, so the hit eased by £1k.",
      "The bigger win is the margin: well-secured farms pay 1.3–1.8% over base, worth about £11k a year to you.",
    ],
    sources: [
      { label: "Variable borrowing: £840k at base + 3.1%", origin: "Bank statement · Upload", date: "12 Oct 2026" },
      { label: "Loan renewal: 14 May 2027", origin: "Bank facility letter · Upload", date: "12 Oct 2026" },
      { label: "Typical secured farm margin: 1.3–1.8%", origin: "Lender survey · Headwind read", date: "Oct 2026" },
      { label: "Bank Rate expectations", origin: "Bank of England · Market curve", date: "06 Nov 2026" },
    ],
    model: {
      exposure: 840,
      unit: "£k",
      unitSd: 7.9,
      exposureLabel: "Variable debt",
      keys: { exposure: "variable_debt", sd: "rate_sd", shock: "bad_rate_rise" },
      shockLabel: "Bad-year rate rise",
      tradeoff: {
        title: "How much of the loan to fix",
        actionLabel: "Loan fixed",
        hedgeable: 840,
        note: "Share of the £840k fixed for three years. Fixing gives up savings if rates fall.",
      },
    },
    mitigations: [
      {
        id: "rates-compare-margin",
        title: "Compare lender margin before May renewal",
        description: "You pay base + 3.1%; well-secured farms pay 1.3–1.8%.",
        cost: "Free · a few calls",
        status: "suggested",
        benefitKind: "profit",
        badYearReduction: 10_920,
        effect: { meanCost: -10.9 },
      },
      {
        id: "rates-fix-half",
        title: "Fix half the £840k for three years",
        description: "Swaps half the variable exposure for a fixed rate at renewal.",
        cost: "~£2.1k/yr above variable today",
        status: "suggested",
        effect: { unitsRemoved: 420, meanCost: 2.1 },
      },
    ],
  }),
];

export const topMitigationIds = ["wheat-minprice-half-2027", "fert-buy-half", "rates-compare-margin"];

export const profit: ProfitSummary = {
  expected: 85_000,
  badYear: -47_000,
  goodYear: 217_000,
  lossChance: 0.14,
  lossYearsOf20: 3,
  deltaWeek: -9_000,
  working: [
    { label: "expected_profit (3-yr average, price-adjusted)", value: "£85k" },
    { label: "wheat_sd = 2,898 t × £20/t", value: `£${Math.round(WHEAT_SD_K)}k` },
    { label: "other_risks_sd", value: `£${OTHER_SD_K}k` },
    { label: "farm_sd = √(wheat_sd² + other_risks_sd²)", value: `£${Math.round(FARM_SD_K)}k` },
    { label: "bad_year = expected − 1.65 × farm_sd", value: "−£47k" },
    { label: "good_year = expected + 1.65 × farm_sd", value: "£217k" },
    { label: "loss_chance = Φ(−expected ÷ farm_sd)", value: "14% (3 in 20)" },
    { label: "change vs last week (wheat −£4/t, AN +£18/t)", value: "−£9k" },
  ],
  sources: [
    { label: "Profit and loss 2023–2025", origin: "Accounts · Upload", date: "14 Oct 2026" },
    { label: "Feed wheat, delivered: £178/t", origin: "AHDB delivered prices", date: "06 Nov 2026" },
    { label: "AN price: £504/t", origin: "AHDB fertiliser prices", date: "Oct 2026" },
  ],
};

export const breakEvens: BreakEven[] = [
  { crop: "Wheat", price: 178, breakEven: 185, unit: "t" },
  { crop: "Spring barley", price: 158, breakEven: 150, unit: "t" },
  { crop: "Oilseed rape", price: 452, breakEven: 395, unit: "t" },
];

export const pendingChanges: PendingChange[] = [
  {
    id: "pc-nitrogen",
    field: "Spring nitrogen bought",
    currentValue: "0 of 166 t",
    proposedValue: "0 of 166 t",
    source: "freshness",
    reason: "Last confirmed 41 days ago. AN is up £18/t since, so this changes your fertiliser score.",
    status: "pending",
    receivedAt: "Today 06:00",
  },
  {
    id: "pc-osr-yield",
    field: "Oilseed rape yield estimate",
    currentValue: "3.4 t/ha",
    proposedValue: "3.1 t/ha",
    source: "mcp",
    reason: "Your agronomist's adviser agent logged pigeon damage on 32 ha at the 4 Nov crop walk.",
    status: "pending",
    receivedAt: "Fri 17:42",
  },
  {
    id: "pc-wheat-sold",
    field: "2026 wheat unsold",
    currentValue: "1,028 t",
    proposedValue: "828 t",
    source: "imessage",
    reason: "You replied “sold 200t to the merchant at 181” on Thursday evening.",
    status: "pending",
    receivedAt: "Thu 19:03",
  },
  {
    id: "pc-lender",
    field: "Secured lender",
    currentValue: "Not recorded",
    proposedValue: "Lloyds Bank plc",
    source: "companies_house",
    reason: "New charge registered against Fenland Ridge Farm Ltd on 12 Oct 2026.",
    status: "pending",
    receivedAt: "Wed 09:15",
  },
  {
    id: "pc-overdraft",
    field: "Overdraft limit",
    currentValue: "Not set",
    proposedValue: "£150k",
    source: "onboarding",
    reason: "Read from the bank facility letter you uploaded.",
    status: "pending",
    receivedAt: "Tue 14:20",
  },
];

export const calendar: CalendarItem[] = [
  { id: "sell-store", lane: "Selling", kind: "period", start: "2026-11-01", end: "2027-03-31", label: "2026 wheat in store" },
  { id: "sell-move", lane: "Selling", kind: "key", start: "2026-11-20", label: "Wheat movement: 1,028 t, sell or store" },
  { id: "sell-osr", lane: "Selling", kind: "deadline", start: "2027-01-15", label: "OSR forward offer expires" },
  { id: "sell-minprice", lane: "Selling", kind: "deadline", start: "2027-03-31", label: "Min-price offers for 2027 wheat close" },
  { id: "sell-harvest", lane: "Selling", kind: "period", start: "2027-07-20", end: "2027-09-05", label: "Harvest 2027" },
  { id: "in-nwindow", lane: "Inputs", kind: "period", start: "2026-12-01", end: "2027-02-15", label: "Spring N buying window" },
  { id: "in-ndeliver", lane: "Inputs", kind: "deadline", start: "2027-02-15", label: "Last AN delivery for first split" },
  { id: "in-drill", lane: "Inputs", kind: "period", start: "2027-03-01", end: "2027-04-15", label: "Barley drilling" },
  { id: "in-seed", lane: "Inputs", kind: "deadline", start: "2027-08-16", label: "Order OSR seed" },
  { id: "fin-vat", lane: "Finance", kind: "deadline", start: "2027-02-07", label: "VAT return" },
  { id: "fin-overdraft", lane: "Finance", kind: "period", tone: "warning", start: "2027-04-01", end: "2027-08-31", label: "Overdraft peak ~£150k" },
  { id: "fin-renewal", lane: "Finance", kind: "deadline", start: "2027-05-14", label: "Loan renewal: £840k variable" },
  { id: "fin-ct", lane: "Finance", kind: "deadline", start: "2027-10-01", label: "Corporation tax due" },
  { id: "sch-sfi", lane: "Schemes", kind: "period", start: "2026-11-01", end: "2027-03-31", label: "SFI agreement, final months" },
  { id: "sch-delinked", lane: "Schemes", kind: "deadline", start: "2026-12-15", label: "Delinked payment expected" },
  { id: "sch-window", lane: "Schemes", kind: "period", start: "2027-01-11", end: "2027-03-12", label: "Next SFI window (expected)" },
  { id: "sch-end", lane: "Schemes", kind: "deadline", start: "2027-03-31", label: "SFI agreement ends" },
  { id: "mkt-boe-dec", lane: "Markets", kind: "deadline", start: "2026-12-17", label: "Bank Rate decision" },
  { id: "mkt-wasde", lane: "Markets", kind: "deadline", start: "2027-01-12", label: "USDA WASDE: final US crop" },
  { id: "mkt-boe-feb", lane: "Markets", kind: "deadline", start: "2027-02-04", label: "Bank Rate decision" },
  { id: "mkt-ahdb", lane: "Markets", kind: "deadline", start: "2027-03-04", label: "AHDB planting survey" },
  { id: "mkt-boe-may", lane: "Markets", kind: "deadline", start: "2027-05-06", label: "Bank Rate decision" },
  { id: "mkt-boe-aug", lane: "Markets", kind: "deadline", start: "2027-08-05", label: "Bank Rate decision" },
];

export const reminders: Reminder[] = [
  {
    id: "rem-move",
    sendAt: "Mon 16 Nov · 07:00",
    message: "Wheat movement is due Fri 20 Nov. 1,028 t unsold at £178/t, £7 under break-even. Reply SOLD 200 AT 181 to update.",
    relatesTo: "Selling",
  },
  {
    id: "rem-nitrogen",
    sendAt: "Tue 1 Dec · 07:00",
    message: "Spring N buying window opens. AN is £504/t. Buying half now takes your fertiliser score from 4 to 2.",
    relatesTo: "Inputs",
  },
  {
    id: "rem-sfi",
    sendAt: "Mon 1 Feb · 07:00",
    message: "Your SFI agreement ends 31 Mar. The next offer window should be open: want me to draft the actions list?",
    relatesTo: "Schemes",
  },
  {
    id: "rem-renewal",
    sendAt: "Mon 12 Apr · 07:00",
    message: "Loan renewal is 14 May. Well-secured farms pay 1.3–1.8% over base; you pay 3.1%. Worth ~£11k a year.",
    relatesTo: "Finance",
  },
];

export const onboarding: OnboardingSection[] = [
  {
    id: "farm-basics",
    title: "Farm basics",
    status: "confirmed",
    agentMessage: "I found Fenland Ridge Farm Ltd on Companies House and matched 450 ha of land parcels from the RPA. Tenure came from our chat.",
    documentsHint: "RPA land parcel map, tenancy agreements",
    fields: [
      { id: "fb-name", label: "Business name", value: "Fenland Ridge Farm Ltd", source: "Companies House", confidence: "high" },
      { id: "fb-location", label: "Location", value: "Near Sleaford, Lincolnshire", source: "Onboarding chat", confidence: "high" },
      { id: "fb-area", label: "Farmed area", value: "450 ha", source: "RPA land parcels", confidence: "high" },
      { id: "fb-tenure", label: "Tenure", value: "390 ha owned, 60 ha FBT", source: "Onboarding chat", confidence: "check" },
    ],
  },
  {
    id: "cropping",
    title: "Cropping plan",
    status: "confirmed",
    agentMessage: "Areas are from your cropping plan; yields are your five-year averages. The rape yield came from your agronomist's adviser agent.",
    documentsHint: "Cropping plan, yield records, agronomist reports",
    fields: [
      { id: "cp-wheat", label: "Winter wheat", value: "220 ha · 8.5 t/ha", source: "Cropping plan upload", confidence: "high" },
      { id: "cp-barley", label: "Spring barley", value: "130 ha · 6.0 t/ha", source: "Yield records 2021–25", confidence: "high" },
      { id: "cp-osr", label: "Oilseed rape", value: "100 ha · 3.4 t/ha", source: "Adviser agent · via MCP", confidence: "check" },
    ],
  },
  {
    id: "sales",
    title: "Sales position",
    status: "review",
    agentMessage: "I read your grain store sheet. Can you check the 2027 line? I couldn't find any forward contracts, so I've assumed nothing is sold yet.",
    documentsHint: "Grain store sheet, merchant contracts",
    fields: [
      { id: "sp-2026", label: "2026 wheat unsold", value: "1,028 t", source: "Grain store sheet", confidence: "high" },
      { id: "sp-2027", label: "2027 wheat sold forward", value: "0 t", source: "Assumed · No contracts found", confidence: "check" },
      { id: "sp-barley", label: "2026 barley unsold", value: "0 t", source: "Grain store sheet", confidence: "high" },
      { id: "sp-osr", label: "2027 OSR sold forward", value: "0 t", source: "Assumed · No contracts found", confidence: "check" },
    ],
  },
  {
    id: "inputs",
    title: "Inputs",
    status: "todo",
    agentMessage: "Your agronomist's N plan says 166 t of AN for spring. Have you bought any yet? Upload a merchant invoice and I'll fill it in.",
    documentsHint: "Merchant invoices, agronomist N plan",
    fields: [
      { id: "in-need", label: "Spring nitrogen needed", value: "166 t AN", source: "Agronomist N plan · via MCP", confidence: "high" },
      { id: "in-bought", label: "Spring nitrogen bought", value: "0 t", source: "Freshness check", confidence: "check" },
      { id: "in-last", label: "AN price paid last season", value: "£640/t", source: "Merchant invoice 2025", confidence: "high" },
    ],
  },
  {
    id: "support",
    title: "Support payments",
    status: "todo",
    agentMessage: "I read your SFI agreement. The delinked payment is an estimate from last year's statement, so please check it.",
    documentsHint: "SFI agreement, RPA payment statements",
    fields: [
      { id: "su-sfi", label: "SFI agreement", value: "£40k/yr · ends 31 Mar 2027", source: "RPA agreement PDF", confidence: "high" },
      { id: "su-delinked", label: "Delinked payment", value: "£9.6k", source: "RPA statement 2025", confidence: "check" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    status: "todo",
    agentMessage: "Borrowing is from your bank statement. The overdraft limit came from the facility letter. Is £150k still right?",
    documentsHint: "Bank statements, facility letters",
    fields: [
      { id: "fi-loan", label: "Variable loan", value: "£840k at base + 3.1%", source: "Bank statement", confidence: "high" },
      { id: "fi-overdraft", label: "Overdraft limit", value: "£150k", source: "Bank facility letter", confidence: "check" },
      { id: "fi-renewal", label: "Renewal date", value: "14 May 2027", source: "Bank facility letter", confidence: "high" },
    ],
  },
  {
    id: "pnl",
    title: "Profit and loss",
    status: "todo",
    agentMessage: "Typical profit is the average of your last three years, adjusted to today's prices. Check it matches how you think about a normal year.",
    documentsHint: "Accounts for the last three years",
    fields: [
      { id: "pl-typical", label: "Typical profit", value: "£85k", source: "Accounts 2023–25 · Average", confidence: "check" },
      { id: "pl-be", label: "Wheat break-even", value: "£185/t", source: "Accounts 2025", confidence: "high" },
      { id: "pl-fixed", label: "Fixed costs", value: "£312k", source: "Accounts 2025", confidence: "high" },
    ],
  },
];

export const whatIfBaseline = { wheatPrice: 178, fertiliserPrice: 504, yieldPct: 100, rateChange: 0 };

export const whatIfPresets: WhatIfPreset[] = [
  { id: "fert-spike", label: "Fertiliser spike", inputs: { ...whatIfBaseline, fertiliserPrice: 850 } },
  { id: "dry-summer", label: "Dry summer", inputs: { ...whatIfBaseline, yieldPct: 82 } },
  { id: "wheat-slump", label: "Wheat price slump", inputs: { ...whatIfBaseline, wheatPrice: 150 } },
  { id: "rates-up", label: "Rates +1.5 pts", inputs: { ...whatIfBaseline, rateChange: 1.5 } },
];

export const whatIfSliders: WhatIfSlider[] = [
  { key: "wheatPrice", label: "Wheat price", min: 130, max: 240, step: 1, source: "AHDB delivered feed wheat · £178/t · 6 Nov" },
  { key: "fertiliserPrice", label: "AN fertiliser price", min: 300, max: 1000, step: 1, source: "AHDB fertiliser prices · £504/t · Oct" },
  { key: "yieldPct", label: "Yield, all crops", min: 70, max: 115, step: 1, source: "Yield records 2021–25 · 100% = 5-yr average" },
  { key: "rateChange", label: "Bank Rate change", min: -1, max: 2, step: 0.25, source: "Bank of England · You pay base + 3.1%" },
];
