import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  bookingItems,
  bookingResources,
  bookingStaff,
  bookingStatusHistory,
  bookings,
  businessHours,
  holidays,
  payments,
  refunds,
  resourceBlocks,
  resourceTypes,
  resources,
  reviews,
  salonLocations,
  salons,
  services,
  staff,
  staffBreaks,
  staffLeaves,
  staffSchedules,
  waitingQueue,
} from "../db/schema";
import { addDaysKey, toDateKey, weekdayOf, zonedToUtc } from "@/lib/time";
import { getPolicy } from "../booking/context";

export async function getBookingDetail(bookingId: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!b) return null;
  const [salon, location, service, items, staffRows, resourceRows, pays, refundRows, history, queue, review, policy] = await Promise.all([
    db.query.salons.findFirst({ where: eq(salons.id, b.salonId), columns: { id: true, name: true, slug: true, citySlug: true, phone: true, timezone: true, brandColor: true, logoUrl: true, ownerId: true } }),
    db.query.salonLocations.findFirst({ where: eq(salonLocations.salonId, b.salonId) }),
    db.query.services.findFirst({ where: eq(services.id, b.serviceId), columns: { id: true, name: true, durationMinutes: true } }),
    db.query.bookingItems.findMany({ where: eq(bookingItems.bookingId, b.id) }),
    db
      .select({ id: staff.id, name: staff.name, title: staff.title, active: bookingStaff.active })
      .from(bookingStaff)
      .innerJoin(staff, eq(staff.id, bookingStaff.staffId))
      .where(eq(bookingStaff.bookingId, b.id)),
    db
      .select({ id: resources.id, name: resources.name, type: resourceTypes.name, active: bookingResources.active })
      .from(bookingResources)
      .innerJoin(resources, eq(resources.id, bookingResources.resourceId))
      .innerJoin(resourceTypes, eq(resourceTypes.id, resources.resourceTypeId))
      .where(eq(bookingResources.bookingId, b.id)),
    db.query.payments.findMany({ where: eq(payments.bookingId, b.id), orderBy: desc(payments.createdAt) }),
    db.query.refunds.findMany({ where: eq(refunds.bookingId, b.id), orderBy: desc(refunds.createdAt) }),
    db.query.bookingStatusHistory.findMany({ where: eq(bookingStatusHistory.bookingId, b.id), orderBy: asc(bookingStatusHistory.createdAt) }),
    db.query.waitingQueue.findFirst({ where: eq(waitingQueue.bookingId, b.id) }),
    db.query.reviews.findFirst({ where: eq(reviews.bookingId, b.id) }),
    getPolicy(db, b.salonId),
  ]);
  // Keep the current assignment (fall back to the last one if released).
  const activeStaff = staffRows.filter((s) => s.active);
  const activeRes = resourceRows.filter((r) => r.active);
  return {
    booking: b,
    salon: salon!,
    location: location ?? null,
    service: service!,
    items,
    staff: activeStaff.length ? activeStaff : staffRows,
    resources: activeRes.length ? activeRes : resourceRows,
    payments: pays.map((p) => ({ ...p, raw: undefined })),
    refunds: refundRows,
    history,
    queue: queue ?? null,
    review: review ?? null,
    policy: {
      graceMinutes: policy.graceMinutes,
      refundType: policy.refundType,
      cancellationTiers: policy.cancellationTiers,
      allowReschedule: policy.allowReschedule,
      rescheduleMinHours: policy.rescheduleMinHours,
      maxReschedules: policy.maxReschedules,
      policyText: policy.policyText,
      noShowRefundPercent: policy.noShowRefundPercent,
    },
  };
}
export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBookingDetail>>>;

