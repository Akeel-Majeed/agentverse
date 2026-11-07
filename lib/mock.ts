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
/** Whole-farm standard deviation of profit, £k. Every risk page and the overall score reconcile to it. */
export const FARM_SD_K = Math.sqrt(WHEAT_SD_K ** 2 + OTHER_SD_K ** 2);

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
  marketDataDate: "2026-11-06",
  farmInputsConfirmed: "2026-10-12",
  sampleData: true,
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
    group: "Prices",
    dataQuality: {
      quality: "unconfirmed",
      note: "2027 forward sales are assumed to be 0 t because no contracts were found, and a reported sale of 200 t is waiting for your approval.",
    },
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
      { label: "2026 wheat unsold: 1,028 t", origin: "GRAIN STORE SHEET · ONBOARDING", date: "12 Oct 2026" },
      { label: "2027 wheat expected: 1,870 t (220 ha × 8.5 t/ha)", origin: "CROPPING PLAN · ONBOARDING", date: "12 Oct 2026" },
      { label: "Feed wheat, delivered: £178/t", origin: "AHDB DELIVERED PRICES", date: "06 Nov 2026" },
      { label: "Price volatility: £20/t standard deviation", origin: "AHDB 10-YR HISTORY · HEADWIND MODEL" },
      { label: "Wheat break-even: £185/t", origin: "ACCOUNTS 2025 · UPLOAD", date: "14 Oct 2026" },
      { label: "Minimum-price premium: ~£8/t", origin: "MERCHANT QUOTE · FROM YOUR ADVISER'S CONNECTED SERVICE", date: "05 Nov 2026" },
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
        actionLabel: "Compare min-price contracts",
        deadlineId: "sell-minprice",
        effect: { tonnesRemoved: 935, meanCost: 7.5 },
      },
      {
        id: "wheat-sell-2026",
        title: "Sell 20% more of the 2026 crop",
        description: "Move 374 t from store at today's £178/t before the 20 Nov movement date.",
        cost: "No premium · locks in £178/t",
        status: "suggested",
        actionLabel: "Review the 2026 wheat sale",
        deadlineId: "sell-move",
        effect: { tonnesRemoved: 374 },
      },
      {
        id: "wheat-forward-30",
        title: "Sell 30% of the 2027 crop forward",
        description: "Fixed-price contract on 561 t for harvest 2027 delivery.",
        cost: "No premium · gives up upside on 561 t",
        status: "suggested",
        actionLabel: "Compare forward contracts",
        deadlineId: "sell-minprice",
        effect: { tonnesRemoved: 561 },
      },
    ],
  }),
  risk({
    id: "weather-yield",
    name: "Weather and yield",
    group: "Weather",
    dataQuality: {
      quality: "unconfirmed",
      note: "The oilseed rape yield estimate has a proposed update (3.4 → 3.1 t/ha) waiting for your approval.",
    },
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
      { label: "Farmed area: 450 ha", origin: "RPA LAND PARCELS", date: "12 Oct 2026" },
      { label: "Yield swing: £78/ha standard deviation", origin: "YIELD RECORDS 2021–25 · UPLOAD" },
      { label: "Soil moisture: normal", origin: "MET OFFICE · LINCS", date: "06 Nov 2026" },
      { label: "Index insurance quote: ~£4.2k/yr", origin: "BROKER QUOTE · FROM YOUR ADVISER'S CONNECTED SERVICE", date: "02 Nov 2026" },
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
        actionLabel: "Compare index insurance",
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
    group: "Prices",
    dataQuality: {
      quality: "stale",
      note: "Spring nitrogen bought (0 t) was last confirmed 41 days ago, on 27 Sep 2026.",
    },
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
      { label: "Spring N needed: 166 t AN", origin: "AGRONOMIST N PLAN · FROM YOUR ADVISER'S CONNECTED SERVICE", date: "20 Oct 2026" },
      { label: "Spring N bought: 0 t", origin: "LAST CONFIRMED BY YOU · 41 DAYS AGO", date: "27 Sep 2026" },
      { label: "AN price: £504/t", origin: "AHDB FERTILISER PRICES", date: "Oct 2026" },
      { label: "Price volatility: £91/t standard deviation", origin: "AHDB 10-YR HISTORY · HEADWIND MODEL" },
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
        actionLabel: "Review nitrogen buying",
        deadlineId: "in-ndeliver",
        effect: { tonnesRemoved: 83, meanCost: 0.6 },
      },
      {
        id: "fert-fixed-pod",
        title: "Fixed price, pay on delivery for the rest",
        description: "Ask the merchant to fix the other 83 t now and invoice in March.",
        cost: "~£11/t above spot",
        status: "suggested",
        actionLabel: "Ask about pay-on-delivery",
        deadlineId: "in-ndeliver",
        effect: { tonnesRemoved: 83, meanCost: 0.9 },
      },
    ],
  }),
  risk({
    id: "scheme-payments",
    name: "Scheme payments",
    group: "Schemes",
    dataQuality: { quality: "confirmed", note: "SFI agreement read from your upload and confirmed on 12 Oct 2026." },
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
      { label: "SFI agreement: £40k/yr, ends 31 Mar 2027", origin: "RPA AGREEMENT PDF · UPLOAD", date: "12 Oct 2026" },
      { label: "Next offer window: expected Jan–Mar 2027", origin: "DEFRA ANNOUNCEMENT · READ BY HEADWIND", date: "28 Oct 2026" },
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
        actionLabel: "Plan the SFI application",
        deadlineId: "sch-end",
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
    group: "Finance",
    dataQuality: { quality: "confirmed", note: "Variable borrowing read from your bank statement and confirmed on 12 Oct 2026." },
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
      { label: "Variable borrowing: £840k at base + 3.1%", origin: "BANK STATEMENT · UPLOAD", date: "12 Oct 2026" },
      { label: "Loan renewal: 14 May 2027", origin: "BANK FACILITY LETTER · UPLOAD", date: "12 Oct 2026" },
      { label: "Typical secured farm margin: 1.3–1.8%", origin: "LENDER SURVEY · READ BY HEADWIND", date: "Oct 2026" },
      { label: "Bank Rate expectations", origin: "BANK OF ENGLAND · MARKET CURVE", date: "06 Nov 2026" },
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
        actionLabel: "Compare lender margins",
        deadlineId: "fin-renewal",
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
        actionLabel: "Compare fixed rates",
        deadlineId: "fin-renewal",
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
    { label: "Expected profit (3-year average, adjusted to today's prices)", value: "£85k", formula: "expected_profit" },
    { label: "Typical swing from wheat price (2,898 t × £20/t)", value: `£${Math.round(WHEAT_SD_K)}k`, formula: "wheat_sd = 2,898 t × £20/t" },
    { label: "Typical swing from all other risks", value: `£${OTHER_SD_K}k`, formula: "other_risks_sd" },
    { label: "Whole-farm typical swing (risks don't all peak together)", value: `£${Math.round(FARM_SD_K)}k`, formula: "farm_sd = √(wheat_sd² + other_risks_sd²)" },
    { label: "Profit in an estimated 1-in-20 bad year", value: "−£47k", formula: "bad_year = expected − 1.65 × farm_sd" },
    { label: "Profit in an estimated 1-in-20 good year", value: "£217k", formula: "good_year = expected + 1.65 × farm_sd" },
    { label: "Modelled chance of a loss (about 3 years in 20)", value: "14%", formula: "loss_chance = Φ(−expected ÷ farm_sd)" },
    { label: "Change vs last week (wheat −£4/t, AN +£18/t)", value: "−£9k", formula: "delta_week" },
  ],
  sources: [
    { label: "Profit and loss 2023–2025", origin: "ACCOUNTS · UPLOAD", date: "14 Oct 2026" },
    { label: "Feed wheat, delivered: £178/t", origin: "AHDB DELIVERED PRICES", date: "06 Nov 2026" },
    { label: "AN price: £504/t", origin: "AHDB FERTILISER PRICES", date: "Oct 2026" },
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
    riskId: "fertiliser-price",
    impact: "Fertiliser price uses 166 t unbought. Confirming keeps that; updating it changes the tonnes exposed.",
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
    riskId: "weather-yield",
    impact: "Lowers expected oilseed rape output by 30 t (100 ha × 0.3 t/ha). Used in Weather and yield.",
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
    riskId: "wheat-price",
    impact: "Wheat price: tonnes exposed would fall by 200 t, from 2,898 t to 2,698 t.",
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
    riskId: "interest-rates",
    impact: "Recorded for finance. Doesn't change any score on its own.",
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
    riskId: "interest-rates",
    impact: "Recorded for cash-flow planning. Doesn't change any score on its own.",
  },
];

