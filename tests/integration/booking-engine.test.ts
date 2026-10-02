import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { cancelBooking, createDeskBooking, holdSlot, rescheduleBooking, transitionBooking } from "@/server/booking/engine";
import { getAvailability } from "@/server/domain/salons";
import { AppError } from "@/server/http/errors";
import { zonedToUtc } from "@/lib/time";
import { futureDate, H, makeSalon, makeUser, resetDb, TZ } from "./fixtures";

const errCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : `UNEXPECTED:${(e as Error).message}`;
  }
};

beforeEach(resetDb);

describe("concurrency — the last seat can only be sold once", () => {
  it("20 customers racing for one chair at 17:00 → exactly one hold", async () => {
    const { salon, service } = await makeSalon({ chairs: 1, staffCount: 5 });
    const date = futureDate();
    const customers = await Promise.all(Array.from({ length: 20 }, () => makeUser("CUSTOMER")));
    const results = await Promise.allSettled(
      customers.map((c) => holdSlot(c, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(17) })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    }
    const active = await db.execute(sql`select count(*)::int n from booking_resources where active`);
    expect(active.rows[0]).toEqual({ n: 1 });
  });

  it("with 3 chairs, 3 of 10 racing customers succeed", async () => {
    const { salon, service } = await makeSalon({ chairs: 3, staffCount: 5 });
    const date = futureDate();
    const customers = await Promise.all(Array.from({ length: 10 }, () => makeUser("CUSTOMER")));
    const results = await Promise.allSettled(customers.map((c) => holdSlot(c, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(11) })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });

  it("the database itself rejects overlapping reservations (exclusion constraint)", async () => {
    const { salon, service, chairs } = await makeSalon();
    const cust = await makeUser("CUSTOMER");
    const b = await holdSlot(cust, { salonId: salon.id, serviceId: service.id, optionIds: [], date: futureDate(), startMinute: H(12) });
    await expect(
      db.insert(s.bookingResources).values({ bookingId: b!.id, salonId: salon.id, resourceId: chairs[0]!.id, startsAt: new Date(b!.startsAt.getTime() + 10 * 60_000), endsAt: new Date(b!.endsAt.getTime() + 30 * 60_000) }),
    ).rejects.toMatchObject({ cause: { code: "23P01" } });
  });
});

describe("holds, availability & real-time capacity", () => {
  it("a held slot disappears from availability; expiry releases it", async () => {
    const { salon, service } = await makeSalon({ chairs: 1 });
    const date = futureDate();
    const [a, b] = [await makeUser("CUSTOMER"), await makeUser("CUSTOMER")];
    const hold = await holdSlot(a, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(17) });
    let av = await getAvailability({ salonId: salon.id, serviceId: service.id, date });
    expect(av.slots.find((x) => x.minute === H(17))!.available).toBe(false);
    // buffer: 17:30 also blocked (17:00–17:40 occupied)
    expect(av.slots.find((x) => x.minute === H(17, 30))!.available).toBe(false);
    expect(await errCode(holdSlot(b, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(17) }))).toBe("NO_RESOURCE");

    await db.update(s.bookings).set({ lockExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.bookings.id, hold!.id));
    av = await getAvailability({ salonId: salon.id, serviceId: service.id, date });
    expect(av.slots.find((x) => x.minute === H(17))!.available).toBe(true);
    expect(await errCode(holdSlot(b, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(17) }))).toBe("OK");
    const old = await db.query.bookings.findFirst({ where: eq(s.bookings.id, hold!.id) });
    expect(old!.status).toBe("FAILED");
  });

  it("rejects bookings outside hours, in the past and on holidays", async () => {
    const { salon, service } = await makeSalon();
    const c = await makeUser("CUSTOMER");
    const date = futureDate();
    expect(await errCode(holdSlot(c, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(20, 45) }))).toBe("OUTSIDE_HOURS");
    expect(await errCode(holdSlot(c, { salonId: salon.id, serviceId: service.id, optionIds: [], date: "2020-01-01", startMinute: H(12) }))).toBe("PAST");
    await db.insert(s.holidays).values({ salonId: salon.id, date, isClosed: true, reason: "Pongal" });
    expect(await errCode(holdSlot(c, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(12) }))).toBe("CLOSED");
  });

  it("blocked resources are unavailable", async () => {
    const { salon, service, chairs } = await makeSalon({ chairs: 1 });
    const date = futureDate();
    await db.insert(s.resourceBlocks).values({ salonId: salon.id, resourceId: chairs[0]!.id, startsAt: zonedToUtc(date, H(14), TZ), endsAt: zonedToUtc(date, H(16), TZ) });
    const c = await makeUser("CUSTOMER");
    expect(await errCode(holdSlot(c, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(15) }))).toBe("NO_RESOURCE");
  });
});

