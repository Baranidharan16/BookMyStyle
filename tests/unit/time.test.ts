import { describe, expect, it } from "vitest";
import { addDaysKey, minutesOfDay, toDateKey, zonedToUtc, isValidDateKey } from "@/lib/time";

describe("time zone helpers", () => {
  it("converts IST wall clock to UTC", () => {
    expect(zonedToUtc("2026-10-05", 17 * 60 + 30, "Asia/Kolkata").toISOString()).toBe("2026-10-05T12:00:00.000Z");
  });
  it("round-trips across zones incl. DST", () => {
    const d = zonedToUtc("2026-03-08", 3 * 60, "America/New_York"); // DST starts 2am
    expect(minutesOfDay(d, "America/New_York")).toBe(3 * 60);
    const d2 = zonedToUtc("2026-07-01", 9 * 60, "Europe/London");
    expect(d2.toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });
  it("date keys", () => {
    expect(toDateKey(new Date("2026-10-04T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-05");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(isValidDateKey("2026-02-30")).toBe(false);
  });
});
