import { beforeEach, describe, expect, it, vi } from "vitest";
import { whatIf } from "@/lib/sim";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const load = () => import("@/lib/data");

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  vi.resetModules();
});

describe("what-if", () => {
  it("starts from the snapshot: same wheat tonnes and prices as the risk profile", async () => {
    const { base, baseline } = await (await load()).getWhatIfConfig();
    expect(base).toMatchObject({ profitK: 85, wheatPrice: 178, anPrice: 504, wheatStoreT: 1028, wheatCropT: 1870, anUnboughtT: 166, variableDebtK: 840 });
    expect(whatIf(baseline, base).deltaK).toBe(0);
    // A £4/t fall moves profit by the same amount as the risk profile's wheat sensitivity (2,898 t).
    expect(whatIf({ ...baseline, wheatPrice: 174 }, base).deltaK).toBeCloseTo(-11.592, 3);
  });

  it("follows the farm profile once the risk profile is updated", async () => {
    const data = await load();
    await data.saveSection("sales", { "sales.wheat_2026_unsold_t": "0", "sales.wheat_2027_forward_t": "1870" });
    await data.updateRiskProfile("Sold the wheat");
    const { base, baseline } = await data.getWhatIfConfig();
    const r = whatIf({ ...baseline, wheatPrice: 150 }, base);
    expect(r.deltaK).toBe(0);
    expect(r.lossPrice).toBeNull();
  });

  it("finds the wheat price where the farm breaks even, and shows its working", async () => {
    const { base, baseline } = await (await load()).getWhatIfConfig();
    const r = whatIf(baseline, base);
    expect(whatIf({ ...baseline, wheatPrice: r.lossPrice! }, base).profitK).toBeCloseTo(0, 6);
    expect(r.working.at(-1)?.label).toMatch(/loss_if_wheat_below/);
  });
});
