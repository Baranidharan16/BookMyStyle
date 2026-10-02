import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { and, count, eq, inArray, lte, sql } from "drizzle-orm";
import { db, type Executor, type Tx } from "../db";
import {
  bookingItems,
  bookingResources,
  bookingStaff,
  bookingStatusHistory,
  bookings,
  couponUsage,
  coupons,
  payments,
  refunds,
  salons,
  services,
  staff,
  waitingQueue,
  waitlistEntries,
  walkInCustomers,
} from "../db/schema";
import { audit } from "../audit";
import { requireSalonAccess, type SalonAccess } from "../auth/access";
import type { SessionUser } from "../auth/session";
import { AppError, Errors, PG, pgCode } from "../http/errors";
import { notify, notifySalonTeam } from "../notifications";
import { getPaymentProvider } from "../payments";
import { bookingChangedEvents, channels, publish } from "../realtime/publish";
import { getPlatformConfig } from "../settings";
import { formatINR } from "@/lib/utils";
import { formatDate, formatTime, isValidDateKey, minutesOfDay, toDateKey, weekdayOf } from "@/lib/time";
import { loadDayContext, loadServiceSelection, getPolicy, type ServiceSelection } from "./context";
import { evaluateSlot, occupiedWindow, type ServiceSpec } from "./engine-core";
import { checkCoupon, computeQuote, refundForCancellation, refundForNoShow, type RefundPolicy } from "./policy-core";

type BookingRow = typeof bookings.$inferSelect;
export type BookingStatus = BookingRow["status"];

export const ACTIVE_STATUSES: BookingStatus[] = ["PAYMENT_PENDING", "CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE"];

/* ================================================================ helpers */

