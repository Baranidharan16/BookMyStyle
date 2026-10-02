import { describe, expect, it } from "vitest";
import { evaluateSlot, listSlots, type DayContext, type ServiceSpec } from "@/server/booking/engine-core";
import { zonedToUtc, minutesOfDay } from "@/lib/time";

const TZ = "Asia/Kolkata";
const DATE = "2030-01-07"; // a Monday, far in the future
const at = (m: number) => zonedToUtc(DATE, m, TZ).getTime();
const H = (h: number, m = 0) => h * 60 + m;
const NOW = zonedToUtc("2030-01-01", H(9), TZ).getTime();

function ctx(overrides: Partial<DayContext> = {}): DayContext {
  return {
    salonId: "s1",
    timezone: TZ,
    bookable: true,
    dateKey: DATE,
    open: [{ start: at(H(9)), end: at(H(21)) }],
    closedReason: null,
    policy: { bookingWindowDays: 30, minAdvanceMinutes: 30, maxBookingMinutes: 480, slotIntervalMinutes: 15 },
    resources: [
      { id: "c1", name: "Chair 1", typeId: "chair", typeName: "Haircut Chair", sort: 0 },
      { id: "c2", name: "Chair 2", typeId: "chair", typeName: "Haircut Chair", sort: 1 },
      { id: "room", name: "Suite", typeId: "makeup", typeName: "Makeup Room", sort: 0 },
    ],
    resourceBusy: new Map(),
    staff: [
      { id: "arun", name: "Arun", title: "Barber", serviceIds: new Set(["haircut", "bridal"]), shifts: [{ start: at(H(10)), end: at(H(20)) }], breaks: [{ start: at(H(13)), end: at(H(14)) }], leaves: [] },
      { id: "vijay", name: "Vijay", title: "Barber", serviceIds: new Set(["haircut", "bridal"]), shifts: [{ start: at(H(9)), end: at(H(21)) }], breaks: [], leaves: [] },
    ],
    staffBusy: new Map(),
    ...overrides,
  };
}

const haircut: ServiceSpec = { id: "haircut", name: "Haircut", durationMinutes: 30, prepMinutes: 0, bufferMinutes: 10, staffRequired: 1, requirements: [{ resourceTypeId: "chair", resourceTypeName: "Haircut Chair", quantity: 1 }] };
const bridal: ServiceSpec = { id: "bridal", name: "Bridal", durationMinutes: 150, prepMinutes: 15, bufferMinutes: 30, staffRequired: 2, requirements: [{ resourceTypeId: "makeup", resourceTypeName: "Makeup Room", quantity: 1 }] };