const bookingCardSelect = {
  id: bookings.id,
  code: bookings.code,
  status: bookings.status,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  total: bookings.total,
  paymentStatus: bookings.paymentStatus,
  source: bookings.source,
  customerName: bookings.customerName,
  customerPhone: bookings.customerPhone,
  customerId: bookings.customerId,
  lateMinutes: bookings.lateMinutes,
  estimatedStartAt: bookings.estimatedStartAt,
  overrideConflict: bookings.overrideConflict,
  serviceName: services.name,
  salonId: salons.id,
  salonName: salons.name,
  salonSlug: salons.slug,
  citySlug: salons.citySlug,
  timezone: salons.timezone,
  brandColor: salons.brandColor,
  staffNames: sql<string | null>`(select string_agg(s.name, ', ') from booking_staff bs join staff s on s.id = bs.staff_id where bs.booking_id = ${bookings.id} and (bs.active or ${bookings.status} in ('COMPLETED','CANCELLED','NO_SHOW','FAILED')))`,
  resourceNames: sql<string | null>`(select string_agg(r.name, ', ') from booking_resources br join resources r on r.id = br.resource_id where br.booking_id = ${bookings.id} and (br.active or ${bookings.status} in ('COMPLETED','CANCELLED','NO_SHOW','FAILED')))`,
  hasReview: sql<boolean>`exists(select 1 from reviews r where r.booking_id = ${bookings.id})`,
};
export type BookingCard = Awaited<ReturnType<typeof listCustomerBookings>>[number];

export async function listCustomerBookings(userId: string, tab: "upcoming" | "past" | "cancelled" | "all" = "all", limit = 50) {
  const now = new Date();
  const cond: SQL[] = [eq(bookings.customerId, userId)];
  if (tab === "upcoming") cond.push(inArray(bookings.status, ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE"]), gte(bookings.endsAt, new Date(now.getTime() - 3 * 3_600_000)));
  if (tab === "past") cond.push(inArray(bookings.status, ["COMPLETED", "NO_SHOW"]));
  if (tab === "cancelled") cond.push(inArray(bookings.status, ["CANCELLED", "FAILED"]));
  if (tab === "all") cond.push(sql`${bookings.status} <> 'PAYMENT_PENDING' or ${bookings.lockExpiresAt} > now()`);
  return db
    .select(bookingCardSelect)
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(salons, eq(salons.id, bookings.salonId))
    .where(and(...cond))
    .orderBy(tab === "upcoming" ? asc(bookings.startsAt) : desc(bookings.startsAt))
    .limit(limit);
}

export async function listSalonBookings(
  salonId: string,
  f: { date?: string; from?: Date; to?: Date; status?: string; source?: string; q?: string; page?: number; pageSize?: number; staffId?: string },
) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, f.pageSize ?? 25);
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { timezone: true } });
  const tz = salon?.timezone ?? "Asia/Kolkata";
  const cond: SQL[] = [eq(bookings.salonId, salonId), sql`(${bookings.status} <> 'PAYMENT_PENDING' or ${bookings.lockExpiresAt} > now())`];
  if (f.date) {
    cond.push(gte(bookings.startsAt, zonedToUtc(f.date, 0, tz)), lt(bookings.startsAt, zonedToUtc(addDaysKey(f.date, 1), 0, tz)));
  }
  if (f.from) cond.push(gte(bookings.startsAt, f.from));
  if (f.to) cond.push(lt(bookings.startsAt, f.to));
  if (f.status) cond.push(inArray(bookings.status, f.status.split(",") as never[]));
  if (f.source) cond.push(eq(bookings.source, f.source as "ONLINE"));
  if (f.staffId) cond.push(sql`exists (select 1 from booking_staff bs where bs.booking_id = ${bookings.id} and bs.staff_id = ${f.staffId})`);
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    cond.push(or(ilike(bookings.customerName, like), ilike(bookings.code, like), ilike(bookings.customerPhone, like))!);
  }
  const rows = await db
    .select({ ...bookingCardSelect, total_count: sql<number>`count(*) over()` })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(salons, eq(salons.id, bookings.salonId))
    .where(and(...cond))
    .orderBy(f.date ? asc(bookings.startsAt) : desc(bookings.startsAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows.map(({ total_count, ...r }) => r), total: Number(rows[0]?.total_count ?? 0), page, pageSize };
}

/* ------------------------------------------------------------ live board */