/** Serialise booking writes per salon (rare contention; exclusion constraints remain the final guarantee). */
async function lockSalon(tx: Tx, salonId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${salonId}, 42))`);
}

async function lockBooking(tx: Tx, bookingId: string) {
  const res = await tx.execute<{ id: string }>(sql`select id from bookings where id = ${bookingId} for update`);
  if (!res.rows.length) throw Errors.notFound("Booking");
  const b = await tx.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  return b!;
}

async function generateCode(ex: Executor, startsAt: Date, tz: string) {
  const day = toDateKey(startsAt, tz).replaceAll("-", "");
  for (let i = 0; i < 8; i++) {
    const code = `SAL-${day}-${String(randomInt(0, i < 4 ? 10_000 : 1_000_000)).padStart(4, "0")}`;
    const exists = await ex.query.bookings.findFirst({ where: eq(bookings.code, code), columns: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not allocate a booking code");
}

async function recordStatus(ex: Executor, bookingId: string, from: BookingStatus | null, to: BookingStatus, actorId: string | null, note?: string) {
  await ex.insert(bookingStatusHistory).values({ bookingId, fromStatus: from, toStatus: to, actorId, note });
}

async function releaseReservations(ex: Executor, bookingId: string) {
  await ex.update(bookingResources).set({ active: false }).where(eq(bookingResources.bookingId, bookingId));
  await ex.update(bookingStaff).set({ active: false }).where(eq(bookingStaff.bookingId, bookingId));
}

async function insertReservations(
  ex: Executor,
  b: { id: string; salonId: string },
  w: { occupiedFrom: number; occupiedUntil: number },
  resourceIds: string[],
  staffIds: string[],
  allowOverlap = false,
) {
  const startsAt = new Date(w.occupiedFrom);
  const endsAt = new Date(w.occupiedUntil);
  if (resourceIds.length) {
    await ex.insert(bookingResources).values(resourceIds.map((resourceId) => ({ bookingId: b.id, salonId: b.salonId, resourceId, startsAt, endsAt, allowOverlap })));
  }
  if (staffIds.length) {
    await ex.insert(bookingStaff).values(staffIds.map((staffId) => ({ bookingId: b.id, salonId: b.salonId, staffId, startsAt, endsAt, allowOverlap })));
  }
}

function rethrowSlotConflicts(e: unknown): never {
  const code = pgCode(e);
  if (code === PG.EXCLUSION_VIOLATION || code === PG.SERIALIZATION_FAILURE || code === PG.DEADLOCK) throw Errors.slotTaken();
  throw e;
}

function bookingEvents(b: Pick<BookingRow, "id" | "salonId" | "customerId" | "status" | "startsAt">, tz: string) {
  return bookingChangedEvents({ ...b, date: toDateKey(b.startsAt, tz) });
}

async function salonTz(ex: Executor, salonId: string) {
  const s = await ex.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { timezone: true, name: true } });
  return { tz: s?.timezone ?? "Asia/Kolkata", name: s?.name ?? "the salon" };
}

/** Notify waitlisted customers when time frees up at a salon. */
async function notifyWaitlist(ex: Executor, salonId: string, freed: { startsAt: Date; endsAt: Date }) {
  const policy = await getPolicy(ex, salonId);
  const { tz, name } = await salonTz(ex, salonId);
  const date = toDateKey(freed.startsAt, tz);
  const fromMin = minutesOfDay(freed.startsAt, tz);
  const toMin = minutesOfDay(freed.endsAt, tz) || 1440;
  const entries = await ex
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.salonId, salonId),
        eq(waitlistEntries.date, date),
        eq(waitlistEntries.status, "ACTIVE"),
        sql`${waitlistEntries.fromMinute} < ${toMin} and ${waitlistEntries.toMinute} > ${fromMin}`,
      ),
    )
    .orderBy(waitlistEntries.createdAt);
  const targets = policy.waitlistNotifyStrategy === "BROADCAST" ? entries : entries.slice(0, 1);
  const salon = await ex.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { slug: true, citySlug: true } });
  for (const e of targets) {
    await ex.update(waitlistEntries).set({ status: "NOTIFIED", notifiedAt: new Date() }).where(eq(waitlistEntries.id, e.id));
    await notify(ex, e.customerId, {
      category: "BOOKING",
      type: "waitlist.slot_open",
      title: "A slot just opened up",
      body: `${name} has availability around ${formatTime(freed.startsAt, tz)} on ${formatDate(freed.startsAt, tz)}. Book quickly — slots go fast.`,
      link: salon ? `/salons/${salon.citySlug}/${salon.slug}?service=${e.serviceId}&date=${date}` : undefined,
    });
  }
}

/* ============================================================== coupons */

export async function resolveCoupon(
  ex: Executor,
  input: { code: string; salonId: string; serviceId: string; subtotal: number; userId: string | null; startsAt: Date; tz: string },
) {
  const code = input.code.trim().toUpperCase();
  const rows = await ex
    .select()
    .from(coupons)
    .where(and(sql`upper(${coupons.code}) = ${code}`, sql`(${coupons.salonId} = ${input.salonId} or ${coupons.salonId} is null)`));
  const coupon = rows.find((c) => c.salonId === input.salonId) ?? rows[0];
  if (!coupon) throw Errors.validation("That coupon code isn't valid for this salon.");

  let userUses = 0, platformPrior = 0, salonPrior = 0;
  if (input.userId) {
    const [u] = await ex.select({ n: count() }).from(couponUsage).where(and(eq(couponUsage.couponId, coupon.id), eq(couponUsage.userId, input.userId)));
    const prior = await ex
      .select({ salonId: bookings.salonId })
      .from(bookings)
      .where(and(eq(bookings.customerId, input.userId), inArray(bookings.status, ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE", "COMPLETED"])));
    userUses = u?.n ?? 0;
    platformPrior = prior.length;
    salonPrior = prior.filter((p) => p.salonId === input.salonId).length;
  }
  const res = checkCoupon(coupon, {
    now: new Date(),
    subtotal: input.subtotal,
    serviceId: input.serviceId,
    appointmentWeekday: weekdayOf(toDateKey(input.startsAt, input.tz)),
    appointmentMinute: minutesOfDay(input.startsAt, input.tz),
    userUses,
    customerPriorBookingsPlatform: platformPrior,
    customerPriorBookingsSalon: salonPrior,
  });
  if (!res.ok) throw Errors.validation(res.message);
  return { coupon, discount: res.discount };
}

export function selectionSubtotal(sel: ServiceSelection) {
  return sel.service.price + sel.options.reduce((s, o) => s + o.priceDelta, 0);
}

/** Price preview used by the review step (no hold is created). */
export async function quoteBooking(
  user: SessionUser | null,
  input: { salonId: string; serviceId: string; optionIds: string[]; date: string; startMinute: number; couponCode?: string },
) {
  const sel = await loadServiceSelection(db, input.salonId, input.serviceId, input.optionIds);
  const { tz } = await salonTz(db, input.salonId);
  const { zonedToUtc } = await import("@/lib/time");
  const startsAt = zonedToUtc(input.date, input.startMinute, tz);
  const subtotal = selectionSubtotal(sel);
  let discount = 0;
  let couponError: string | null = null;
  let couponTitle: string | null = null;
  if (input.couponCode) {
    try {
      const r = await resolveCoupon(db, { code: input.couponCode, salonId: input.salonId, serviceId: input.serviceId, subtotal, userId: user?.id ?? null, startsAt, tz });
      discount = r.discount;
      couponTitle = r.coupon.title;
    } catch (e) {
      couponError = e instanceof AppError ? e.message : "Couldn't apply this coupon.";
    }
  }
  const cfg = await getPlatformConfig();
  return { ...computeQuote(subtotal, discount, cfg.gstPercent), couponError, couponTitle, durationMinutes: sel.spec.durationMinutes };
}

/* ========================================================= expire holds */

/** Release checkout holds whose payment window passed. Safe to run concurrently. */
export async function expireHolds(ex: Executor, salonId?: string) {
  const expired = await ex
    .update(bookings)
    .set({ status: "FAILED", paymentStatus: "FAILED", cancelReason: "CHECKOUT_TIMEOUT", lockExpiresAt: null })
    .where(
      and(
        eq(bookings.status, "PAYMENT_PENDING"),
        lte(bookings.lockExpiresAt, new Date()),
        salonId ? eq(bookings.salonId, salonId) : undefined,
      ),
    )
    .returning();
  for (const b of expired) {
    await releaseReservations(ex, b.id);
    await recordStatus(ex, b.id, "PAYMENT_PENDING", "FAILED", null, "Payment window expired — slot released");
    const { tz } = await salonTz(ex, b.salonId);
    await publish(ex, bookingEvents(b, tz));
    await notifyWaitlist(ex, b.salonId, { startsAt: b.startsAt, endsAt: b.endsAt });
  }
  return expired.length;
}

/* ============================================================ hold slot */

export type HoldInput = {
  salonId: string;
  serviceId: string;
  optionIds: string[];
  date: string;
  startMinute: number;
  staffPreference?: string | null;
  couponCode?: string | null;
  notes?: string | null;
  requirements?: string | null;
};

/**
 * Step 1 of checkout: atomically re-validate the slot and place a short
 * hold (status PAYMENT_PENDING) on concrete staff + resources. The hold is a
 * real reservation guarded by the DB exclusion constraints, so two customers
 * can never both hold the last chair.
 */
export async function holdSlot(user: SessionUser, input: HoldInput) {
  if (!isValidDateKey(input.date)) throw Errors.validation("Please choose a valid date.");
  try {
    return await db.transaction(async (tx) => {
      await lockSalon(tx, input.salonId);
      await expireHolds(tx, input.salonId);

      // A customer has at most one open checkout per salon: drop abandoned ones.
      const abandoned = await tx
        .update(bookings)
        .set({ status: "FAILED", paymentStatus: "FAILED", cancelReason: "SUPERSEDED", lockExpiresAt: null })
        .where(and(eq(bookings.customerId, user.id), eq(bookings.salonId, input.salonId), eq(bookings.status, "PAYMENT_PENDING")))
        .returning({ id: bookings.id });
      for (const a of abandoned) {
        await releaseReservations(tx, a.id);
        await recordStatus(tx, a.id, "PAYMENT_PENDING", "FAILED", user.id, "Replaced by a newer checkout");
      }

      const sel = await loadServiceSelection(tx, input.salonId, input.serviceId, input.optionIds);
      const { ctx, salon, policy, staffLoad, toInstant } = await loadDayContext(tx, input.salonId, input.date);
      const startsAt = toInstant(input.startMinute);
      const ev = evaluateSlot(ctx, sel.spec, startsAt, { now: Date.now(), staffPreference: input.staffPreference, staffLoad });
      if (!ev.available) throw Errors.conflict(ev.reason, ev.message, { reason: ev.reason });

      const subtotal = selectionSubtotal(sel);
      let discount = 0;
      let couponId: string | null = null;
      if (input.couponCode) {
        const r = await resolveCoupon(tx, {
          code: input.couponCode,
          salonId: input.salonId,
          serviceId: input.serviceId,
          subtotal,
          userId: user.id,
          startsAt: new Date(startsAt),
          tz: salon.timezone,
        });
        discount = r.discount;
        couponId = r.coupon.id;
      }
      const cfg = await getPlatformConfig(tx);
      const quote = computeQuote(subtotal, discount, cfg.gstPercent);

      const [b] = await tx
        .insert(bookings)
        .values({
          code: await generateCode(tx, new Date(startsAt), salon.timezone),
          salonId: input.salonId,
          customerId: user.id,
          customerName: user.name,
          customerPhone: user.phone,
          serviceId: sel.service.id,
          source: "ONLINE",
          status: "PAYMENT_PENDING",
          startsAt: new Date(ev.startsAt),
          endsAt: new Date(ev.endsAt),
          occupiedFrom: new Date(ev.occupiedFrom),
          occupiedUntil: new Date(ev.occupiedUntil),
          durationMinutes: sel.spec.durationMinutes,
          subtotal: quote.subtotal,
          discount: quote.discount,
          tax: quote.tax,
          total: quote.total,
          couponId,
          paymentStatus: "INITIATED",
          paymentMode: "ONLINE",
          staffPreference: input.staffPreference ?? null,
          customerNotes: input.notes?.trim() || null,
          requirements: input.requirements?.trim() || null,
          lockExpiresAt: new Date(Date.now() + policy.lockMinutes * 60_000),
          checkInToken: randomBytes(16).toString("base64url"),
          createdBy: user.id,
        })
        .returning();
      await tx.insert(bookingItems).values([
        { bookingId: b!.id, kind: "SERVICE", name: sel.service.name, price: sel.service.price, durationMinutes: sel.service.durationMinutes, serviceId: sel.service.id },
        ...sel.options.map((o) => ({
          bookingId: b!.id,
          kind: "OPTION",
          name: o.name,
          groupName: o.groupName,
          price: o.priceDelta,
          durationMinutes: o.durationDelta,
          optionId: o.id,
        })),
      ]);
      await insertReservations(tx, b!, ev, ev.resourceIds, ev.staffIds);
      await recordStatus(tx, b!.id, null, "PAYMENT_PENDING", user.id, `Slot held for ${policy.lockMinutes} minutes`);
      await publish(tx, bookingEvents(b!, salon.timezone));
      return b!;
    });
  } catch (e) {
    rethrowSlotConflicts(e);
  }
}

/* ======================================================= confirm payment */

export type ConfirmResult = { outcome: "CONFIRMED" | "ALREADY_CONFIRMED" | "SLOT_LOST"; booking: BookingRow };

/**
 * Step 3 of checkout — only ever called after the payment was verified
 * server-side (signature + provider record). Idempotent. If the hold had
 * expired and the slot was taken meanwhile, the booking fails and a full
 * refund is issued automatically.
 */
export async function confirmPaidBooking(
  tx: Tx,
  bookingId: string,
  payment: { paymentRowId: string; amount: number; method: string | null },
): Promise<ConfirmResult> {
  const b = await lockBooking(tx, bookingId);
  const { tz, name: salonName } = await salonTz(tx, b.salonId);

  if (!["PAYMENT_PENDING", "FAILED", "CANCELLED"].includes(b.status)) return { outcome: "ALREADY_CONFIRMED", booking: b };
  if (payment.amount !== b.total) throw Errors.conflict("AMOUNT_MISMATCH", "The paid amount does not match the booking total.");
  const alreadyRefunding = await tx.query.refunds.findFirst({ where: eq(refunds.paymentId, payment.paymentRowId) });
  if (alreadyRefunding) return { outcome: "SLOT_LOST", booking: b };

  if (b.status === "FAILED" || b.status === "CANCELLED") {
    // Payment arrived after the hold expired: try to re-acquire the exact same reservations.
    let reacquired = b.status === "FAILED" && (b.cancelReason === "CHECKOUT_TIMEOUT" || b.cancelReason === "SUPERSEDED");
    if (reacquired) {
      try {
        await tx.transaction(async (sp) => {
          await sp.update(bookingResources).set({ active: true }).where(eq(bookingResources.bookingId, b.id));
          await sp.update(bookingStaff).set({ active: true }).where(eq(bookingStaff.bookingId, b.id));
        });
      } catch (e) {
        if (pgCode(e) !== PG.EXCLUSION_VIOLATION) throw e;
        reacquired = false;
      }
    }
    if (!reacquired) {
      await recordStatus(tx, b.id, b.status, b.status, null, "Payment received after the slot was released — refunding in full");
      await tx.insert(refunds).values({ paymentId: payment.paymentRowId, bookingId: b.id, amount: payment.amount, reason: "Slot no longer available after payment" });
      if (b.customerId) {
        await notify(tx, b.customerId, {
          category: "PAYMENT",
          type: "payment.refund_slot_lost",
          title: "Booking couldn't be confirmed",
          body: `Your payment for ${salonName} arrived after the hold expired and the slot was taken. A full refund of ${formatINR(payment.amount)} has been initiated.`,
          link: `/customer/bookings/${b.id}`,
        });
      }
      return { outcome: "SLOT_LOST", booking: b };
    }
  }

  const [updated] = await tx
    .update(bookings)
    .set({ status: "CONFIRMED", paymentStatus: "SUCCESSFUL", lockExpiresAt: null, cancelReason: null })
    .where(eq(bookings.id, b.id))
    .returning();
  await recordStatus(tx, b.id, b.status, "CONFIRMED", b.customerId, `Payment verified${payment.method ? ` (${payment.method})` : ""}`);

  if (b.couponId) {
    await tx.insert(couponUsage).values({ couponId: b.couponId, bookingId: b.id, userId: b.customerId, discount: b.discount }).onConflictDoNothing();
    await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, b.couponId));
  }
  await audit(tx, { actorId: b.customerId, salonId: b.salonId, action: "payment.verified", entity: "booking", entityId: b.id, newValue: { amount: payment.amount } });

  const svc = await tx.query.services.findFirst({ where: eq(services.id, b.serviceId), columns: { name: true } });
  if (b.customerId) {
    await notify(tx, b.customerId, {
      category: "BOOKING",
      type: "booking.confirmed",
      title: "Booking confirmed 🎉",
      body: `${svc?.name} at ${salonName} on ${formatDate(b.startsAt, tz)}, ${formatTime(b.startsAt, tz)}. Booking ID ${b.code}.`,
      link: `/customer/bookings/${b.id}`,
    });
    await notify(tx, b.customerId, {
      category: "PAYMENT",
      type: "payment.success",
      title: "Payment successful",
      body: `${formatINR(payment.amount)} received for booking ${b.code}.`,
      link: `/customer/bookings/${b.id}`,
    });
  }
  const policy = await getPolicy(tx, b.salonId);
  if (policy.notificationPrefs.newBooking) {
    await notifySalonTeam(tx, b.salonId, {
      category: "BOOKING",
      type: "salon.new_booking",
      title: "New online booking",
      body: `${b.customerName} · ${svc?.name} · ${formatDate(b.startsAt, tz)} ${formatTime(b.startsAt, tz)}`,
      link: `/business/bookings?focus=${b.id}`,
    }, { includeStaff: true });
  }
  await publish(tx, bookingEvents(updated!, tz));
  return { outcome: "CONFIRMED", booking: updated! };
}

/* ================================================================ refunds */

/** Execute a pending refund with the provider (outside the business transaction). */
export async function processRefund(refundId: string) {
  const r = await db.query.refunds.findFirst({ where: eq(refunds.id, refundId) });
  if (!r || r.status !== "PENDING") return r;
  const p = await db.query.payments.findFirst({ where: eq(payments.id, r.paymentId) });
  if (!p) return r;
  if (p.provider === "offline") return r; // settled at the counter by the salon; owner marks processed

  try {
    if (!p.providerPaymentId) throw new Error("Payment has no provider reference");
    const provider = getPaymentProvider(p.provider as "razorpay" | "sandbox");
    const res = await provider.refund(p.providerPaymentId, r.amount, { booking: r.bookingId });
    await db.transaction(async (tx) => {
      await tx
        .update(refunds)
        .set({ providerRefundId: res.refundId, status: res.status === "processed" ? "PROCESSED" : "PENDING", processedAt: res.status === "processed" ? new Date() : null })
        .where(eq(refunds.id, r.id));
      if (res.status === "processed") await settleRefundTotals(tx, p.id, r.bookingId);
      await audit(tx, { action: "refund.processed", entity: "refund", entityId: r.id, newValue: { amount: r.amount, providerRefundId: res.refundId } });
    });
  } catch (e) {
    await db.update(refunds).set({ status: "FAILED", failureReason: (e as Error).message.slice(0, 500) }).where(eq(refunds.id, r.id));
    console.error("[refund] failed", r.id, e);
  }
  return db.query.refunds.findFirst({ where: eq(refunds.id, refundId) });
}

/** Recompute payment/booking payment status from processed refunds. */
export async function settleRefundTotals(tx: Executor, paymentId: string, bookingId: string) {
  const p = await tx.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!p) return;
  const res = await tx.execute<{ total: number }>(sql`select coalesce(sum(amount),0)::int as total from refunds where payment_id = ${paymentId} and status = 'PROCESSED'`);
  const refunded = res.rows[0]?.total ?? 0;
  const status = refunded >= p.amount ? "REFUNDED" : refunded > 0 ? "PARTIALLY_REFUNDED" : p.status;
  await tx.update(payments).set({ status }).where(eq(payments.id, paymentId));
  await tx.update(bookings).set({ paymentStatus: status }).where(eq(bookings.id, bookingId));
  const b = await tx.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (b?.customerId && refunded > 0) {
    await notify(tx, b.customerId, {
      category: "PAYMENT",
      type: "refund.processed",
      title: "Refund processed",
      body: `${formatINR(refunded)} has been refunded for booking ${b.code}. It may take 5–7 working days to reflect.`,
      link: `/customer/bookings/${b.id}`,
    });
  }
}

async function successfulPayment(ex: Executor, bookingId: string) {
  return ex.query.payments.findFirst({ where: and(eq(payments.bookingId, bookingId), eq(payments.status, "SUCCESSFUL")) });
}

/* ================================================================ cancel */

async function bookingAccess(user: SessionUser, b: BookingRow, permission?: "MANAGE_BOOKINGS" | "CHECK_IN" | "WALK_IN") {
  if (user.role === "CUSTOMER") {
    if (b.customerId !== user.id) throw Errors.notFound("Booking");
    return null;
  }
  return requireSalonAccess(user, b.salonId, permission);
}

export async function cancelBooking(user: SessionUser, bookingId: string, reason?: string) {
  const pre = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!pre) throw Errors.notFound("Booking");
  const access = await bookingAccess(user, pre, "MANAGE_BOOKINGS");
  const bySalon = !!access;

  const result = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    const allowed: BookingStatus[] = bySalon ? ["PAYMENT_PENDING", "CONFIRMED", "CHECKED_IN", "WAITING"] : ["PAYMENT_PENDING", "CONFIRMED"];
    if (!allowed.includes(b.status)) {
      throw Errors.conflict("NOT_CANCELLABLE", b.status === "CANCELLED" ? "This booking is already cancelled." : "This booking can no longer be cancelled.");
    }
    const { tz, name: salonName } = await salonTz(tx, b.salonId);
    const policy = await getPolicy(tx, b.salonId);
    const hoursBefore = (b.startsAt.getTime() - Date.now()) / 3_600_000;
    const pay = await successfulPayment(tx, b.id);
    const decision = bySalon
      ? { percent: 100, amount: pay?.amount ?? 0, explanation: "Cancelled by the salon — full refund." }
      : refundForCancellation(policy as RefundPolicy, pay?.amount ?? 0, hoursBefore);

    const [updated] = await tx
      .update(bookings)
      .set({ status: "CANCELLED", cancelledAt: new Date(), cancelledBy: user.id, cancelReason: reason?.slice(0, 500) || (bySalon ? "Cancelled by salon" : "Cancelled by customer"), lockExpiresAt: null })
      .where(eq(bookings.id, b.id))
      .returning();
    await releaseReservations(tx, b.id);
    await tx.update(waitingQueue).set({ status: "LEFT" }).where(eq(waitingQueue.bookingId, b.id));
    await recordStatus(tx, b.id, b.status, "CANCELLED", user.id, decision.explanation);

    let refundId: string | null = null;
    if (pay && decision.amount > 0) {
      const [r] = await tx.insert(refunds).values({ paymentId: pay.id, bookingId: b.id, amount: decision.amount, reason: decision.explanation }).returning({ id: refunds.id });
      refundId = r!.id;
    }
    await audit(tx, {
      actorId: user.id,
      salonId: b.salonId,
      action: bySalon ? "booking.cancelled_by_salon" : "booking.cancelled_by_customer",
      entity: "booking",
      entityId: b.id,
      oldValue: { status: b.status },
      newValue: { status: "CANCELLED", refund: decision.amount },
    });

    const when = `${formatDate(b.startsAt, tz)}, ${formatTime(b.startsAt, tz)}`;
    if (b.customerId && b.status !== "PAYMENT_PENDING") {
      await notify(tx, b.customerId, {
        category: "BOOKING",
        type: "booking.cancelled",
        title: bySalon ? "Your booking was cancelled by the salon" : "Booking cancelled",
        body: `${salonName} · ${when}. ${decision.amount > 0 ? `Refund of ${formatINR(decision.amount)} initiated.` : decision.explanation}`,
        link: `/customer/bookings/${b.id}`,
      });
    }
    if (!bySalon && policy.notificationPrefs.cancellations && b.status !== "PAYMENT_PENDING") {
      await notifySalonTeam(tx, b.salonId, {
        category: "BOOKING",
        type: "salon.booking_cancelled",
        title: "Booking cancelled by customer",
        body: `${b.customerName} cancelled ${b.code} (${when}).`,
        link: `/business/bookings?focus=${b.id}`,
      }, { includeStaff: true });
    }
    await publish(tx, bookingEvents(updated!, tz));
    await notifyWaitlist(tx, b.salonId, { startsAt: b.startsAt, endsAt: b.endsAt });
    return { booking: updated!, refund: decision, refundId };
  });

  if (result.refundId) await processRefund(result.refundId);
  return result;
}

/** What would the customer get back if they cancelled now? */
export async function cancellationPreview(user: SessionUser, bookingId: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!b) throw Errors.notFound("Booking");
  const access = await bookingAccess(user, b);
  const policy = await getPolicy(db, b.salonId);
  const pay = await successfulPayment(db, b.id);
  if (access) return { percent: 100, amount: pay?.amount ?? 0, explanation: "Cancelled by the salon — full refund." };
  return refundForCancellation(policy as RefundPolicy, pay?.amount ?? 0, (b.startsAt.getTime() - Date.now()) / 3_600_000);
}

/* ============================================================ reschedule */

async function selectionForBooking(ex: Executor, b: BookingRow) {
  const items = await ex.query.bookingItems.findMany({ where: eq(bookingItems.bookingId, b.id) });
  const optionIds = items.filter((i) => i.optionId).map((i) => i.optionId!);
  return loadServiceSelection(ex, b.salonId, b.serviceId, optionIds);
}

export type RescheduleInput = { date: string; startMinute: number; staffPreference?: string | null };

/** Customer reschedule: full re-validation against the configured policy. */
export async function rescheduleBooking(user: SessionUser, bookingId: string, input: RescheduleInput) {
  if (!isValidDateKey(input.date)) throw Errors.validation("Please choose a valid date.");
  const pre = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!pre) throw Errors.notFound("Booking");
  if (pre.customerId !== user.id) throw Errors.notFound("Booking");

  try {
    return await db.transaction(async (tx) => {
      await lockSalon(tx, pre.salonId);
      const b = await lockBooking(tx, bookingId);
      if (b.status !== "CONFIRMED") throw Errors.conflict("NOT_RESCHEDULABLE", "Only confirmed upcoming bookings can be rescheduled.");
      const policy = await getPolicy(tx, b.salonId);
      if (!policy.allowReschedule) throw Errors.conflict("RESCHEDULE_DISABLED", "This salon doesn't allow rescheduling. You can cancel as per the cancellation policy.");
      if (b.rescheduleCount >= policy.maxReschedules) throw Errors.conflict("RESCHEDULE_LIMIT", `This booking has already been rescheduled the maximum of ${policy.maxReschedules} times.`);
      if (b.startsAt.getTime() - Date.now() < policy.rescheduleMinHours * 3_600_000) {
        throw Errors.conflict("RESCHEDULE_TOO_LATE", `Rescheduling is allowed up to ${policy.rescheduleMinHours} hours before the appointment.`);
      }
      await expireHolds(tx, b.salonId);
      const sel = await selectionForBooking(tx, b);
      const { ctx, salon, staffLoad, toInstant } = await loadDayContext(tx, b.salonId, input.date, { excludeBookingId: b.id });
      const ev = evaluateSlot(ctx, sel.spec, toInstant(input.startMinute), { now: Date.now(), staffPreference: input.staffPreference, staffLoad });
      if (!ev.available) throw Errors.conflict(ev.reason, ev.message, { reason: ev.reason });

      await releaseReservations(tx, b.id);
      await insertReservations(tx, b, ev, ev.resourceIds, ev.staffIds);
      const [updated] = await tx
        .update(bookings)
        .set({
          startsAt: new Date(ev.startsAt),
          endsAt: new Date(ev.endsAt),
          occupiedFrom: new Date(ev.occupiedFrom),
          occupiedUntil: new Date(ev.occupiedUntil),
          staffPreference: input.staffPreference ?? null,
          rescheduleCount: b.rescheduleCount + 1,
          reminderSentAt: null,
        })
        .where(eq(bookings.id, b.id))
        .returning();
      const tz = salon.timezone;
      const note = `Rescheduled from ${formatDate(b.startsAt, tz)} ${formatTime(b.startsAt, tz)} to ${formatDate(updated!.startsAt, tz)} ${formatTime(updated!.startsAt, tz)}`;
      await recordStatus(tx, b.id, b.status, b.status, user.id, note);
      await audit(tx, { actorId: user.id, salonId: b.salonId, action: "booking.rescheduled", entity: "booking", entityId: b.id, oldValue: { startsAt: b.startsAt }, newValue: { startsAt: updated!.startsAt } });
      await notify(tx, user.id, { category: "BOOKING", type: "booking.rescheduled", title: "Booking rescheduled", body: `${salon.name}: ${note.toLowerCase()}.`, link: `/customer/bookings/${b.id}` });
      await notifySalonTeam(tx, b.salonId, { category: "BOOKING", type: "salon.booking_rescheduled", title: "Booking rescheduled", body: `${b.customerName} · ${note}`, link: `/business/bookings?focus=${b.id}` }, { includeStaff: true });
      await publish(tx, [...bookingEvents(b, tz), ...bookingEvents(updated!, tz)]);
      await notifyWaitlist(tx, b.salonId, { startsAt: b.startsAt, endsAt: b.endsAt });
      return updated!;
    });
  } catch (e) {
    rethrowSlotConflicts(e);
  }
}

/** Owner/staff drag-and-drop move on the calendar — revalidated server-side. */
export async function moveBooking(user: SessionUser, bookingId: string, input: { startsAt: string; resourceId?: string | null; staffId?: string | null }) {
  const pre = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!pre) throw Errors.notFound("Booking");
  await requireSalonAccess(user, pre.salonId, "MANAGE_BOOKINGS");
  try {
    return await db.transaction(async (tx) => {
      await lockSalon(tx, pre.salonId);
      const b = await lockBooking(tx, bookingId);
      if (!["CONFIRMED", "CHECKED_IN", "WAITING"].includes(b.status)) throw Errors.conflict("NOT_MOVABLE", "Only upcoming bookings can be moved.");
      const { tz } = await salonTz(tx, b.salonId);
      const start = new Date(input.startsAt);
      if (Number.isNaN(start.getTime())) throw Errors.validation("Invalid start time.");
      const sel = await selectionForBooking(tx, b);
      sel.spec.durationMinutes = b.durationMinutes;
      const { ctx, staffLoad } = await loadDayContext(tx, b.salonId, toDateKey(start, tz), { excludeBookingId: b.id, allowUnapproved: true });
      const ev = evaluateSlot(ctx, sel.spec, start.getTime(), {
        now: Date.now(),
        ignoreAdvanceRules: true,
        staffPreference: input.staffId ?? undefined,
        forcedResourceIds: input.resourceId ? [input.resourceId] : undefined,
        staffLoad,
      });
      if (!ev.available) throw Errors.conflict(ev.reason, ev.message, { reason: ev.reason });
      if (start.getTime() < Date.now() - 5 * 60_000) throw Errors.validation("Bookings can't be moved into the past.");
      await releaseReservations(tx, b.id);
      await insertReservations(tx, b, ev, ev.resourceIds, ev.staffIds);
      const [updated] = await tx
        .update(bookings)
        .set({ startsAt: new Date(ev.startsAt), endsAt: new Date(ev.endsAt), occupiedFrom: new Date(ev.occupiedFrom), occupiedUntil: new Date(ev.occupiedUntil), reminderSentAt: null })
        .where(eq(bookings.id, b.id))
        .returning();
      await recordStatus(tx, b.id, b.status, b.status, user.id, `Moved by salon to ${formatDate(updated!.startsAt, tz)} ${formatTime(updated!.startsAt, tz)}`);
      await audit(tx, { actorId: user.id, salonId: b.salonId, action: "booking.moved", entity: "booking", entityId: b.id, oldValue: { startsAt: b.startsAt }, newValue: { startsAt: updated!.startsAt, resourceIds: ev.resourceIds, staffIds: ev.staffIds } });
      if (b.customerId && updated!.startsAt.getTime() !== b.startsAt.getTime()) {
        await notify(tx, b.customerId, {
          category: "SALON",
          type: "booking.moved",
          title: "Your appointment time changed",
          body: `The salon moved booking ${b.code} to ${formatDate(updated!.startsAt, tz)}, ${formatTime(updated!.startsAt, tz)}. Contact the salon if this doesn't work for you.`,
          link: `/customer/bookings/${b.id}`,
        });
      }
      await publish(tx, [...bookingEvents(b, tz), ...bookingEvents(updated!, tz)]);
      return updated!;
    });
  } catch (e) {
    rethrowSlotConflicts(e);
  }
}