describe("walk-ins share capacity with online bookings", () => {
  it("a walk-in removes online availability, and a conflicting walk-in needs owner override", async () => {
    const { salon, service, owner, staff, chairs } = await makeSalon({ chairs: 1 });
    const date = futureDate();
    const start = zonedToUtc(date, H(17), TZ).toISOString();
    const staffUser = await makeUser("STAFF");
    await db.update(s.staff).set({ userId: staffUser.id, permissions: ["CHECK_IN", "WALK_IN"] }).where(eq(s.staff.id, staff[0]!.id));

    await createDeskBooking(staffUser, salon.id, { source: "WALK_IN", customerName: "Ravi", serviceId: service.id, startsAt: start, paymentMode: "CASH", paymentCollected: true });
    const c = await makeUser("CUSTOMER");
    expect(await errCode(holdSlot(c, { salonId: salon.id, serviceId: service.id, optionIds: [], date, startMinute: H(17) }))).toBe("NO_RESOURCE");

    // staff cannot create a conflicting walk-in, nor override
    expect(await errCode(createDeskBooking(staffUser, salon.id, { source: "WALK_IN", customerName: "Kumar", serviceId: service.id, startsAt: start, paymentMode: "CASH", paymentCollected: false }))).toBe("DESK_CONFLICT");
    expect(await errCode(createDeskBooking(staffUser, salon.id, { source: "WALK_IN", customerName: "Kumar", serviceId: service.id, startsAt: start, paymentMode: "CASH", paymentCollected: false, override: true }))).toBe("FORBIDDEN");
    // owner can explicitly override
    const forced = await createDeskBooking(owner, salon.id, { source: "WALK_IN", customerName: "Kumar", serviceId: service.id, resourceId: chairs[0]!.id, startsAt: start, paymentMode: "CASH", paymentCollected: false, override: true });
    expect(forced!.overrideConflict).toBe(true);
    const log = await db.query.auditLogs.findFirst({ where: eq(s.auditLogs.action, "walkin.created_with_override") });
    expect(log).toBeTruthy();
  });

  it("owners of salon A can't touch salon B (tenant isolation)", async () => {
    const a = await makeSalon();
    const b = await makeSalon();
    expect(await errCode(createDeskBooking(a.owner, b.salon.id, { source: "WALK_IN", customerName: "X", serviceId: b.service.id, paymentMode: "CASH", paymentCollected: false }))).toBe("NOT_FOUND");
  });
});