export async function getResourceBoard(salonId: string) {
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { timezone: true, name: true } });
  const tz = salon?.timezone ?? "Asia/Kolkata";
  const today = toDateKey(new Date(), tz);
  const dayStart = zonedToUtc(today, 0, tz);
  const dayEnd = zonedToUtc(addDaysKey(today, 1), 0, tz);
  const now = new Date();

  const [types, res, reservations, blocks, staffRows, queue] = await Promise.all([
    db.query.resourceTypes.findMany({ where: eq(resourceTypes.salonId, salonId), orderBy: asc(resourceTypes.name) }),
    db.query.resources.findMany({ where: eq(resources.salonId, salonId), orderBy: [asc(resources.sort), asc(resources.name)] }),
    db
      .select({
        resourceId: bookingResources.resourceId,
        bookingId: bookings.id,
        code: bookings.code,
        status: bookings.status,
        source: bookings.source,
        customerName: bookings.customerName,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        occupiedUntil: bookingResources.endsAt,
        paymentStatus: bookings.paymentStatus,
        lateMinutes: bookings.lateMinutes,
        estimatedStartAt: bookings.estimatedStartAt,
        overrideConflict: bookings.overrideConflict,
        serviceName: services.name,
        staffNames: sql<string | null>`(select string_agg(s.name, ', ') from booking_staff bs join staff s on s.id = bs.staff_id where bs.booking_id = ${bookings.id} and bs.active)`,
      })
      .from(bookingResources)
      .innerJoin(bookings, eq(bookings.id, bookingResources.bookingId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(
        and(
          eq(bookingResources.salonId, salonId),
          eq(bookingResources.active, true),
          lt(bookingResources.startsAt, dayEnd),
          gte(bookingResources.endsAt, dayStart),
          sql`(${bookings.status} <> 'PAYMENT_PENDING' or ${bookings.lockExpiresAt} > now())`,
        ),
      )
      .orderBy(asc(bookings.startsAt)),
    db.query.resourceBlocks.findMany({ where: and(eq(resourceBlocks.salonId, salonId), lt(resourceBlocks.startsAt, dayEnd), gte(resourceBlocks.endsAt, now)) }),
    db.query.staff.findMany({ where: and(eq(staff.salonId, salonId), eq(staff.active, true)), orderBy: asc(staff.name) }),
    db
      .select({ bookingId: waitingQueue.bookingId, status: waitingQueue.status, estimatedStartAt: waitingQueue.estimatedStartAt, joinedAt: waitingQueue.joinedAt, customerName: bookings.customerName, serviceName: services.name, startsAt: bookings.startsAt, lateMinutes: bookings.lateMinutes, bookingStatus: bookings.status, code: bookings.code })
      .from(waitingQueue)
      .innerJoin(bookings, eq(bookings.id, waitingQueue.bookingId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(and(eq(waitingQueue.salonId, salonId), inArray(waitingQueue.status, ["WAITING", "READY"]), inArray(bookings.status, ["CHECKED_IN", "WAITING"])))
      .orderBy(asc(bookings.startsAt)),
  ]);

  const board = types.map((t) => ({
    typeId: t.id,
    typeName: t.name,
    area: t.area ?? t.name,
    resources: res
      .filter((r) => r.resourceTypeId === t.id)
      .map((r) => {
        const mine = reservations.filter((x) => x.resourceId === r.id);
        const current =
          mine.find((x) => x.status === "IN_SERVICE") ??
          mine.find((x) => x.startsAt <= now && x.occupiedUntil > now && !["COMPLETED"].includes(x.status));
        const upcoming = mine.filter((x) => x.startsAt > now && x !== current && !["COMPLETED", "IN_SERVICE"].includes(x.status));
        const block = blocks.find((b) => b.resourceId === r.id && b.startsAt <= now && b.endsAt > now) ?? null;
        const cleaning = !current && mine.find((x) => x.status === "COMPLETED" && x.occupiedUntil > now);
        const state = !r.active ? "INACTIVE" : block ? "BLOCKED" : current ? (current.status === "IN_SERVICE" ? "IN_SERVICE" : "BOOKED") : cleaning ? "CLEANING" : "AVAILABLE";
        return { id: r.id, name: r.name, active: r.active, state, current: current ?? null, next: upcoming.slice(0, 3), timeline: mine, block, upcomingBlocks: blocks.filter((b) => b.resourceId === r.id) };
      }),
  }));

  const summary = {
    total: res.filter((r) => r.active).length,
    occupied: board.flatMap((g) => g.resources).filter((r) => r.state === "IN_SERVICE" || r.state === "BOOKED").length,
    blocked: board.flatMap((g) => g.resources).filter((r) => r.state === "BLOCKED").length,
  };
  return {
    timezone: tz,
    date: today,
    now: now.toISOString(),
    board,
    summary: { ...summary, available: summary.total - summary.occupied - summary.blocked },
    staff: staffRows.map((s) => ({ id: s.id, name: s.name, title: s.title, availability: s.availability })),
    queue,
  };
}

/* ------------------------------------------------------------- calendar */

export async function getCalendar(salonId: string, from: string, days: number) {
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { timezone: true } });
  const tz = salon?.timezone ?? "Asia/Kolkata";
  const start = zonedToUtc(from, 0, tz);
  const end = zonedToUtc(addDaysKey(from, days), 0, tz);
  const [rows, res, types, staffRows, schedules, breaks, leaves, blocks, hours, special] = await Promise.all([
    db
      .select({
        id: bookings.id,
        code: bookings.code,
        status: bookings.status,
        source: bookings.source,
        customerName: bookings.customerName,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        occupiedFrom: bookings.occupiedFrom,
        occupiedUntil: bookings.occupiedUntil,
        serviceName: services.name,
        total: bookings.total,
        resourceIds: sql<string[]>`coalesce((select array_agg(br.resource_id) from booking_resources br where br.booking_id = ${bookings.id} and br.active), '{}')`,
        staffIds: sql<string[]>`coalesce((select array_agg(bs.staff_id) from booking_staff bs where bs.booking_id = ${bookings.id} and bs.active), '{}')`,
      })
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(
        and(
          eq(bookings.salonId, salonId),
          gte(bookings.startsAt, start),
          lt(bookings.startsAt, end),
          inArray(bookings.status, ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE", "COMPLETED", "PAYMENT_PENDING"]),
          sql`(${bookings.status} <> 'PAYMENT_PENDING' or ${bookings.lockExpiresAt} > now())`,
        ),
      )
      .orderBy(asc(bookings.startsAt)),
    db.query.resources.findMany({ where: and(eq(resources.salonId, salonId), eq(resources.active, true)), orderBy: [asc(resources.sort)] }),
    db.query.resourceTypes.findMany({ where: eq(resourceTypes.salonId, salonId) }),
    db.query.staff.findMany({ where: and(eq(staff.salonId, salonId), eq(staff.active, true)), orderBy: asc(staff.name) }),
    db.select().from(staffSchedules).innerJoin(staff, eq(staff.id, staffSchedules.staffId)).where(eq(staff.salonId, salonId)),
    db.select().from(staffBreaks).innerJoin(staff, eq(staff.id, staffBreaks.staffId)).where(eq(staff.salonId, salonId)),
    db.select().from(staffLeaves).innerJoin(staff, eq(staff.id, staffLeaves.staffId)).where(and(eq(staff.salonId, salonId), lt(staffLeaves.startsAt, end), gte(staffLeaves.endsAt, start))),
    db.query.resourceBlocks.findMany({ where: and(eq(resourceBlocks.salonId, salonId), lt(resourceBlocks.startsAt, end), gte(resourceBlocks.endsAt, start)) }),
    db.query.businessHours.findMany({ where: eq(businessHours.salonId, salonId) }),
    db.query.holidays.findMany({ where: and(eq(holidays.salonId, salonId), gte(holidays.date, from), lt(holidays.date, addDaysKey(from, days))) }),
  ]);
  const dates = Array.from({ length: days }, (_, i) => addDaysKey(from, i));
  return {
    timezone: tz,
    from,
    days,
    dates: dates.map((d) => {
      const sp = special.filter((h) => h.date === d);
      const closed = sp.find((h) => h.isClosed);
      const wd = weekdayOf(d);
      return {
        date: d,
        closed: !!closed,
        closedReason: closed?.reason ?? null,
        hours: closed ? [] : sp.length ? sp.map((h) => ({ open: h.openMinute!, close: h.closeMinute! })) : hours.filter((h) => h.weekday === wd).map((h) => ({ open: h.openMinute, close: h.closeMinute })),
      };
    }),
    bookings: rows,
    resources: res.map((r) => ({ id: r.id, name: r.name, typeName: types.find((t) => t.id === r.resourceTypeId)?.name ?? "" })),
    staff: staffRows.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      schedules: schedules.filter((x) => x.staff.id === s.id).map((x) => x.staff_schedules),
      breaks: breaks.filter((x) => x.staff.id === s.id).map((x) => x.staff_breaks),
      leaves: leaves.filter((x) => x.staff.id === s.id).map((x) => x.staff_leaves),
    })),
    blocks,
  };
}