describe("evaluateSlot", () => {
  it("books an open slot and reserves service + buffer on the resource", () => {
    const ev = evaluateSlot(ctx(), haircut, at(H(17)), { now: NOW });
    expect(ev.available).toBe(true);
    if (!ev.available) return;
    expect(ev.resourceIds).toEqual(["c1"]);
    expect(ev.occupiedUntil - ev.startsAt).toBe(40 * 60_000); // 30 min + 10 min buffer
  });

  it("refuses when every compatible resource is taken (capacity exhausted)", () => {
    const busy = new Map([["c1", [{ start: at(H(17)), end: at(H(17, 40)) }]], ["c2", [{ start: at(H(16, 50)), end: at(H(17, 20)) }]]]);
    const ev = evaluateSlot(ctx({ resourceBusy: busy }), haircut, at(H(17)), { now: NOW });
    expect(ev).toMatchObject({ available: false, reason: "NO_RESOURCE" });
  });

  it("buffer time blocks back-to-back bookings on the same chair", () => {
    // c1 busy until 17:40 because of its buffer, c2 busy all evening
    const busy = new Map([["c1", [{ start: at(H(17)), end: at(H(17, 40)) }]], ["c2", [{ start: at(H(9)), end: at(H(21)) }]]]);
    expect(evaluateSlot(ctx({ resourceBusy: busy }), haircut, at(H(17, 30)), { now: NOW }).available).toBe(false);
    expect(evaluateSlot(ctx({ resourceBusy: busy }), haircut, at(H(17, 40)), { now: NOW }).available).toBe(true);
  });

  it("never double-books a staff member", () => {
    const staffBusy = new Map([["arun", [{ start: at(H(17)), end: at(H(17, 40)) }]], ["vijay", [{ start: at(H(16, 45)), end: at(H(17, 30)) }]]]);
    expect(evaluateSlot(ctx({ staffBusy }), haircut, at(H(17)), { now: NOW })).toMatchObject({ available: false, reason: "NO_STAFF" });
  });

  it("respects staff breaks and preferred stylist", () => {
    const ev = evaluateSlot(ctx(), haircut, at(H(13, 15)), { now: NOW, staffPreference: "arun" });
    expect(ev).toMatchObject({ available: false, reason: "STAFF_UNAVAILABLE" });
    const ok = evaluateSlot(ctx(), haircut, at(H(13, 15)), { now: NOW });
    expect(ok.available && ok.staffIds).toEqual(["vijay"]);
  });

  it("rejects slots outside business hours and on closed days", () => {
    expect(evaluateSlot(ctx(), haircut, at(H(20, 45)), { now: NOW })).toMatchObject({ available: false, reason: "OUTSIDE_HOURS" });
    expect(evaluateSlot(ctx({ open: [], closedReason: "Diwali" }), haircut, at(H(12)), { now: NOW })).toMatchObject({ available: false, reason: "CLOSED" });
  });

  it("allows the cleanup buffer to run past closing time", () => {
    expect(evaluateSlot(ctx(), haircut, at(H(20, 30)), { now: NOW }).available).toBe(true);
  });

  it("enforces minimum advance and booking window unless ignored (walk-ins)", () => {
    const now = at(H(16, 50));
    expect(evaluateSlot(ctx(), haircut, at(H(17)), { now })).toMatchObject({ available: false, reason: "TOO_SOON" });
    expect(evaluateSlot(ctx(), haircut, at(H(17)), { now, ignoreAdvanceRules: true }).available).toBe(true);
    expect(evaluateSlot(ctx(), haircut, at(H(16)), { now })).toMatchObject({ reason: "PAST" });
    const farNow = zonedToUtc("2029-11-01", H(9), TZ).getTime();
    expect(evaluateSlot(ctx(), haircut, at(H(17)), { now: farNow })).toMatchObject({ reason: "TOO_FAR" });
  });

  it("multi-resource / multi-staff services need everything at once", () => {
    const ev = evaluateSlot(ctx(), bridal, at(H(10, 30)), { now: NOW });
    expect(ev.available && ev.staffIds.length).toBe(2);
    const staffBusy = new Map([["vijay", [{ start: at(H(12)), end: at(H(12, 30)) }]]]);
    expect(evaluateSlot(ctx({ staffBusy }), bridal, at(H(10, 30)), { now: NOW })).toMatchObject({ available: false });
  });

  it("leave makes a stylist unavailable", () => {
    const c = ctx();
    c.staff[1]!.leaves = [{ start: at(0), end: at(H(24)) }];
    c.staff[0]!.leaves = [{ start: at(0), end: at(H(24)) }];
    expect(evaluateSlot(c, haircut, at(H(11)), { now: NOW })).toMatchObject({ reason: "NO_STAFF" });
  });

  it("refuses unbookable salons", () => {
    expect(evaluateSlot(ctx({ bookable: false }), haircut, at(H(11)), { now: NOW })).toMatchObject({ reason: "SALON_NOT_BOOKABLE" });
  });
});

describe("listSlots", () => {
  it("produces interval-aligned slots and marks busy ones", () => {
    const busy = new Map([["c1", [{ start: at(H(9)), end: at(H(21)) }]], ["c2", [{ start: at(H(17)), end: at(H(18)) }]]]);
    const slots = listSlots(ctx({ resourceBusy: busy }), haircut, at, (i) => minutesOfDay(new Date(i), TZ), { now: NOW });
    expect(slots[0]!.minute).toBe(H(9));
    expect(slots.every((s) => s.minute % 15 === 0)).toBe(true);
    expect(slots.find((s) => s.minute === H(17))!.available).toBe(false);
    expect(slots.find((s) => s.minute === H(18))!.available).toBe(true);
    // last slot must finish service by closing
    expect(slots.at(-1)!.minute).toBe(H(20, 30));
  });

  it("handles split shifts", () => {
    const c = ctx({ open: [{ start: at(H(10)), end: at(H(14)) }, { start: at(H(16)), end: at(H(22)) }] });
    const slots = listSlots(c, haircut, at, (i) => minutesOfDay(new Date(i), TZ), { now: NOW });
    expect(slots.some((s) => s.minute === H(14, 30))).toBe(false);
    expect(slots.some((s) => s.minute === H(16))).toBe(true);
  });
});