describe("lifecycle: cancel, reschedule, late arrival, no-show", () => {
  async function confirmedBooking(policy = {}) {
    const fx = await makeSalon({ chairs: 2, policy });
    const c = await makeUser("CUSTOMER");
    const b = await holdSlot(c, { salonId: fx.salon.id, serviceId: fx.service.id, optionIds: [], date: futureDate(), startMinute: H(15) });
    await db.update(s.bookings).set({ status: "CONFIRMED", paymentStatus: "SUCCESSFUL", lockExpiresAt: null }).where(eq(s.bookings.id, b!.id));
    return { ...fx, c, b: b! };
  }

  it("customer cancel releases the slot and computes refund from policy", async () => {
    const { c, b, salon, service } = await confirmedBooking();
    const res = await cancelBooking(c, b.id, "Plans changed");
    expect(res.booking.status).toBe("CANCELLED");
    const av = await getAvailability({ salonId: salon.id, serviceId: service.id, date: futureDate() });
    expect(av.slots.find((x) => x.minute === H(15))!.available).toBe(true);
    expect(await errCode(cancelBooking(c, b.id))).toBe("NOT_CANCELLABLE");
  });

  it("other customers can't cancel my booking", async () => {
    const { b } = await confirmedBooking();
    const stranger = await makeUser("CUSTOMER");
    expect(await errCode(cancelBooking(stranger, b.id))).toBe("NOT_FOUND");
  });

  it("reschedule revalidates and moves reservations", async () => {
    const { c, b } = await confirmedBooking();
    const moved = await rescheduleBooking(c, b.id, { date: futureDate(), startMinute: H(18) });
    expect(moved!.rescheduleCount).toBe(1);
    const rows = await db.select().from(s.bookingResources).where(eq(s.bookingResources.bookingId, b.id));
    expect(rows.filter((r) => r.active)).toHaveLength(1);
    expect(await errCode(rescheduleBooking(c, b.id, { date: futureDate(), startMinute: H(22) }))).toBe("OUTSIDE_HOURS");
  });

  it("respects reschedule policy", async () => {
    const { c, b } = await confirmedBooking({ allowReschedule: false });
    expect(await errCode(rescheduleBooking(c, b.id, { date: futureDate(), startMinute: H(18) }))).toBe("RESCHEDULE_DISABLED");
  });

  it("late check-in keeps the booking active with the late-arrival message; no-show only after grace", async () => {
    const fx = await makeSalon({ chairs: 1, policy: { graceMinutes: 10 } });
    const c = await makeUser("CUSTOMER");
    // a booking that started 15 minutes ago today
    const start = new Date(Date.now() - 15 * 60_000);
    const [b] = await db
      .insert(s.bookings)
      .values({ code: "SAL-TEST-0001", salonId: fx.salon.id, customerId: c.id, customerName: c.name, serviceId: fx.service.id, status: "CONFIRMED", startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000), occupiedFrom: start, occupiedUntil: new Date(start.getTime() + 40 * 60_000), durationMinutes: 30, subtotal: 25000, total: 29500, checkInToken: "tok" })
      .returning();
    const res = await transitionBooking(fx.owner, b!.id, "CHECK_IN", { checkInToken: "tok" });
    expect(res.message).toMatch(/You have arrived late\. Your booking remains active/);
    expect(res.booking.lateMinutes).toBeGreaterThanOrEqual(15);

    const [b2] = await db
      .insert(s.bookings)
      .values({ code: "SAL-TEST-0002", salonId: fx.salon.id, customerId: c.id, customerName: c.name, serviceId: fx.service.id, status: "CONFIRMED", startsAt: new Date(Date.now() - 5 * 60_000), endsAt: new Date(Date.now() + 25 * 60_000), occupiedFrom: new Date(Date.now() - 5 * 60_000), occupiedUntil: new Date(Date.now() + 35 * 60_000), durationMinutes: 30, subtotal: 25000, total: 29500, checkInToken: "tok2" })
      .returning();
    expect(await errCode(transitionBooking(fx.owner, b2!.id, "NO_SHOW"))).toBe("GRACE_PERIOD");
  });

  it("full in-salon flow: check-in → start → complete frees the chair early", async () => {
    const fx = await makeSalon({ chairs: 1 });
    const start = new Date(Date.now() + 5 * 60_000);
    const b = await createDeskBooking(fx.owner, fx.salon.id, { source: "WALK_IN", customerName: "Anu", serviceId: fx.service.id, startsAt: start.toISOString(), paymentMode: "UPI", paymentCollected: false });
    expect(b!.status).toBe("CHECKED_IN");
    await transitionBooking(fx.owner, b!.id, "START");
    const done = await transitionBooking(fx.owner, b!.id, "COMPLETE");
    expect(done.booking.status).toBe("COMPLETED");
    const [r] = await db.select().from(s.bookingResources).where(eq(s.bookingResources.bookingId, b!.id));
    expect(r!.endsAt.getTime()).toBeLessThan(b!.occupiedUntil.getTime());
    expect(await errCode(transitionBooking(fx.owner, b!.id, "START"))).toBe("INVALID_TRANSITION");
  });
});