/* ======================================================= walk-in / desk */

export type DeskBookingInput = {
  source: "WALK_IN" | "OWNER";
  customerName: string;
  customerPhone?: string | null;
  serviceId: string;
  optionIds?: string[];
  staffId?: string | null;
  resourceId?: string | null;
  startsAt?: string | null;
  durationMinutes?: number | null;
  price?: number | null;
  paymentMode: "CASH" | "UPI" | "CARD" | "OTHER" | "PAY_AT_SALON";
  paymentCollected: boolean;
  notes?: string | null;
  override?: boolean;
};

export type ConflictInfo = { bookingId: string; code: string; customerName: string; startsAt: Date; endsAt: Date; on: string };

async function findConflicts(ex: Executor, salonId: string, w: { occupiedFrom: number; occupiedUntil: number }, resourceIds: string[], staffIds: string[]) {
  const from = new Date(w.occupiedFrom), to = new Date(w.occupiedUntil);
  const res = await ex.execute<{ booking_id: string; code: string; customer_name: string; starts_at: Date; ends_at: Date; on_name: string }>(sql`
    select b.id as booking_id, b.code, b.customer_name, b.starts_at, b.ends_at, r.name as on_name
    from booking_resources br join bookings b on b.id = br.booking_id join resources r on r.id = br.resource_id
    where br.salon_id = ${salonId} and br.active and br.starts_at < ${to} and br.ends_at > ${from}
      and (b.status <> 'PAYMENT_PENDING' or b.lock_expires_at > now())
      ${resourceIds.length ? sql`and br.resource_id in ${resourceIds}` : sql``}
    union
    select b.id, b.code, b.customer_name, b.starts_at, b.ends_at, s.name
    from booking_staff bs join bookings b on b.id = bs.booking_id join staff s on s.id = bs.staff_id
    where bs.salon_id = ${salonId} and bs.active and bs.starts_at < ${to} and bs.ends_at > ${from}
      and (b.status <> 'PAYMENT_PENDING' or b.lock_expires_at > now())
      ${staffIds.length ? sql`and bs.staff_id in ${staffIds}` : sql`and false`}
    limit 10`);
  return res.rows.map<ConflictInfo>((r) => ({ bookingId: r.booking_id, code: r.code, customerName: r.customer_name, startsAt: r.starts_at, endsAt: r.ends_at, on: r.on_name }));
}

