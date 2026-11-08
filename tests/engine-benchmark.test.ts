import { describe, expect, it } from "vitest";
import { farmAt } from "@/lib/engine/backtest";
import { withForward } from "@/lib/engine/benchmark";
import { loadHistory } from "@/lib/engine/history";
import { farmPnl } from "@/lib/engine/simulate";

describe("hedge P&L for one year", () => {
  it("50% forward gains tonnes × (origin − harvest price − £3) vs doing nothing", () => {
    const farm = farmAt(loadHistory(), "2022-08-01");
    const t = 0.5 * farm.crops.wheat.areaHa * farm.crops.wheat.yieldTHa;
    const shock = { wheat: Math.log(0.8) }; // wheat falls 20% by harvest, yields on trend
    const gain = farmPnl(withForward(farm, 0.5, 3), shock).profit - farmPnl(farm, shock).profit;
    expect(gain).toBeCloseTo(t * (farm.priceToday.wheat * 0.2 - 3), 6);
  });
});
