import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "../db";
import {
  businessHours,
  holidays,
  resourceTypes,
  resources,
  salonPolicies,
  salons,
  serviceOptionGroups,
  serviceOptions,
  serviceResourceRequirements,
  services,
  staff,
  staffBreaks,
  staffLeaves,
  staffSchedules,
  staffServices,
} from "../db/schema";
import { Errors } from "../http/errors";
import { PgTransaction } from "drizzle-orm/pg-core";

/** Parallel on the pool; sequential inside a transaction (one connection can't multiplex). */
async function all<T extends readonly unknown[]>(ex: Executor, thunks: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> {
  if (ex instanceof PgTransaction) {
    const out: unknown[] = [];
    for (const t of thunks) out.push(await t());
    return out as unknown as T;
  }
  return Promise.all(thunks.map((t) => t())) as unknown as Promise<T>;
}
import { addDaysKey, minutesOfDay, weekdayOf, zonedToUtc } from "@/lib/time";
import type { DayContext, Interval, ServiceSpec } from "./engine-core";

export type SalonPolicy = typeof salonPolicies.$inferSelect;

export const DEFAULT_POLICY: Omit<SalonPolicy, "salonId" | "updatedAt"> = {
  bookingWindowDays: 30,
  minAdvanceMinutes: 30,
  maxBookingMinutes: 480,
  slotIntervalMinutes: 15,
  lockMinutes: 5,
  graceMinutes: 10,
  noShowAfterMinutes: 30,
  lateArrivalMessage: null,
  refundType: "PARTIAL",
  cancellationTiers: [
    { hoursBefore: 24, refundPercent: 100 },
    { hoursBefore: 6, refundPercent: 50 },
  ],
  noShowRefundPercent: 0,
  allowReschedule: true,
  rescheduleMinHours: 2,
  maxReschedules: 2,
  walkInPriority: "BOOKED_FIRST",
  allowPayAtSalon: false,
  waitlistNotifyStrategy: "FIFO",
  notificationPrefs: { newBooking: true, cancellations: true, reviews: true, dailySummary: false },
  policyText: null,
};

export async function getPolicy(ex: Executor, salonId: string) {
  const p = await ex.query.salonPolicies.findFirst({ where: eq(salonPolicies.salonId, salonId) });
  return p ?? { ...DEFAULT_POLICY, salonId, updatedAt: new Date() };
}

export async function getSalonBasics(ex: Executor, salonId: string) {
  const s = await ex.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, name: true, slug: true, citySlug: true, timezone: true, status: true, ownerId: true },
  });
  if (!s) throw Errors.notFound("Salon");
  return s;
}

/** Open intervals (epoch ms) for a date, honouring holidays/special hours. */
async function openIntervals(ex: Executor, salonId: string, dateKey: string, tz: string) {
  const special = await ex.query.holidays.findMany({ where: and(eq(holidays.salonId, salonId), eq(holidays.date, dateKey)) });
  if (special.length) {
    const closed = special.find((h) => h.isClosed);
    if (closed) return { open: [] as Interval[], closedReason: closed.reason ?? "Holiday" };
    return {
      open: special
        .filter((h) => h.openMinute != null && h.closeMinute != null)
        .map((h) => ({ start: zonedToUtc(dateKey, h.openMinute!, tz).getTime(), end: zonedToUtc(dateKey, h.closeMinute!, tz).getTime() })),
      closedReason: null,
    };
  }
  const wd = weekdayOf(dateKey);
  const rows = await ex.query.businessHours.findMany({
    where: and(eq(businessHours.salonId, salonId), eq(businessHours.weekday, wd)),
    orderBy: asc(businessHours.openMinute),
  });
  return {
    open: rows.map((r) => ({ start: zonedToUtc(dateKey, r.openMinute, tz).getTime(), end: zonedToUtc(dateKey, r.closeMinute, tz).getTime() })),
    closedReason: null,
  };
}

export type LoadContextOptions = {
  /** ignore this booking's own reservations (reschedule / move) */
  excludeBookingId?: string;
  /** salons not yet approved can still be operated by their owner */
  allowUnapproved?: boolean;
};

/**
 * Load everything the engine needs for one salon-day in a handful of
 * indexed queries. Expired checkout holds are ignored even before the
 * sweeper deactivates them.
 */
