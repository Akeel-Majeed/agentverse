import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIELDS } from "@/lib/profile/catalogue";
import { profileProblems } from "@/lib/profile/checks";
import { profileFields } from "@/lib/profile/fenland-ridge";
import { valuesOf } from "@/lib/profile/risk-profile";
import { parseValue } from "@/lib/profile/values";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const def = (key: string) => FIELDS.find((f) => f.key === key)!;

describe("parsing what the farmer types", () => {
  it.each([
    ["schemes.sfi_end", "31/03/2027", "2027-03-31"],
    ["schemes.sfi_end", "03/04/2027", "2027-04-03"], // UK order: 3 April, never 4 March
    ["schemes.sfi_end", "1 April 2027", "2027-04-01"],
    ["schemes.sfi_end", "31-3-27", "2027-03-31"],
    ["schemes.sfi_end", "2027-03-31", "2027-03-31"],
    ["sales.wheat_2026_unsold_t", "1.2k t", 1200],
    ["sales.wheat_2026_unsold_t", "1,028", 1028],
    ["fin.loan", "£1.2m", 1_200_000],
    ["crop.wheat.yield_t_ha", "8.5 t/ha", 8.5],
  ])("%s from %j", (key, input, expected) => {
    expect(parseValue(def(key), input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["schemes.sfi_end", "2027-13-45"],
    ["schemes.sfi_end", "31/02/2027"],
    ["schemes.sfi_end", "sometime in spring"],
    ["sales.wheat_2026_unsold_t", "1e3"],
    ["sales.wheat_2026_unsold_t", "12,5"],
    ["sales.wheat_2026_unsold_t", "about 12 or 13"],
    ["crop.wheat.area_ha", "Silty clay loam 60%, sandy loam 40%"],
    ["crop.wheat.area_ha", "-50"],
    ["crop.wheat.yield_t_ha", "85"],
    ["crop.wheat.area_ha", "99999"],
    ["fin.loan_margin_pct", "31"],
  ])("rejects %s %j", (key, input) => {
    expect(parseValue(def(key), input).ok).toBe(false);
  });
});

describe("checks across fields", () => {
  const demo = valuesOf(profileFields);

  it("passes the demo farm", () => {
    expect(profileProblems(demo)).toEqual([]);
  });

  it("catches more crop than land", () => {
    const [p] = profileProblems({ ...demo, "crop.wheat.area_ha": 2200 });
    expect(p.keys).toContain("crop.wheat.area_ha");
    expect(p.message).toMatch(/2,430 ha, more than the 450 ha farmed/);
  });

  it("catches more sold forward than will be grown", () => {
    expect(profileProblems({ ...demo, "sales.osr_2027_forward_t": 900 })[0].message).toMatch(/rape sold forward is more than the 2027 crop/);
  });

  it("catches a yield swing bigger than the yield", () => {
    expect(profileProblems({ ...demo, "crop.barley.yield_sd_t_ha": 7 })).toHaveLength(1);
  });
});

describe("the checks guard every way into the profile", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    vi.resetModules();
  });
  const load = () => import("@/lib/data");

  it("won't save a section that contradicts the rest of the profile", async () => {
    const data = await load();
    const result = await data.saveSection("cropping", { "crop.wheat.area_ha": "2200" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["crop.wheat.area_ha"]).toMatch(/more than the 450 ha farmed/);
  });

  it("won't approve a proposed change that can't be true, and keeps it pending", async () => {
    const data = await load();
    const result = await data.approveChange("pc-osr-yield", "85 t/ha");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Check the unit") });
    expect((await data.getPendingChanges()).find((p) => p.id === "pc-osr-yield")?.status).toBe("pending");
  });
});
