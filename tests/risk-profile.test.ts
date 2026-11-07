import { describe, expect, it } from "vitest";
import { FIELDS, SECTIONS } from "@/lib/profile/catalogue";
import { market, profileFields, signals, SNAPSHOT_AT } from "@/lib/profile/fenland-ridge";
import { makeSnapshot, measureSignal, profileChanges } from "@/lib/profile/risk-profile";
import { formatValue, parseValue } from "@/lib/profile/values";
import { risks } from "@/lib/mock";

const snapshot = makeSnapshot({ id: "s1", version: 1, takenAt: SNAPSHOT_AT, reason: "test", fields: profileFields, market });
const exposure = (id: string) => snapshot.exposures.find((e) => e.riskId === id)!;
const signal = (id: string) => signals.find((s) => s.id === id)!;

describe("catalogue and seed", () => {
  it("gives every seeded value a catalogue field and every field a value", () => {
    const keys = new Set(FIELDS.map((f) => f.key));
    expect(profileFields.filter((f) => !keys.has(f.key))).toEqual([]);
    expect(FIELDS.filter((f) => !profileFields.some((p) => p.key === f.key))).toEqual([]);
  });

  it("puts every field in a known section", () => {
    const ids = new Set(SECTIONS.map((s) => s.id));
    expect(FIELDS.filter((f) => !ids.has(f.section))).toEqual([]);
  });
});

describe("exposures from the snapshot", () => {
  it("agrees with the risk models in the mock assessment", () => {
    const model = (id: string) => risks.find((r) => r.id === id)!.model.exposure;
    expect(Math.round(exposure("output_prices").total / 1000)).toBe(model("output_prices"));
    expect(Math.round(exposure("input_prices").total / 1000)).toBe(model("input_prices"));
    expect(exposure("interest_rates").total / 1000).toBe(model("interest_rates"));
    expect(exposure("regulation").total / 1000).toBe(model("regulation"));
  });

  it("counts 2,898 t of wheat unsold", () => {
    const wheat = exposure("output_prices").sensitivities.find((s) => s.metric === "wheat_feed_gbp_t")!;
    expect(wheat.perUnit).toBe(2898);
  });
});

describe("measuring news against the snapshot", () => {
  it("prices a £6/t wheat fall on 2,898 t", () => {
    const impact = measureSignal(signal("sig-wheat-172"), snapshot);
    expect(impact.delta).toBe(-17_388);
    expect(impact.alert).toBe(true);
  });

  it("prices an £18/t AN rise on 166 t unbought", () => {
    const impact = measureSignal(signal("sig-an-522"), snapshot);
    expect(impact.delta).toBe(-2_988);
    expect(impact.alert).toBe(false);
  });

  it("treats a Bank Rate cut as a saving on variable debt", () => {
    expect(measureSignal(signal("sig-boe-cut"), snapshot).delta).toBe(2_100);
  });

  it("prices a three-month SFI gap", () => {
    expect(measureSignal(signal("sig-sfi-delay"), snapshot).delta).toBe(-10_000);
  });

  it("leaves news without a figure unmeasured", () => {
    const impact = measureSignal(signal("sig-dry-spring"), snapshot);
    expect(impact.delta).toBeNull();
    expect(impact.alert).toBe(false);
  });

  it("measures against the snapshot, not the live profile", () => {
    const sold = profileFields.map((f) => (f.key === "sales.wheat_2026_unsold_t" ? { ...f, value: 828 } : f));
    const v2 = makeSnapshot({ id: "s2", version: 2, takenAt: SNAPSHOT_AT, reason: "sold 200 t", fields: sold, market });
    expect(measureSignal(signal("sig-wheat-172"), snapshot).delta).toBe(-17_388);
    expect(measureSignal(signal("sig-wheat-172"), v2).delta).toBe(-16_188);
    expect(profileChanges(sold, snapshot)).toEqual([
      { key: "sales.wheat_2026_unsold_t", label: "2026 wheat unsold in store", before: "1,028 t", after: "828 t" },
    ]);
  });
});

describe("entering values", () => {
  const def = (key: string) => FIELDS.find((f) => f.key === key)!;
  it.each([
    ["sales.wheat_2026_unsold_t", "1,028 t", 1028],
    ["schemes.sfi_annual", "£40k", 40_000],
    ["fin.loan_margin_pct", "3.1%", 3.1],
    ["pnl.wheat_breakeven", "£185/t", 185],
    ["schemes.sfi_end", "31 Mar 2027", "2027-03-31"],
    ["fin.lender", "  Lloyds Bank plc ", "Lloyds Bank plc"],
    ["fin.overdraft_limit", "", null],
  ])("parses %s from %j", (key, input, expected) => {
    expect(parseValue(def(key), input)).toEqual({ ok: true, value: expected });
  });

  it("rejects text in a number field", () => {
    expect(parseValue(def("inputs.n_bought_t"), "some").ok).toBe(false);
  });

  it("formats values for display", () => {
    expect(formatValue(def("pnl.wheat_breakeven"), 185)).toBe("£185/t");
    expect(formatValue(def("schemes.sfi_annual"), 40000)).toBe("£40,000");
    expect(formatValue(def("crop.wheat.yield_t_ha"), 8.5)).toBe("8.5 t/ha");
    expect(formatValue(def("schemes.sfi_end"), "2027-03-31")).toBe("31 Mar 2027");
  });
});
