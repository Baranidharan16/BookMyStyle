/**
 * Pure availability engine (no I/O) — given one salon-day's full state,
 * decides whether a service can start at an instant and which staff and
 * resources it would use. Everything is expressed in epoch milliseconds so
 * the logic is time-zone and DST safe; conversion from wall-clock happens in
 * the loader. Unit-tested in tests/engine-core.test.ts.
 */

export type Interval = { start: number; end: number };

export type PolicyLimits = {
  bookingWindowDays: number;
  minAdvanceMinutes: number;
  maxBookingMinutes: number;
  slotIntervalMinutes: number;
};

export type CtxResource = { id: string; name: string; typeId: string; typeName: string; sort: number };
export type CtxStaff = {
  id: string;
  name: string;
  title: string;
  serviceIds: Set<string>;
  shifts: Interval[];
  breaks: Interval[];
  leaves: Interval[];
};

export type DayContext = {
  salonId: string;
  timezone: string;
  bookable: boolean;
  dateKey: string;
  open: Interval[];
  closedReason: string | null;
  policy: PolicyLimits;
  resources: CtxResource[];
  /** reservations + maintenance blocks per resource */
  resourceBusy: Map<string, Interval[]>;
  staff: CtxStaff[];
  staffBusy: Map<string, Interval[]>;
};

export type ServiceSpec = {
  id: string;
  name: string;
  /** service time incl. selected option add-ons */
  durationMinutes: number;
  prepMinutes: number;
  bufferMinutes: number;
  staffRequired: number;
  requirements: { resourceTypeId: string; resourceTypeName: string; quantity: number }[];
};

export type UnavailableReason =
  | "SALON_NOT_BOOKABLE"
  | "CLOSED"
  | "OUTSIDE_HOURS"
  | "PAST"
  | "TOO_SOON"
  | "TOO_FAR"
  | "TOO_LONG"
  | "NO_STAFF"
  | "STAFF_UNAVAILABLE"
  | "NO_RESOURCE";

export type SlotEvaluation =
  | {
      available: true;
      startsAt: number;
      endsAt: number;
      occupiedFrom: number;
      occupiedUntil: number;
      staffIds: string[];
      resourceIds: string[];
      /** all staff who could take this slot (for the staff picker) */
      eligibleFreeStaffIds: string[];
    }
  | { available: false; reason: UnavailableReason; message: string; startsAt: number; endsAt: number };

export type EvaluateOptions = {
  now: number;
  staffPreference?: string | null;
  /** walk-ins / owner actions skip "min advance" and "booking window" */
  ignoreAdvanceRules?: boolean;
  /** staff-side: allow starting outside configured hours (still conflict-checked) */
  ignoreHours?: boolean;
  /** force a specific resource for a requirement type (walk-in desk) */
  forcedResourceIds?: string[];
  /** least-loaded staff first */
  staffLoad?: Map<string, number>;
};

const MIN = 60_000;

export const overlapsI = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const covers = (outer: Interval, inner: Interval) => outer.start <= inner.start && outer.end >= inner.end;
const isFree = (busy: Interval[] | undefined, w: Interval) => !busy?.some((b) => overlapsI(b, w));

export function occupiedWindow(spec: ServiceSpec, startsAt: number) {
  const endsAt = startsAt + spec.durationMinutes * MIN;
  return {
    startsAt,
    endsAt,
    occupiedFrom: startsAt - spec.prepMinutes * MIN,
    occupiedUntil: endsAt + spec.bufferMinutes * MIN,
  };
}

export function reasonMessage(reason: UnavailableReason, ctx: DayContext, extra: { staffName?: string; resourceType?: string } = {}) {
  switch (reason) {
    case "SALON_NOT_BOOKABLE":
      return "This salon isn't accepting online bookings right now.";
    case "CLOSED":
      return ctx.closedReason ? `The salon is closed on this day (${ctx.closedReason}).` : "The salon is closed on this day.";
    case "OUTSIDE_HOURS":
      return "This time is outside the salon's working hours.";
    case "PAST":
      return "That time has already passed. Please pick a later slot.";
    case "TOO_SOON":
      return `Bookings must be made at least ${ctx.policy.minAdvanceMinutes} minutes in advance.`;
    case "TOO_FAR":
      return `This salon accepts bookings up to ${ctx.policy.bookingWindowDays} days ahead.`;
    case "TOO_LONG":
      return "This service combination is longer than the salon allows for a single booking.";
    case "NO_STAFF":
      return "No stylist who performs this service is free at this time.";
    case "STAFF_UNAVAILABLE":
      return `${extra.staffName ?? "Your preferred stylist"} isn't available at this time. Try another stylist or time.`;
    case "NO_RESOURCE":
      return `All ${extra.resourceType ? pluralize(extra.resourceType) : "stations"} are occupied at this time.`;
  }
}

function pluralize(s: string) {
  return /s$/i.test(s) ? s : `${s}s`;
}

/** Can this staff member perform the service across window `w`? */
function staffCanWork(st: CtxStaff, spec: ServiceSpec, serviceWindow: Interval, reservedWindow: Interval, ctx: DayContext) {
  if (!st.serviceIds.has(spec.id)) return false;
  if (!st.shifts.some((s) => covers(s, serviceWindow))) return false;
  if (st.breaks.some((b) => overlapsI(b, serviceWindow))) return false;
  if (st.leaves.some((l) => overlapsI(l, reservedWindow))) return false;
  return isFree(ctx.staffBusy.get(st.id), reservedWindow);
}

