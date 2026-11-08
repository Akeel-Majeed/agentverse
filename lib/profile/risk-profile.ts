/**
 * The risk profile: what the farm has at stake for each risk, worked out in code from a
 * frozen profile snapshot, and how each new piece of news changes it. No LLM in here.
 */
import { gbp, num } from "../format";
import type {
  MarketBaseline,
  ProfileChange,
  ProfileFieldValue,
  ProfileSnapshot,
  ProfileValue,
  RiskExposure,
  Signal,
  SignalImpact,
  WorkingStep,
} from "../types";
import { FIELDS, METRICS, fieldsForRisk } from "./catalogue";
import { formatValue } from "./values";

/** News that moves expected profit by at least this much becomes an alert. */
export const ALERT_THRESHOLD = 5_000;

type Values = Record<string, ProfileValue>;

const n = (v: Values, key: string) => {
  const x = Number(v[key] ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const t = (x: number) => `${num(Math.round(x))} t`;
const price = (m: MarketBaseline, id: keyof MarketBaseline) => m[id]?.value ?? 0;
const keysFor = (risk: RiskExposure["riskId"]) => fieldsForRisk(risk).map((f) => f.key);

function outputPrices(v: Values, m: MarketBaseline): RiskExposure {
  const crop27 = (id: string) => Math.max(0, n(v, `crop.${id}.area_ha`) * n(v, `crop.${id}.yield_t_ha`) - n(v, `sales.${id}_2027_forward_t`));
  const wheat = n(v, "sales.wheat_2026_unsold_t") + crop27("wheat");
  const barley = n(v, "sales.barley_2026_unsold_t") + crop27("barley");
  const osr = crop27("osr");
  const pw = price(m, "wheat_feed_gbp_t");
  const pb = price(m, "barley_feed_gbp_t");
  const po = price(m, "osr_gbp_t");
  const total = wheat * pw + barley * pb + osr * po;
  return {
    riskId: "output_prices",
    total,
    summary: `${gbp(total)} of crop unsold: ${t(wheat)} wheat, ${t(barley)} barley, ${t(osr)} rape.`,
    working: [
      { label: "wheat_unsold = 2026 in store + 2027 crop − sold forward", value: t(wheat) },
      { label: "barley_unsold = 2026 in store + 2027 crop − sold forward", value: t(barley) },
      { label: "rape_unsold = 2027 crop − sold forward", value: t(osr) },
      { label: `prices: wheat £${pw}/t, barley £${pb}/t, rape £${po}/t`, value: "snapshot" },
      { label: "crop_value_unsold = Σ tonnes × price", value: gbp(total) },
    ],
    sensitivities: [
      { metric: "wheat_feed_gbp_t", label: `${t(wheat)} of wheat unsold`, perUnit: wheat, unit: "£/t" },
      { metric: "barley_feed_gbp_t", label: `${t(barley)} of barley unsold`, perUnit: barley, unit: "£/t" },
      { metric: "osr_gbp_t", label: `${t(osr)} of rape unsold`, perUnit: osr, unit: "£/t" },
    ],
    fieldKeys: keysFor("output_prices"),
  };
}

function inputPrices(v: Values, m: MarketBaseline): RiskExposure {
  const nT = Math.max(0, n(v, "inputs.n_need_t") - n(v, "inputs.n_bought_t"));
  const dieselL = n(v, "inputs.diesel_l") * (1 - n(v, "inputs.diesel_bought_pct") / 100);
  const sprays = n(v, "inputs.spray_gbp_ha") * n(v, "land.area_ha") * (1 - n(v, "inputs.spray_bought_pct") / 100);
  const an = price(m, "an_gbp_t");
  const ppl = price(m, "diesel_ppl");
  const total = nT * an + (dieselL * ppl) / 100 + sprays;
  return {
    riskId: "input_prices",
    total,
    summary: `${gbp(total)} of inputs unbought: ${t(nT)} nitrogen, ${num(Math.round(dieselL))} L diesel, ${gbp(sprays)} of sprays.`,
    working: [
      { label: `nitrogen_unbought = needed − bought, × £${an}/t`, value: gbp(nT * an) },
      { label: `diesel_unbought = litres × (1 − bought %), × ${ppl}p/L`, value: gbp((dieselL * ppl) / 100) },
      { label: "sprays_unbought = £/ha × area × (1 − bought %)", value: gbp(sprays) },
      { label: "inputs_unbought", value: gbp(total) },
      { label: "grain drying energy (no market link yet)", value: "not counted" },
    ],
    sensitivities: [
      { metric: "an_gbp_t", label: `${t(nT)} of nitrogen unbought`, perUnit: -nT, unit: "£/t" },
      { metric: "diesel_ppl", label: `${num(Math.round(dieselL))} L of diesel unbought`, perUnit: -dieselL / 100, unit: "p/L" },
    ],
    fieldKeys: keysFor("input_prices"),
  };
}

function weatherYield(v: Values, m: MarketBaseline): RiskExposure {
  const revenue = (id: string, p: number) => n(v, `crop.${id}.area_ha`) * n(v, `crop.${id}.yield_t_ha`) * p;
  const total =
    revenue("wheat", price(m, "wheat_feed_gbp_t")) + revenue("barley", price(m, "barley_feed_gbp_t")) + revenue("osr", price(m, "osr_gbp_t"));
  return {
    riskId: "weather_yield",
    total,
    summary: `${gbp(total)} of 2027 crop revenue across ${num(n(v, "land.area_ha"))} ha; each 1% of yield is worth ${gbp(total / 100)}.`,
    working: [
      { label: "farmed_area", value: `${num(n(v, "land.area_ha"))} ha` },
      { label: "land_in_flood_zone", value: `${num(n(v, "land.flood_zone_pct"))}%` },
      { label: "crop_revenue = Σ area × yield × price", value: gbp(total) },
      { label: "per_1pct_yield = crop_revenue ÷ 100", value: gbp(total / 100) },
    ],
    sensitivities: [{ metric: "yield_outlook_pct", label: `${gbp(total)} of crop revenue`, perUnit: total / 100, unit: "%" }],
    fieldKeys: keysFor("weather_yield"),
  };
}

function regulation(v: Values): RiskExposure {
  const sfi = n(v, "schemes.sfi_annual");
  const end = v["schemes.sfi_end"];
  return {
    riskId: "regulation",
    total: sfi,
    summary: `${gbp(sfi)} a year of SFI payments${end ? `, agreement ends ${formatValue({ type: "date" }, end)}` : ""}; ${num(n(v, "reg.glyphosate_ha"))} ha relies on glyphosate.`,
    working: [
      { label: "sfi_payments_a_year", value: gbp(sfi) },
      { label: "sfi_agreement_ends", value: end ? formatValue({ type: "date" }, end) : "not recorded" },
      { label: "per_month_without_payments = sfi ÷ 12", value: gbp(sfi / 12) },
      { label: "delinked payment (phasing out, in expected profit)", value: gbp(n(v, "schemes.delinked")) },
      { label: "area_relying_on_glyphosate (no £ figure yet)", value: `${num(n(v, "reg.glyphosate_ha"))} ha` },
    ],
    sensitivities: [{ metric: "sfi_gap_months", label: `${gbp(sfi)} a year of SFI payments`, perUnit: -sfi / 12, unit: "months" }],
    fieldKeys: keysFor("regulation"),
  };
}

function interestRates(v: Values): RiskExposure {
  // Variable, tracker and base- or SONIA-linked loans all move with Bank Rate.
  const variable = /variable|tracker|base|sonia/i.test(String(v["fin.loan_rate_type"] ?? ""));
  const debt = variable ? n(v, "fin.loan") : 0;
  return {
    riskId: "interest_rates",
    total: debt,
    summary: `${gbp(debt)} of variable borrowing at Bank Rate + ${num(n(v, "fin.loan_margin_pct"), 1)}%; each 1-point rise costs ${gbp(debt / 100)} a year.`,
    working: [
      { label: "variable_debt", value: gbp(debt) },
      { label: "margin_over_bank_rate", value: `${num(n(v, "fin.loan_margin_pct"), 1)}%` },
      { label: "per_1pt_rise = variable_debt × 1%", value: gbp(debt / 100) },
      { label: "overdraft at peak (not counted until the limit is confirmed)", value: gbp(n(v, "fin.overdraft_peak")) },
    ],
    sensitivities: [{ metric: "bank_rate_pct", label: `${gbp(debt)} of variable debt`, perUnit: -debt / 100, unit: "points" }],
    fieldKeys: keysFor("interest_rates"),
  };
}

export function computeExposures(values: Values, market: MarketBaseline): RiskExposure[] {
  return [outputPrices(values, market), inputPrices(values, market), weatherYield(values, market), regulation(values), interestRates(values)];
}

export const valuesOf = (fields: ProfileFieldValue[]): Values => Object.fromEntries(fields.map((f) => [f.key, f.value]));

export function makeSnapshot(args: {
  id: string;
  version: number;
  takenAt: string;
  reason: string;
  fields: ProfileFieldValue[];
  market: MarketBaseline;
}): ProfileSnapshot {
  const values = valuesOf(args.fields);
  return {
    id: args.id,
    version: args.version,
    takenAt: args.takenAt,
    reason: args.reason,
    fields: values,
    market: args.market,
    exposures: computeExposures(values, args.market),
  };
}

const metricValue = (unit: string, x: number) =>
  unit === "£/t" ? `£${num(x, x % 1 ? 2 : 0)}/t` : unit === "p/L" ? `${num(x, 1)}p/L` : unit === "%" ? `${num(x, 2)}%` : `${num(x)} ${unit}`;

/**
 * Measure one piece of news: change in the figure × what the farm has exposed to it. The change
 * is from `previous` (earlier news on the same figure) if given, else from the snapshot; the
 * alert is on the move since the snapshot.
 */
export function measureSignal(signal: Signal, snapshot: ProfileSnapshot, previous?: Signal): SignalImpact {
  const base = signal.metric ? snapshot.market[signal.metric] : undefined;
  const sens = snapshot.exposures.flatMap((e) => e.sensitivities).find((s) => s.metric === signal.metric);
  if (!signal.metric || signal.value == null || !base || !sens) {
    return {
      signal,
      snapshotVersion: snapshot.version,
      delta: null,
      working: [{ label: "No figure in this news to measure yet", value: "for context" }],
      alert: false,
    };
  }
  const unit = METRICS[signal.metric]?.unit ?? base.unit;
  const from = previous?.value ?? base.value;
  const change = signal.value - from;
  // Differences of rounded totals, so a run of news adds up exactly to latest vs snapshot.
  const sinceSnapshot = Math.round((signal.value - base.value) * sens.perUnit);
  const delta = sinceSnapshot - Math.round((from - base.value) * sens.perUnit);
  const working: WorkingStep[] = [
    { label: previous ? `${signal.metric} after “${previous.title}”` : `${signal.metric} in snapshot v${snapshot.version}`, value: metricValue(unit, from) },
    { label: `${signal.metric} now`, value: metricValue(unit, signal.value) },
    { label: "change", value: `${change > 0 ? "+" : change < 0 ? "−" : ""}${metricValue(unit, Math.abs(change))}` },
    { label: `exposed: ${sens.label}`, value: `${gbp(sens.perUnit, { sign: true })} per ${unit === "£/t" ? "£1/t" : unit === "p/L" ? "1p/L" : `1 ${unit === "%" ? "point" : unit.replace(/s$/, "")}`}` },
    { label: "profit_change = change × exposed", value: gbp(delta, { sign: true }) },
    ...(previous ? [{ label: `since snapshot v${snapshot.version} = (now − snapshot) × exposed`, value: gbp(sinceSnapshot, { sign: true }) }] : []),
  ];
  return { signal, snapshotVersion: snapshot.version, delta, working, alert: Math.abs(sinceSnapshot) >= ALERT_THRESHOLD };
}

/** Measure news in time order, each against the news before it on the same figure. Returns them in the order given. */
export function measureSignals(signals: Signal[], snapshot: ProfileSnapshot): SignalImpact[] {
  const latest = new Map<string, Signal>();
  const measured = new Map<string, SignalImpact>();
  for (const s of [...signals].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))) {
    measured.set(s.id, measureSignal(s, snapshot, s.metric ? latest.get(s.metric) : undefined));
    if (s.metric && s.value != null) latest.set(s.metric, s);
  }
  return signals.map((s) => measured.get(s.id)!);
}

/** Fields that differ between the live profile and the snapshot, in catalogue order. */
export function profileChanges(fields: ProfileFieldValue[], snapshot: ProfileSnapshot): ProfileChange[] {
  const now = valuesOf(fields);
  return FIELDS.flatMap((def) => {
    const before = snapshot.fields[def.key] ?? null;
    const after = now[def.key] ?? null;
    if (String(before ?? "") === String(after ?? "")) return [];
    return [
      {
        key: def.key,
        label: def.label,
        before: formatValue(def, before) || "Not recorded",
        after: formatValue(def, after) || "Not recorded",
      },
    ];
  });
}

