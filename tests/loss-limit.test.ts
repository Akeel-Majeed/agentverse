import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkLossLimit, lossFromRisk } from "@/lib/limits";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

describe("the farm's loss limit", () => {
  const risks = [
    { id: "output_prices", name: "Output prices", badYear: 149_000 },
    { id: "weather_yield", name: "Weather and yield", badYear: 58_000 },
  ];

  it("is breached when a 1-in-20 bad year loses more than the limit", () => {
    const l = checkLossLimit({ limit: 60_000, confirmed: true, profit: { badYear: -90_000 }, risks, typicalProfit: 85_000 });
    expect(l).toMatchObject({ farmLoss: 90_000, breached: true, risksOver: [{ id: "output_prices", loss: 64_000 }] });
    expect(l.working.find((w) => w.label.startsWith("breached"))?.value).toBe("yes");
  });

  it("is within the limit when the bad year still makes a profit", () => {
    const l = checkLossLimit({ limit: 60_000, confirmed: true, profit: { badYear: 5_000 }, risks: [risks[1]], typicalProfit: 85_000 });
    expect(l).toMatchObject({ farmLoss: 0, breached: false, risksOver: [] });
  });

  it("can't be checked without a limit, and doesn't invent one", () => {
    const l = checkLossLimit({ limit: null, confirmed: false, profit: { badYear: -90_000 }, risks, typicalProfit: 85_000 });
    expect(l).toMatchObject({ limit: null, breached: false, risksOver: [] });
  });

  it("counts a risk alone as its hit less a typical year's profit", () => {
    expect(lossFromRisk(149_000, 85_000)).toBe(64_000);
    expect(lossFromRisk(58_000, 85_000)).toBe(0);
  });
});

describe("loss limit on the demo farm", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    vi.resetModules();
  });

  it("flags the unconfirmed £60k limit, then treats it as confirmed once the farmer saves it", async () => {
    const data = await import("@/lib/data");
    expect(await data.getLossLimit()).toMatchObject({ limit: 60_000, confirmed: false, breached: true, farmLoss: 90_000 });
    await data.saveSection("insurance", { "ins.max_loss": "£100k" });
    expect(await data.getLossLimit()).toMatchObject({ limit: 100_000, confirmed: true, breached: false });
  });
});