export function evaluateSlot(ctx: DayContext, spec: ServiceSpec, startsAt: number, opts: EvaluateOptions): SlotEvaluation {
  const w = occupiedWindow(spec, startsAt);
  const fail = (reason: UnavailableReason, extra?: { staffName?: string; resourceType?: string }): SlotEvaluation => ({
    available: false,
    reason,
    message: reasonMessage(reason, ctx, extra),
    startsAt: w.startsAt,
    endsAt: w.endsAt,
  });

  if (!ctx.bookable) return fail("SALON_NOT_BOOKABLE");
  if (spec.durationMinutes + spec.prepMinutes > ctx.policy.maxBookingMinutes) return fail("TOO_LONG");

  if (!opts.ignoreAdvanceRules) {
    if (startsAt < opts.now) return fail("PAST");
    if (startsAt < opts.now + ctx.policy.minAdvanceMinutes * MIN) return fail("TOO_SOON");
    if (startsAt > opts.now + ctx.policy.bookingWindowDays * 1440 * MIN) return fail("TOO_FAR");
  }

  // The prep + service portion must fit inside one open interval. Cleanup
  // buffer may run past closing (it doesn't involve the customer).
  const serviceWindow: Interval = { start: w.occupiedFrom, end: w.endsAt };
  const reserved: Interval = { start: w.occupiedFrom, end: w.occupiedUntil };
  if (!opts.ignoreHours) {
    if (ctx.open.length === 0) return fail("CLOSED");
    if (!ctx.open.some((o) => covers(o, serviceWindow))) return fail("OUTSIDE_HOURS");
  }

  // ---- resources: every requirement must be satisfiable simultaneously
  const resourceIds: string[] = [];
  for (const req of spec.requirements) {
    let candidates = ctx.resources.filter((r) => r.typeId === req.resourceTypeId);
    // a forced resource (picked at the walk-in desk) narrows its own type only
    const forced = candidates.filter((r) => opts.forcedResourceIds?.includes(r.id));
    if (forced.length) candidates = forced;
    candidates.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    const free = candidates.filter((r) => isFree(ctx.resourceBusy.get(r.id), reserved));
    if (free.length < req.quantity) return fail("NO_RESOURCE", { resourceType: req.resourceTypeName });
    resourceIds.push(...free.slice(0, req.quantity).map((r) => r.id));
  }

  // ---- staff
  let staffIds: string[] = [];
  let eligibleFree: string[] = [];
  if (spec.staffRequired > 0) {
    eligibleFree = ctx.staff.filter((s) => staffCanWork(s, spec, serviceWindow, reserved, ctx)).map((s) => s.id);
    if (opts.staffPreference) {
      const pref = ctx.staff.find((s) => s.id === opts.staffPreference);
      if (!pref || !eligibleFree.includes(pref.id)) return fail("STAFF_UNAVAILABLE", { staffName: pref?.name });
      const others = eligibleFree.filter((id) => id !== pref.id);
      staffIds = [pref.id, ...sortByLoad(others, opts.staffLoad)].slice(0, spec.staffRequired);
    } else {
      staffIds = sortByLoad(eligibleFree, opts.staffLoad).slice(0, spec.staffRequired);
    }
    if (staffIds.length < spec.staffRequired) return fail("NO_STAFF");
  }

  return {
    available: true,
    ...w,
    staffIds,
    resourceIds,
    eligibleFreeStaffIds: eligibleFree,
  };
}

function sortByLoad(ids: string[], load?: Map<string, number>) {
  if (!load) return ids;
  return [...ids].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
}

export type SlotInfo = {
  minute: number;
  startsAt: string;
  available: boolean;
  reason?: UnavailableReason;
  message?: string;
  freeStaffIds?: string[];
};

/**
 * All candidate start times for the day. `toInstant` converts a local
 * minute-of-day to epoch ms (provided by the loader, tz-aware).
 */
export function listSlots(
  ctx: DayContext,
  spec: ServiceSpec,
  toInstant: (minute: number) => number,
  toMinute: (instant: number) => number,
  opts: EvaluateOptions,
): SlotInfo[] {
  const step = Math.max(5, ctx.policy.slotIntervalMinutes);
  const out: SlotInfo[] = [];
  const seen = new Set<number>();
  for (const o of ctx.open) {
    const openMin = toMinute(o.start);
    // the first slot starts after the prep time
    let m = Math.ceil((openMin + spec.prepMinutes) / step) * step;
    for (; ; m += step) {
      const startsAt = toInstant(m);
      if (startsAt + spec.durationMinutes * MIN > o.end) break;
      if (seen.has(m)) continue;
      seen.add(m);
      const ev = evaluateSlot(ctx, spec, startsAt, opts);
      out.push(
        ev.available
          ? { minute: m, startsAt: new Date(startsAt).toISOString(), available: true, freeStaffIds: ev.eligibleFreeStaffIds }
          : { minute: m, startsAt: new Date(startsAt).toISOString(), available: false, reason: ev.reason, message: ev.message },
      );
    }
  }
  return out.sort((a, b) => a.minute - b.minute);
}