export async function loadDayContext(ex: Executor, salonId: string, dateKey: string, opts: LoadContextOptions = {}) {
  const salon = await getSalonBasics(ex, salonId);
  const tz = salon.timezone;
  const policy = await getPolicy(ex, salonId);
  const dayStart = zonedToUtc(dateKey, 0, tz);
  const dayEnd = zonedToUtc(addDaysKey(dateKey, 1), 0, tz);
  const wd = weekdayOf(dateKey);
  const { open, closedReason } = await openIntervals(ex, salonId, dateKey, tz);

  const [resRows, staffRows] = await all(ex, [
    () => ex
      .select({ id: resources.id, name: resources.name, typeId: resources.resourceTypeId, typeName: resourceTypes.name, sort: resources.sort })
      .from(resources)
      .innerJoin(resourceTypes, eq(resourceTypes.id, resources.resourceTypeId))
      .where(and(eq(resources.salonId, salonId), eq(resources.active, true))),
    () => ex.query.staff.findMany({ where: and(eq(staff.salonId, salonId), eq(staff.active, true)), columns: { id: true, name: true, title: true } }),
  ]);
  const staffIds = staffRows.map((s) => s.id);

  const exclude = opts.excludeBookingId ? sql`and b.id <> ${opts.excludeBookingId}` : sql``;
  const liveHold = sql`(b.status <> 'PAYMENT_PENDING' or b.lock_expires_at > now())`;

  const [skills, shifts, breaks, leaves, resBusy, staffBusy, blocks] = await all(ex, [
    async () => staffIds.length ? ex.select().from(staffServices).where(inArray(staffServices.staffId, staffIds)) : [],
    async () => staffIds.length ? ex.select().from(staffSchedules).where(and(inArray(staffSchedules.staffId, staffIds), eq(staffSchedules.weekday, wd))) : [],
    async () => staffIds.length ? ex.select().from(staffBreaks).where(and(inArray(staffBreaks.staffId, staffIds), eq(staffBreaks.weekday, wd))) : [],
    async () => staffIds.length
      ? ex
          .select()
          .from(staffLeaves)
          .where(and(inArray(staffLeaves.staffId, staffIds), sql`${staffLeaves.startsAt} < ${dayEnd} and ${staffLeaves.endsAt} > ${dayStart}`))
      : [],
    () => ex.execute<{ resource_id: string; starts_at: Date; ends_at: Date }>(sql`
      select br.resource_id, br.starts_at, br.ends_at
      from booking_resources br join bookings b on b.id = br.booking_id
      where br.salon_id = ${salonId} and br.active and br.starts_at < ${dayEnd} and br.ends_at > ${dayStart}
        and ${liveHold} ${exclude}`),
    () => ex.execute<{ staff_id: string; starts_at: Date; ends_at: Date }>(sql`
      select bs.staff_id, bs.starts_at, bs.ends_at
      from booking_staff bs join bookings b on b.id = bs.booking_id
      where bs.salon_id = ${salonId} and bs.active and bs.starts_at < ${dayEnd} and bs.ends_at > ${dayStart}
        and ${liveHold} ${exclude}`),
    () => ex.execute<{ resource_id: string; starts_at: Date; ends_at: Date }>(sql`
      select resource_id, starts_at, ends_at from resource_blocks
      where salon_id = ${salonId} and starts_at < ${dayEnd} and ends_at > ${dayStart}`),
  ]);

  const toI = (r: { starts_at: Date | string; ends_at: Date | string }): Interval => ({
    start: new Date(r.starts_at).getTime(),
    end: new Date(r.ends_at).getTime(),
  });
  const resourceBusy = new Map<string, Interval[]>();
  for (const r of [...resBusy.rows, ...blocks.rows]) {
    const list = resourceBusy.get(r.resource_id) ?? [];
    list.push(toI(r));
    resourceBusy.set(r.resource_id, list);
  }
  const staffBusyMap = new Map<string, Interval[]>();
  const staffLoad = new Map<string, number>();
  for (const r of staffBusy.rows) {
    const list = staffBusyMap.get(r.staff_id) ?? [];
    list.push(toI(r));
    staffBusyMap.set(r.staff_id, list);
    staffLoad.set(r.staff_id, (staffLoad.get(r.staff_id) ?? 0) + 1);
  }
  const at = (m: number) => zonedToUtc(dateKey, m, tz).getTime();

  const ctx: DayContext = {
    salonId,
    timezone: tz,
    bookable: salon.status === "APPROVED" || !!opts.allowUnapproved,
    dateKey,
    open,
    closedReason,
    policy: {
      bookingWindowDays: policy.bookingWindowDays,
      minAdvanceMinutes: policy.minAdvanceMinutes,
      maxBookingMinutes: policy.maxBookingMinutes,
      slotIntervalMinutes: policy.slotIntervalMinutes,
    },
    resources: resRows,
    resourceBusy,
    staff: staffRows.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      serviceIds: new Set(skills.filter((k) => k.staffId === s.id).map((k) => k.serviceId)),
      shifts: shifts.filter((x) => x.staffId === s.id).map((x) => ({ start: at(x.startMinute), end: at(x.endMinute) })),
      breaks: breaks.filter((x) => x.staffId === s.id).map((x) => ({ start: at(x.startMinute), end: at(x.endMinute) })),
      leaves: leaves.filter((x) => x.staffId === s.id).map((x) => ({ start: x.startsAt.getTime(), end: x.endsAt.getTime() })),
    })),
    staffBusy: staffBusyMap,
  };

  return {
    ctx,
    salon,
    policy,
    staffLoad,
    toInstant: at,
    toMinute: (instant: number) => minutesOfDay(new Date(instant), tz),
  };
}

