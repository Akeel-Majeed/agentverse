import type { MarketBaseline, ProfileValue } from "../types";
import type { FarmInputs } from "./types";

/** Profile values → P&L inputs. Missing numbers become 0 and are listed so the UI can say so. */
export function farmFromProfile(values: Record<string, ProfileValue>, market: MarketBaseline): { farm: FarmInputs; missing: string[] } {
  const missing: string[] = [];
  const n = (key: string): number => {
    const v = values[key];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    missing.push(key);
    return 0;
  };
  const m = (id: keyof MarketBaseline, fallback: number): number => {
    const f = market[id];
    if (f) return f.value;
    missing.push(`market.${id}`);
    return fallback;
  };
  const crop = (c: "wheat" | "barley" | "osr") => ({
    areaHa: n(`crop.${c}.area_ha`),
    yieldTHa: n(`crop.${c}.yield_t_ha`),
    forwardT: n(`sales.${c}_2027_forward_t`),
  });
  const farm: FarmInputs = {
    crops: { wheat: crop("wheat"), barley: crop("barley"), osr: crop("osr") },
    stockT: { wheat: n("sales.wheat_2026_unsold_t"), barley: n("sales.barley_2026_unsold_t"), osr: 0 },
    priceToday: {
      wheat: m("wheat_feed_gbp_t", 178),
      barley: m("barley_feed_gbp_t", 165),
      osr: m("osr_gbp_t", 452),
      an: m("an_gbp_t", 504),
      fuel: m("diesel_ppl", 70),
    },
    anNeedT: n("inputs.n_need_t"),
    anBoughtT: n("inputs.n_bought_t"),
    anPricePaid: n("inputs.n_price_paid"),
    dieselL: n("inputs.diesel_l"),
    dieselBoughtPct: n("inputs.diesel_bought_pct"),
    sprayGbp: n("inputs.spray_gbp_ha") * n("land.area_ha"),
    sfiAnnual: n("schemes.sfi_annual"),
    fixedCosts: n("pnl.fixed_costs"),
    loan: n("fin.loan"),
    loanVariable: String(values["fin.loan_rate_type"] ?? "").toLowerCase().startsWith("variable"),
    loanMarginPct: n("fin.loan_margin_pct"),
    bankRatePct: m("bank_rate_pct", 3.75),
    capitalRepayment: n("fin.capital_repayment"),
  };
  return { farm, missing };
}