/**
 * Walk-ins and phone bookings created at the salon desk. They go through
 * the same engine and the same DB constraints as online bookings, so a
 * walk-in instantly removes that capacity from online availability. A
 * conflicting walk-in is refused unless an OWNER explicitly overrides.
 */
export async function createDeskBooking(user: SessionUser, salonId: string, input: DeskBookingInput) {
  const access: SalonAccess = await requireSalonAccess(user, salonId, input.source === "WALK_IN" ? "WALK_IN" : "MANAGE_BOOKINGS");
  if (input.override && access.level === "STAFF") throw Errors.forbidden("Only the salon owner can override a booking conflict.");

  try {
    return await db.transaction(async (tx) => {
      await lockSalon(tx, salonId);
      await expireHolds(tx, salonId);
      // At the desk, staff set duration/price directly — required online options don't apply.
      const sel = await loadServiceSelection(tx, salonId, input.serviceId, input.optionIds ?? [], { enforceRequired: false });
      const spec: ServiceSpec = { ...sel.spec, durationMinutes: input.durationMinutes ?? sel.spec.durationMinutes };
      const { tz } = await salonTz(tx, salonId);
      const start = input.startsAt ? new Date(input.startsAt) : new Date(Math.ceil(Date.now() / 60_000) * 60_000);
      if (Number.isNaN(start.getTime())) throw Errors.validation("Invalid start time.");
      if (start.getTime() < Date.now() - 15 * 60_000) throw Errors.validation("Start time can't be in the past.");

      if (input.staffId) {
        const s = await tx.query.staff.findFirst({ where: and(eq(staff.id, input.staffId), eq(staff.salonId, salonId)) });
        if (!s) throw Errors.validation("Selected staff member doesn't belong to this salon.");
      }
      const { ctx, staffLoad } = await loadDayContext(tx, salonId, toDateKey(start, tz), { allowUnapproved: true });
      if (input.resourceId && !ctx.resources.some((r) => r.id === input.resourceId && spec.requirements.some((q) => q.resourceTypeId === r.typeId))) {
        throw Errors.validation("The selected seat/resource can't be used for this service.");
      }
      const ev = evaluateSlot(ctx, spec, start.getTime(), {
        now: Date.now(),
        ignoreAdvanceRules: true,
        staffPreference: input.staffId,
        forcedResourceIds: input.resourceId ? [input.resourceId] : undefined,
        staffLoad,
      });

      let resourceIds: string[];
      let staffIds: string[];
      let overridden = false;
      const w = occupiedWindow(spec, start.getTime());
      if (ev.available) {
        resourceIds = ev.resourceIds;
        staffIds = ev.staffIds;
      } else {
        // pick the explicitly requested (or first compatible) seat/staff to report or override
        resourceIds = spec.requirements.flatMap((q) => {
          const ofType = ctx.resources.filter((r) => r.typeId === q.resourceTypeId);
          const forced = ofType.filter((r) => r.id === input.resourceId);
          return (forced.length ? forced : ofType).slice(0, q.quantity).map((r) => r.id);
        });
        staffIds = spec.staffRequired > 0 ? (input.staffId ? [input.staffId] : ctx.staff.filter((s) => s.serviceIds.has(spec.id)).slice(0, spec.staffRequired).map((s) => s.id)) : [];
        const conflicts = await findConflicts(tx, salonId, w, resourceIds, staffIds);
        if (!input.override) {
          throw Errors.conflict("DESK_CONFLICT", `${ev.message}${conflicts.length ? " It would clash with an existing booking." : ""}`, { reason: ev.reason, conflicts, canOverride: access.level !== "STAFF" });
        }
        if (resourceIds.length < spec.requirements.reduce((s, q) => s + q.quantity, 0)) throw Errors.validation("This salon has no compatible seat for this service.");
        overridden = true;
      }

      let walkInId: string | null = null;
      if (input.source === "WALK_IN" || input.customerPhone) {
        const phone = input.customerPhone?.trim() || null;
        if (phone) {
          const [w2] = await tx
            .insert(walkInCustomers)
            .values({ salonId, name: input.customerName, phone })
            .onConflictDoUpdate({ target: [walkInCustomers.salonId, walkInCustomers.phone], set: { name: input.customerName, visits: sql`${walkInCustomers.visits} + 1` } })
            .returning({ id: walkInCustomers.id });
          walkInId = w2!.id;
        } else {
          const [w2] = await tx.insert(walkInCustomers).values({ salonId, name: input.customerName }).returning({ id: walkInCustomers.id });
          walkInId = w2!.id;
        }
      }

      const subtotal = input.price ?? selectionSubtotal(sel);
      const cfg = await getPlatformConfig(tx);
      const quote = computeQuote(subtotal, 0, cfg.gstPercent);
      const isNow = start.getTime() <= Date.now() + 10 * 60_000;
      const status: BookingStatus = input.source === "WALK_IN" && isNow ? "CHECKED_IN" : "CONFIRMED";

      const [b] = await tx
        .insert(bookings)
        .values({
          code: await generateCode(tx, start, tz),
          salonId,
          walkInCustomerId: walkInId,
          customerName: input.customerName.trim(),
          customerPhone: input.customerPhone?.trim() || null,
          serviceId: sel.service.id,
          source: input.source,
          status,
          startsAt: new Date(w.startsAt),
          endsAt: new Date(w.endsAt),
          occupiedFrom: new Date(w.occupiedFrom),
          occupiedUntil: new Date(w.occupiedUntil),
          durationMinutes: spec.durationMinutes,
          subtotal: quote.subtotal,
          tax: quote.tax,
          total: quote.total,
          paymentStatus: input.paymentCollected ? "SUCCESSFUL" : "PENDING",
          paymentMode: input.paymentMode,
          customerNotes: input.notes?.trim() || null,
          overrideConflict: overridden,
          checkedInAt: status === "CHECKED_IN" ? new Date() : null,
          checkInToken: randomBytes(16).toString("base64url"),
          createdBy: user.id,
        })
        .returning();
      await tx.insert(bookingItems).values([
        { bookingId: b!.id, kind: "SERVICE", name: sel.service.name, price: subtotal - sel.options.reduce((s, o) => s + o.priceDelta, 0), durationMinutes: spec.durationMinutes, serviceId: sel.service.id },
        ...sel.options.map((o) => ({ bookingId: b!.id, kind: "OPTION", name: o.name, groupName: o.groupName, price: o.priceDelta, durationMinutes: o.durationDelta, optionId: o.id })),
      ]);
      await insertReservations(tx, b!, w, resourceIds, staffIds, overridden);
      if (input.paymentCollected) {
        await tx.insert(payments).values({ bookingId: b!.id, provider: "offline", amount: quote.total, status: "SUCCESSFUL", method: input.paymentMode.toLowerCase(), verifiedAt: new Date() });
      }
      await recordStatus(tx, b!.id, null, status, user.id, input.source === "WALK_IN" ? "Walk-in added at the desk" : "Booked by salon");
      await audit(tx, {
        actorId: user.id,
        salonId,
        action: overridden ? "walkin.created_with_override" : input.source === "WALK_IN" ? "walkin.created" : "booking.created_by_salon",
        entity: "booking",
        entityId: b!.id,
        newValue: { startsAt: b!.startsAt, resourceIds, staffIds, overridden },
      });
      if (status === "CHECKED_IN") await tx.insert(waitingQueue).values({ bookingId: b!.id, salonId, estimatedStartAt: b!.startsAt });
      await publish(tx, bookingEvents(b!, tz));
      return b!;
    });
  } catch (e) {
    rethrowSlotConflicts(e);
  }
}