export type ServiceSelection = {
  spec: ServiceSpec;
  service: typeof services.$inferSelect;
  options: { id: string; name: string; groupName: string; priceDelta: number; durationDelta: number }[];
};

/** Load a service + the customer's chosen options, validating option rules. */
export async function loadServiceSelection(ex: Executor, salonId: string, serviceId: string, optionIds: string[] = [], rules: { enforceRequired?: boolean } = {}): Promise<ServiceSelection> {
  const service = await ex.query.services.findFirst({ where: and(eq(services.id, serviceId), eq(services.salonId, salonId)) });
  if (!service) throw Errors.notFound("Service");
  if (!service.active) throw Errors.conflict("SERVICE_INACTIVE", "This service is currently unavailable at this salon.");

  const [reqs, groups] = await all(ex, [
    () => ex
      .select({ resourceTypeId: serviceResourceRequirements.resourceTypeId, quantity: serviceResourceRequirements.quantity, name: resourceTypes.name })
      .from(serviceResourceRequirements)
      .innerJoin(resourceTypes, eq(resourceTypes.id, serviceResourceRequirements.resourceTypeId))
      .where(eq(serviceResourceRequirements.serviceId, serviceId)),
    () => ex.query.serviceOptionGroups.findMany({ where: eq(serviceOptionGroups.serviceId, serviceId) }),
  ]);
  const opts = groups.length
    ? await ex.select().from(serviceOptions).where(inArray(serviceOptions.groupId, groups.map((g) => g.id)))
    : [];

  const unique = [...new Set(optionIds)];
  const chosen = unique.map((oid) => {
    const o = opts.find((x) => x.id === oid);
    if (!o) throw Errors.validation("One of the selected options isn't offered for this service.");
    return o;
  });
  for (const g of groups) {
    const n = chosen.filter((o) => o.groupId === g.id).length;
    if (g.required && n === 0 && rules.enforceRequired !== false) throw Errors.validation(`Please choose an option for "${g.name}".`);
    if (!g.multiSelect && n > 1) throw Errors.validation(`Only one option can be selected for "${g.name}".`);
  }

  const extra = chosen.reduce((s, o) => s + o.durationDelta, 0);
  return {
    service,
    options: chosen.map((o) => ({
      id: o.id,
      name: o.name,
      groupName: groups.find((g) => g.id === o.groupId)!.name,
      priceDelta: o.priceDelta,
      durationDelta: o.durationDelta,
    })),
    spec: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes + extra,
      prepMinutes: service.prepMinutes,
      bufferMinutes: service.bufferMinutes,
      staffRequired: service.staffRequired,
      requirements: reqs.map((r) => ({ resourceTypeId: r.resourceTypeId, resourceTypeName: r.name, quantity: r.quantity })),
    },
  };
}
