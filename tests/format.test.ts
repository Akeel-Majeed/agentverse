import { describe, expect, it } from "vitest";
import { londonDay, londonTime } from "@/lib/format";
import { formatDate } from "@/lib/profile/values";

describe("dates", () => {
  it.each([
    ["2027-03-31", "31 Mar 2027"],
    ["2026-09-05", "5 Sep 2026"], // not ICU's "Sept"
    ["2026-01-01", "1 Jan 2026"],
    ["2026-12-31T23:30:00Z", "31 Dec 2026"],
  ])("shows %s as %s", (iso, shown) => {
    expect(formatDate(iso)).toBe(shown);
  });

  it("gives the London date and time, across the clock change", () => {
    expect(londonDay(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(londonTime(new Date("2026-06-30T23:30:00Z"))).toBe("00:30");
    expect(londonDay(new Date("2026-11-07T23:30:00Z"))).toBe("2026-11-07");
    expect(londonTime(new Date("2026-11-07T14:05:00Z"))).toBe("14:05");
  });
});