export const calendar: CalendarItem[] = [
  { id: "sell-store", lane: "Selling", kind: "period", start: "2026-11-01", end: "2027-03-31", label: "2026 wheat in store", certainty: "confirmed", source: "Grain store sheet", riskId: "wheat-price", why: "1,028 t of 2026 wheat is unsold in store and moves with the market until it is sold." },
  { id: "sell-move", lane: "Selling", kind: "key", start: "2026-11-20", label: "Wheat movement: 1,028 t, sell or store", certainty: "confirmed", source: "Merchant movement slot", riskId: "wheat-price", why: "Your next selling decision. Selling now locks in £178/t, £7 under break-even; storing keeps the price risk on." },
  { id: "sell-osr", lane: "Selling", kind: "deadline", start: "2027-01-15", label: "OSR forward offer expires", certainty: "confirmed", source: "Merchant offer", why: "After this date the current forward price for 2027 oilseed rape is no longer available." },
  { id: "sell-minprice", lane: "Selling", kind: "deadline", start: "2027-03-31", label: "Min-price offers for 2027 wheat close", certainty: "expected", source: "Merchant quote (typical closing date)", riskId: "wheat-price", why: "The minimum-price contract that takes wheat from 10 to 8 is only offered until about this date." },
  { id: "sell-harvest", lane: "Selling", kind: "period", start: "2027-07-20", end: "2027-09-05", label: "Harvest 2027", certainty: "expected", source: "Cropping plan", riskId: "weather-yield", why: "When the 2027 crop, and the weather risk on it, is finally known." },
  { id: "in-nwindow", lane: "Inputs", kind: "period", start: "2026-12-01", end: "2027-02-15", label: "Spring N buying window", certainty: "expected", source: "Agronomist N plan", riskId: "fertiliser-price", why: "The usual window to buy 166 t of spring nitrogen before prices tend to firm." },
  { id: "in-ndeliver", lane: "Inputs", kind: "deadline", start: "2027-02-15", label: "Last AN delivery for first split", certainty: "expected", source: "Agronomist N plan", riskId: "fertiliser-price", why: "Nitrogen not bought by now is exposed to the spring price, whatever it is." },
  { id: "in-drill", lane: "Inputs", kind: "period", start: "2027-03-01", end: "2027-04-15", label: "Barley drilling", certainty: "expected", source: "Cropping plan", riskId: "weather-yield", why: "Splitting drilling across two windows reduces the chance one dry spell hits all the barley." },
  { id: "in-seed", lane: "Inputs", kind: "deadline", start: "2027-08-16", label: "Order OSR seed", certainty: "expected", source: "Cropping plan", why: "Seed for the 2028 rape crop needs ordering before drilling in late August." },
  { id: "fin-vat", lane: "Finance", kind: "deadline", start: "2027-02-07", label: "VAT return", certainty: "confirmed", source: "HMRC quarterly schedule", why: "Quarterly VAT return and payment due." },
  { id: "fin-overdraft", lane: "Finance", kind: "period", tone: "warning", start: "2027-04-01", end: "2027-08-31", label: "Overdraft peak ~£150k", certainty: "expected", source: "Headwind cash-flow estimate", riskId: "interest-rates", why: "Spring inputs are paid before harvest income arrives, so the overdraft is expected to be close to its £150k limit." },
  { id: "fin-renewal", lane: "Finance", kind: "deadline", start: "2027-05-14", label: "Loan renewal: £840k variable", certainty: "confirmed", source: "Bank facility letter", riskId: "interest-rates", why: "The chance to renegotiate your 3.1% margin or fix part of the loan." },
  { id: "fin-ct", lane: "Finance", kind: "deadline", start: "2027-10-01", label: "Corporation tax due", certainty: "confirmed", source: "Company year end", why: "Corporation tax for the 2025–26 accounts is due." },
  { id: "sch-sfi", lane: "Schemes", kind: "period", start: "2026-11-01", end: "2027-03-31", label: "SFI agreement, final months", certainty: "confirmed", source: "RPA agreement", riskId: "scheme-payments", why: "The last months of £40k-a-year support under the current agreement." },
  { id: "sch-delinked", lane: "Schemes", kind: "deadline", start: "2026-12-15", label: "Delinked payment expected", certainty: "expected", source: "RPA payment statement 2025", riskId: "scheme-payments", why: "About £9.6k is expected, based on last year's statement. The exact date and amount are not confirmed." },
  { id: "sch-window", lane: "Schemes", kind: "period", start: "2027-01-11", end: "2027-03-12", label: "Next SFI window (expected)", certainty: "expected", source: "Defra announcement", riskId: "scheme-payments", why: "Applying in this window would protect roughly half the support income at risk." },
  { id: "sch-end", lane: "Schemes", kind: "deadline", start: "2027-03-31", label: "SFI agreement ends", certainty: "confirmed", source: "RPA agreement", riskId: "scheme-payments", why: "Payments stop after this date unless a new agreement is in place." },
  { id: "mkt-boe-dec", lane: "Markets", kind: "deadline", start: "2026-12-17", label: "Bank Rate decision", certainty: "market", source: "Bank of England schedule", riskId: "interest-rates", why: "A change in Bank Rate moves the cost of your £840k variable borrowing." },
  { id: "mkt-wasde", lane: "Markets", kind: "deadline", start: "2027-01-12", label: "USDA WASDE: final US crop", certainty: "market", source: "USDA schedule", riskId: "wheat-price", why: "A major world supply report that often moves wheat prices." },
  { id: "mkt-boe-feb", lane: "Markets", kind: "deadline", start: "2027-02-04", label: "Bank Rate decision", certainty: "market", source: "Bank of England schedule", riskId: "interest-rates", why: "A change in Bank Rate moves the cost of your £840k variable borrowing." },
  { id: "mkt-ahdb", lane: "Markets", kind: "deadline", start: "2027-03-04", label: "AHDB planting survey", certainty: "market", source: "AHDB schedule", riskId: "wheat-price", why: "Shows how much wheat UK farms have planted, which can move the 2027 price." },
  { id: "mkt-boe-may", lane: "Markets", kind: "deadline", start: "2027-05-06", label: "Bank Rate decision", certainty: "market", source: "Bank of England schedule", riskId: "interest-rates", why: "Falls a week before your loan renewal, so it sets the rate backdrop for that conversation." },
  { id: "mkt-boe-aug", lane: "Markets", kind: "deadline", start: "2027-08-05", label: "Bank Rate decision", certainty: "market", source: "Bank of England schedule", riskId: "interest-rates", why: "A change in Bank Rate moves the cost of your £840k variable borrowing." },
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
    ifMissing: "Area and location set the scale of every risk. Tenure is still to check; it doesn't change any score yet.",
    fields: [
      { id: "fb-name", label: "Business name", value: "Fenland Ridge Farm Ltd", source: "COMPANIES HOUSE", confidence: "high" },
      { id: "fb-location", label: "Location", value: "Near Sleaford, Lincolnshire", source: "ONBOARDING CHAT", confidence: "high" },
      { id: "fb-area", label: "Farmed area", value: "450 ha", source: "RPA LAND PARCELS", confidence: "high" },
      { id: "fb-tenure", label: "Tenure", value: "390 ha owned, 60 ha FBT", source: "ONBOARDING CHAT", confidence: "check" },
    ],
  },
  {
    id: "cropping",
    title: "Cropping plan",
    status: "confirmed",
    agentMessage: "Areas are from your cropping plan; yields are your five-year averages. The rape yield came from your agronomist's adviser agent.",
    documentsHint: "Cropping plan, yield records, agronomist reports",
    ifMissing: "Crop areas and yields drive the wheat tonnes exposed and the weather risk. The rape yield is unconfirmed.",
    fields: [
      { id: "cp-wheat", label: "Winter wheat", value: "220 ha · 8.5 t/ha", source: "CROPPING PLAN UPLOAD", confidence: "high" },
      { id: "cp-barley", label: "Spring barley", value: "130 ha · 6.0 t/ha", source: "YIELD RECORDS 2021–25", confidence: "high" },
      { id: "cp-osr", label: "Oilseed rape", value: "100 ha · 3.4 t/ha", source: "FROM YOUR ADVISER'S CONNECTED SERVICE", confidence: "check" },
    ],
  },
  {
    id: "sales",
    title: "Sales position",
    status: "review",
    agentMessage: "I read your grain store sheet. Can you check the 2027 line? I couldn't find any forward contracts, so I've assumed nothing is sold yet.",
    documentsHint: "Grain store sheet, merchant contracts",
    ifMissing: "Until you confirm forward sales, Headwind assumes none, so the wheat price risk may be overstated.",
    fields: [
      { id: "sp-2026", label: "2026 wheat unsold", value: "1,028 t", source: "GRAIN STORE SHEET", confidence: "high" },
      { id: "sp-2027", label: "2027 wheat sold forward", value: "0 t", source: "ASSUMED · NO CONTRACTS FOUND", confidence: "check" },
      { id: "sp-barley", label: "2026 barley unsold", value: "0 t", source: "GRAIN STORE SHEET", confidence: "high" },
      { id: "sp-osr", label: "2027 OSR sold forward", value: "0 t", source: "ASSUMED · NO CONTRACTS FOUND", confidence: "check" },
    ],
  },
  {
    id: "inputs",
    title: "Inputs",
    status: "todo",
    agentMessage: "Your agronomist's N plan says 166 t of AN for spring. Have you bought any yet? Upload a merchant invoice and I'll fill it in.",
    documentsHint: "Merchant invoices, agronomist N plan",
    ifMissing: "Until you confirm how much nitrogen is bought, the fertiliser risk assumes none is, using a figure 41 days old.",
    fields: [
      { id: "in-need", label: "Spring nitrogen needed", value: "166 t AN", source: "AGRONOMIST N PLAN · FROM YOUR ADVISER'S CONNECTED SERVICE", confidence: "high" },
      { id: "in-bought", label: "Spring nitrogen bought", value: "0 t", source: "FRESHNESS CHECK", confidence: "check" },
      { id: "in-last", label: "AN price paid last season", value: "£640/t", source: "MERCHANT INVOICE 2025", confidence: "high" },
    ],
  },
  {
    id: "support",
    title: "Support payments",
    status: "todo",
    agentMessage: "I read your SFI agreement. The delinked payment is an estimate from last year's statement, so please check it.",
    documentsHint: "SFI agreement, RPA payment statements",
    ifMissing: "The delinked payment is estimated from last year. It affects cash flow, not the scheme score.",
    fields: [
      { id: "su-sfi", label: "SFI agreement", value: "£40k/yr · ends 31 Mar 2027", source: "RPA AGREEMENT PDF", confidence: "high" },
      { id: "su-delinked", label: "Delinked payment", value: "£9.6k", source: "RPA STATEMENT 2025", confidence: "check" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    status: "todo",
    agentMessage: "Borrowing is from your bank statement. The overdraft limit came from the facility letter. Is £150k still right?",
    documentsHint: "Bank statements, facility letters",
    ifMissing: "The overdraft limit is used for the cash-flow peak in the calendar. Borrowing is already confirmed.",
    fields: [
      { id: "fi-loan", label: "Variable loan", value: "£840k at base + 3.1%", source: "BANK STATEMENT", confidence: "high" },
      { id: "fi-overdraft", label: "Overdraft limit", value: "£150k", source: "BANK FACILITY LETTER", confidence: "check" },
      { id: "fi-renewal", label: "Renewal date", value: "14 May 2027", source: "BANK FACILITY LETTER", confidence: "high" },
    ],
  },
  {
    id: "pnl",
    title: "Profit and loss",
    status: "todo",
    agentMessage: "Typical profit is the average of your last three years, adjusted to today's prices. Check it matches how you think about a normal year.",
    documentsHint: "Accounts for the last three years",
    ifMissing: "Typical profit is the yardstick for every score. If it is wrong, every score and the overall score shift.",
    fields: [
      { id: "pl-typical", label: "Typical profit", value: "£85k", source: "ACCOUNTS 2023–25 · AVERAGE", confidence: "check" },
      { id: "pl-be", label: "Wheat break-even", value: "£185/t", source: "ACCOUNTS 2025", confidence: "high" },
      { id: "pl-fixed", label: "Fixed costs", value: "£312k", source: "ACCOUNTS 2025", confidence: "high" },
    ],
  },
];

export const whatIfBaseline = { wheatPrice: 178, fertiliserPrice: 504, yieldPct: 100, rateChange: 0 };

export const whatIfPresets: WhatIfPreset[] = [
  { id: "fert-spike", label: "Fertiliser spike", inputs: { ...whatIfBaseline, fertiliserPrice: 850 }, changes: "AN fertiliser £504 → £850/t" },
  { id: "dry-summer", label: "Dry summer", inputs: { ...whatIfBaseline, yieldPct: 82 }, changes: "Yield, all crops 100% → 82%" },
  { id: "wheat-slump", label: "Wheat price slump", inputs: { ...whatIfBaseline, wheatPrice: 150 }, changes: "Wheat £178 → £150/t" },
  { id: "rates-up", label: "Rates +1.5 pts", inputs: { ...whatIfBaseline, rateChange: 1.5 }, changes: "Bank Rate +1.5 points" },
];

export const whatIfSliders: WhatIfSlider[] = [
  { key: "wheatPrice", label: "Wheat price", min: 130, max: 240, step: 1, unit: "£/t", source: "AHDB delivered feed wheat, £178/t on 6 Nov 2026" },
  { key: "fertiliserPrice", label: "AN fertiliser price", min: 300, max: 1000, step: 1, unit: "£/t", source: "AHDB fertiliser prices, £504/t in Oct 2026" },
  { key: "yieldPct", label: "Yield, all crops", min: 70, max: 115, step: 1, unit: "%", source: "Your yield records 2021–25; 100% is the five-year average" },
  { key: "rateChange", label: "Bank Rate change", min: -1, max: 2, step: 0.25, unit: "pts", source: "Bank of England; you pay Bank Rate + 3.1% on £840k" },
];