/* ======================================================== status changes */

export type TransitionAction = "CHECK_IN" | "WAIT" | "READY" | "START" | "COMPLETE" | "NO_SHOW" | "COLLECT_PAYMENT";

export async function transitionBooking(
  user: SessionUser,
  bookingId: string,
  action: TransitionAction,
  payload: { estimatedStartAt?: string; note?: string; paymentMode?: "CASH" | "UPI" | "CARD" | "OTHER"; checkInToken?: string } = {},
) {
  const pre = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!pre) throw Errors.notFound("Booking");
  await requireSalonAccess(user, pre.salonId, action === "NO_SHOW" || action === "COLLECT_PAYMENT" ? "MANAGE_BOOKINGS" : "CHECK_IN");

  let refundId: string | null = null;
  const out = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    const { tz, name: salonName } = await salonTz(tx, b.salonId);
    const policy = await getPolicy(tx, b.salonId);
    const now = new Date();
    const must = (statuses: BookingStatus[], msg: string) => {
      if (!statuses.includes(b.status)) throw Errors.conflict("INVALID_TRANSITION", msg);
    };
    let next: BookingStatus = b.status;
    const patch: Partial<BookingRow> = {};
    let message: string | null = null;
    let customerNote: { title: string; body: string } | null = null;

    switch (action) {
      case "CHECK_IN": {
        must(["CONFIRMED"], b.status === "CHECKED_IN" || b.status === "WAITING" ? "This customer is already checked in." : "Only confirmed bookings can be checked in.");
        if (payload.checkInToken !== undefined && payload.checkInToken !== b.checkInToken) throw Errors.validation("This QR code is not valid for the booking.");
        if (toDateKey(b.startsAt, tz) !== toDateKey(now, tz)) throw Errors.conflict("WRONG_DAY", `This booking is for ${formatDate(b.startsAt, tz)}.`);
        const late = Math.max(0, Math.floor((now.getTime() - b.startsAt.getTime()) / 60_000));
        // Is the assigned seat/staff still busy with someone else right now?
        const busy = await tx.execute<{ until: Date }>(sql`
          select max(o.ends_at) as until from bookings o
          where o.salon_id = ${b.salonId} and o.id <> ${b.id} and o.status = 'IN_SERVICE' and (
            exists (select 1 from booking_resources x join booking_resources y on x.resource_id = y.resource_id
                    where x.booking_id = o.id and y.booking_id = ${b.id})
            or exists (select 1 from booking_staff x join booking_staff y on x.staff_id = y.staff_id
                    where x.booking_id = o.id and y.booking_id = ${b.id}))`);
        const busyUntil = busy.rows[0]?.until ? new Date(busy.rows[0].until) : null;
        const estimate = busyUntil && busyUntil > now ? busyUntil : now > b.startsAt ? now : b.startsAt;
        next = busyUntil && busyUntil > now ? "WAITING" : "CHECKED_IN";
        Object.assign(patch, { checkedInAt: now, lateMinutes: late || null, estimatedStartAt: estimate });
        await tx
          .insert(waitingQueue)
          .values({ bookingId: b.id, salonId: b.salonId, estimatedStartAt: estimate, status: "WAITING" })
          .onConflictDoUpdate({ target: waitingQueue.bookingId, set: { status: "WAITING", estimatedStartAt: estimate, joinedAt: now } });
        if (late > 0) {
          message =
            policy.lateArrivalMessage ||
            "You have arrived late. Your booking remains active, but service will begin when the required resource/staff becomes available.";
          if (late > policy.graceMinutes) message += ` (Arrived ${late} min late — beyond the ${policy.graceMinutes}-minute grace period.)`;
        }
        customerNote = {
          title: next === "WAITING" ? "Checked in — please wait" : "You're checked in",
          body: next === "WAITING" ? `Expected service start approximately ${formatTime(estimate, tz)}.` : message ?? "Your stylist will be with you shortly.",
        };
        break;
      }
      case "WAIT": {
        must(["CHECKED_IN", "WAITING"], "Only checked-in customers can be placed in the waiting queue.");
        const est = payload.estimatedStartAt ? new Date(payload.estimatedStartAt) : null;
        if (!est || Number.isNaN(est.getTime())) throw Errors.validation("Please provide the estimated start time.");
        next = "WAITING";
        patch.estimatedStartAt = est;
        await tx.update(waitingQueue).set({ status: "WAITING", estimatedStartAt: est, note: payload.note ?? null }).where(eq(waitingQueue.bookingId, b.id));
        customerNote = { title: "Queue update", body: `Waiting – expected service start approximately ${formatTime(est, tz)}.${payload.note ? ` ${payload.note}` : ""}` };
        break;
      }
      case "READY": {
        must(["CHECKED_IN", "WAITING"], "The customer must be checked in first.");
        next = "CHECKED_IN";
        patch.estimatedStartAt = now;
        await tx.update(waitingQueue).set({ status: "READY", estimatedStartAt: now }).where(eq(waitingQueue.bookingId, b.id));
        customerNote = { title: "Your service is ready", body: `Please proceed — your stylist at ${salonName} is ready for you.` };
        break;
      }
      case "START": {
        must(["CHECKED_IN", "WAITING", ...(b.source !== "ONLINE" ? (["CONFIRMED"] as BookingStatus[]) : [])], "The customer must be checked in before the service starts.");
        next = "IN_SERVICE";
        patch.serviceStartedAt = now;
        if (!b.checkedInAt) patch.checkedInAt = now;
        await tx.update(waitingQueue).set({ status: "SERVED" }).where(eq(waitingQueue.bookingId, b.id));
        customerNote = { title: "Service started", body: "Sit back and relax ✨" };
        break;
      }
      case "COMPLETE": {
        must(["IN_SERVICE"], "Only services in progress can be completed.");
        next = "COMPLETED";
        patch.completedAt = now;
        // Finished early? Free the remaining time (plus cleanup buffer) for others right away.
        const svc = await tx.query.services.findFirst({ where: eq(services.id, b.serviceId), columns: { bufferMinutes: true } });
        const freeFrom = new Date(now.getTime() + (svc?.bufferMinutes ?? 0) * 60_000);
        if (freeFrom < b.occupiedUntil) {
          await tx.execute(sql`update booking_resources set ends_at = greatest(starts_at + interval '1 minute', ${freeFrom}::timestamptz) where booking_id = ${b.id} and active and ends_at > ${freeFrom}::timestamptz`);
          await tx.execute(sql`update booking_staff set ends_at = greatest(starts_at + interval '1 minute', ${freeFrom}::timestamptz) where booking_id = ${b.id} and active and ends_at > ${freeFrom}::timestamptz`);
          await notifyWaitlist(tx, b.salonId, { startsAt: freeFrom, endsAt: b.occupiedUntil });
        }
        customerNote = { title: "Service completed", body: `Thanks for visiting ${salonName}! We'd love your feedback.` };
        break;
      }
      case "NO_SHOW": {
        must(["CONFIRMED"], "Only confirmed bookings that weren't checked in can be marked as no-show.");
        const graceEnds = b.startsAt.getTime() + policy.graceMinutes * 60_000;
        if (now.getTime() < graceEnds) throw Errors.conflict("GRACE_PERIOD", `The ${policy.graceMinutes}-minute grace period hasn't ended yet (ends ${formatTime(new Date(graceEnds), tz)}).`);
        next = "NO_SHOW";
        await releaseReservations(tx, b.id);
        const pay = await successfulPayment(tx, b.id);
        const decision = refundForNoShow(policy as RefundPolicy, pay?.amount ?? 0);
        if (pay && decision.amount > 0) {
          const [r] = await tx.insert(refunds).values({ paymentId: pay.id, bookingId: b.id, amount: decision.amount, reason: decision.explanation }).returning({ id: refunds.id });
          refundId = r!.id;
        }
        customerNote = { title: "Marked as no-show", body: `You missed your appointment at ${salonName}. ${decision.explanation}` };
        await notifyWaitlist(tx, b.salonId, { startsAt: now, endsAt: b.occupiedUntil });
        break;
      }
      case "COLLECT_PAYMENT": {
        if (b.paymentStatus === "SUCCESSFUL") throw Errors.conflict("ALREADY_PAID", "Payment for this booking is already recorded.");
        if (["CANCELLED", "FAILED", "NO_SHOW"].includes(b.status)) throw Errors.conflict("INVALID_TRANSITION", "Payment can't be collected for this booking.");
        const mode = payload.paymentMode ?? "CASH";
        await tx.insert(payments).values({ bookingId: b.id, provider: "offline", amount: b.total, status: "SUCCESSFUL", method: mode.toLowerCase(), verifiedAt: now });
        patch.paymentStatus = "SUCCESSFUL";
        patch.paymentMode = mode;
        break;
      }
    }

    const [updated] = await tx.update(bookings).set({ ...patch, status: next }).where(eq(bookings.id, b.id)).returning();
    if (next !== b.status || action === "READY" || action === "WAIT") {
      await recordStatus(tx, b.id, b.status, next, user.id, payload.note ?? (action === "READY" ? "Service ready" : undefined));
    }
    await audit(tx, { actorId: user.id, salonId: b.salonId, action: `booking.${action.toLowerCase()}`, entity: "booking", entityId: b.id, oldValue: { status: b.status }, newValue: { status: next } });
    if (customerNote && b.customerId) {
      await notify(tx, b.customerId, { category: "BOOKING", type: `booking.${action.toLowerCase()}`, title: customerNote.title, body: customerNote.body, link: `/customer/bookings/${b.id}` });
    }
    const events = bookingEvents(updated!, tz);
    events.push({ ch: channels.booking(b.id), type: "queue", data: { action } });
    await publish(tx, events);
    return { booking: updated!, message };
  });
  if (refundId) await processRefund(refundId);
  return out;
}

