import { describe, expect, it } from "vitest";
import { syncFormValues } from "@/lib/profile/values";

describe("profile form after the server's values change", () => {
  const before = { "sales.wheat_2026_unsold_t": "1,028 t", "fin.lender": "" };
  const after = { "sales.wheat_2026_unsold_t": "828 t", "fin.lender": "" };

  it("takes an approved value the farmer hasn't touched", () => {
    expect(syncFormValues(before, before, after)["sales.wheat_2026_unsold_t"]).toBe("828 t");
  });

  it("keeps what the farmer is typing", () => {
    const form = { ...before, "fin.lender": "Lloyds" };
    expect(syncFormValues(form, before, after)).toEqual({ "sales.wheat_2026_unsold_t": "828 t", "fin.lender": "Lloyds" });
  });
});