/** Bookings that should have started but whose customer never arrived. */
export async function autoMarkNoShows() {
  const rows = await db.execute<{ id: string; salon_id: string }>(sql`
    select b.id, b.salon_id from bookings b join salon_policies p on p.salon_id = b.salon_id
    where b.status = 'CONFIRMED' and p.no_show_after_minutes > 0
      and b.starts_at + make_interval(mins => p.no_show_after_minutes) < now()
    limit 50`);
  let n = 0;
  for (const r of rows.rows) {
    try {
      await db.transaction(async (tx) => {
        const b = await lockBooking(tx, r.id);
        if (b.status !== "CONFIRMED") return;
        await tx.update(bookings).set({ status: "NO_SHOW" }).where(eq(bookings.id, b.id));
        await releaseReservations(tx, b.id);
        await recordStatus(tx, b.id, "CONFIRMED", "NO_SHOW", null, "Automatically marked as no-show");
        const { tz } = await salonTz(tx, b.salonId);
        await publish(tx, bookingEvents({ ...b, status: "NO_SHOW" }, tz));
        if (b.customerId) {
          await notify(tx, b.customerId, { category: "BOOKING", type: "booking.no_show", title: "Marked as no-show", body: `You missed booking ${b.code}. Late-cancellation / no-show charges may apply as per salon policy.`, link: `/customer/bookings/${b.id}` });
        }
      });
      n++;
    } catch (e) {
      console.error("[no-show] failed", r.id, e);
    }
  }
  return n;
}

