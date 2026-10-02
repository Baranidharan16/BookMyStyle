import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { bookings, paymentEvents, payments, refunds } from "../db/schema";
import type { SessionUser } from "../auth/session";
import { confirmPaidBooking, processRefund, settleRefundTotals } from "../booking/engine";
import { audit } from "../audit";
import { Errors, PG, pgCode } from "../http/errors";
import { notify } from "../notifications";
import { activeProviderName, getPaymentProvider, webhookSignatureHeader } from "./index";
import type { ProviderName } from "./types";

/**
 * Payment flow:  create order  →  provider checkout  →  verify signature +
 * fetch authoritative payment from provider  →  confirm booking.
 * Webhooks run the same confirmation path (idempotently), so a booking is
 * confirmed even if the customer closes the tab after paying.
 */
export async function createPaymentOrder(user: SessionUser, bookingId: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!b || b.customerId !== user.id) throw Errors.notFound("Booking");
  if (b.status !== "PAYMENT_PENDING") {
    throw Errors.conflict("NOT_PAYABLE", b.status === "CONFIRMED" ? "This booking is already paid." : "This checkout has expired. Please pick a slot again.");
  }
  if (!b.lockExpiresAt || b.lockExpiresAt.getTime() < Date.now() + 10_000) {
    throw Errors.conflict("HOLD_EXPIRED", "Your slot hold has expired. Please choose the slot again.");
  }
  const provider = getPaymentProvider();

  // Reuse an open order for the same amount (e.g. customer retried after closing checkout).
  const existing = await db.query.payments.findFirst({
    where: and(eq(payments.bookingId, b.id), eq(payments.provider, provider.name), eq(payments.status, "INITIATED"), eq(payments.amount, b.total)),
  });
  if (existing?.providerOrderId) {
    return { config: provider.checkoutConfig({ orderId: existing.providerOrderId, amount: existing.amount, currency: existing.currency }), booking: b };
  }

  const order = await provider.createOrder({ amount: b.total, currency: "INR", receipt: b.code, notes: { bookingId: b.id, salonId: b.salonId } });
  await db.insert(payments).values({ bookingId: b.id, provider: provider.name, providerOrderId: order.orderId, amount: order.amount, status: "INITIATED" });
  await db.update(bookings).set({ paymentStatus: "PENDING" }).where(eq(bookings.id, b.id));
  return { config: provider.checkoutConfig(order), booking: b };
}

async function applyCapturedPayment(provider: ProviderName, orderId: string, paymentId: string, method: string | null, amountFromProvider: number) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.providerOrderId, orderId))).for("update");
    const p = rows[0];
    if (!p) throw Errors.notFound("Payment");
    if (amountFromProvider !== p.amount) throw Errors.conflict("AMOUNT_MISMATCH", "The paid amount does not match the order.");
    if (p.status !== "SUCCESSFUL") {
      await tx
        .update(payments)
        .set({ status: "SUCCESSFUL", providerPaymentId: paymentId, method, verifiedAt: new Date(), failureReason: null })
        .where(eq(payments.id, p.id));
    }
    const result = await confirmPaidBooking(tx, p.bookingId, { paymentRowId: p.id, amount: p.amount, method });
    const pending = result.outcome === "SLOT_LOST" ? await tx.query.refunds.findFirst({ where: and(eq(refunds.paymentId, p.id), eq(refunds.status, "PENDING")) }) : null;
    return { result, refundId: pending?.id ?? null };
  });
}

/** Called by the browser after checkout. Never trusts the browser's claim — verifies with the provider. */
export async function verifyCheckout(user: SessionUser, input: { orderId: string; paymentId: string; signature: string }) {
  const providerName = activeProviderName();
  const provider = getPaymentProvider(providerName);
  const p = await db.query.payments.findFirst({ where: and(eq(payments.provider, providerName), eq(payments.providerOrderId, input.orderId)) });
  if (!p) throw Errors.notFound("Payment");
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, p.bookingId) });
  if (!b || b.customerId !== user.id) throw Errors.notFound("Payment");

  if (!provider.verifyCheckoutSignature(input)) {
    await audit(db, { actorId: user.id, salonId: b.salonId, action: "payment.signature_invalid", entity: "payment", entityId: p.id });
    throw Errors.conflict("PAYMENT_UNVERIFIED", "We couldn't verify this payment. If money was debited, it will be refunded automatically.");
  }
  const remote = await provider.fetchPayment(input.paymentId);
  if (remote.orderId !== input.orderId) throw Errors.conflict("PAYMENT_UNVERIFIED", "This payment doesn't belong to the order.");
  if (remote.status !== "captured" && remote.status !== "authorized") {
    throw Errors.conflict("PAYMENT_FAILED", "Your payment didn't go through. No booking was made — please try again.");
  }
  const { result, refundId } = await applyCapturedPayment(providerName, input.orderId, input.paymentId, remote.method, remote.amount);
  if (refundId) await processRefund(refundId);
  return result;
}

/** Mark an order failed when the provider reports failure / customer aborts. Booking hold stays until it expires. */
export async function markPaymentFailed(orderId: string, reason: string, provider: ProviderName = activeProviderName()) {
  const p = await db.query.payments.findFirst({ where: and(eq(payments.provider, provider), eq(payments.providerOrderId, orderId)) });
  if (!p || p.status === "SUCCESSFUL") return;
  await db.update(payments).set({ status: "FAILED", failureReason: reason.slice(0, 300) }).where(eq(payments.id, p.id));
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, p.bookingId) });
  if (b?.customerId && b.status === "PAYMENT_PENDING") {
    await db.update(bookings).set({ paymentStatus: "FAILED" }).where(eq(bookings.id, b.id));
    await notify(db, b.customerId, {
      category: "PAYMENT",
      type: "payment.failed",
      title: "Payment failed",
      body: `${reason} Your slot is held until ${b.lockExpiresAt?.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) ?? "shortly"} — you can retry.`,
      link: `/checkout/${b.id}`,
    });
  }
}

export async function handleWebhook(rawBody: string, headers: Headers) {
  const providerName = activeProviderName();
  const provider = getPaymentProvider(providerName);
  if (!provider.verifyWebhookSignature(rawBody, headers.get(webhookSignatureHeader(providerName)))) {
    throw Errors.forbidden("Invalid webhook signature");
  }
  const event = provider.parseWebhook(rawBody, headers);

  // Idempotency: each provider event is processed once.
  try {
    await db.insert(paymentEvents).values({ provider: providerName, eventId: event.eventId, eventType: event.type, payload: JSON.parse(rawBody) });
  } catch (e) {
    if (pgCode(e) === PG.UNIQUE_VIOLATION) return { duplicate: true };
    throw e;
  }

  switch (event.type) {
    case "payment.captured": {
      if (!event.orderId || !event.paymentId) break;
      // re-fetch rather than trusting the payload's amount/status
      const remote = await provider.fetchPayment(event.paymentId);
      if (remote.status !== "captured") break;
      const { refundId } = await applyCapturedPayment(providerName, remote.orderId, remote.paymentId, remote.method, remote.amount);
      if (refundId) await processRefund(refundId);
      break;
    }
    case "payment.failed":
      if (event.orderId) await markPaymentFailed(event.orderId, event.errorDescription ?? "The payment was declined.", providerName);
      break;
    case "refund.processed": {
      if (!event.refundId) break;
      const r = await db.query.refunds.findFirst({ where: eq(refunds.providerRefundId, event.refundId) });
      if (r && r.status !== "PROCESSED") {
        await db.transaction(async (tx) => {
          await tx.update(refunds).set({ status: "PROCESSED", processedAt: new Date() }).where(eq(refunds.id, r.id));
          await settleRefundTotals(tx, r.paymentId, r.bookingId);
        });
      }
      break;
    }
    case "refund.failed": {
      if (!event.refundId) break;
      await db.update(refunds).set({ status: "FAILED", failureReason: "Provider reported refund failure" }).where(eq(refunds.providerRefundId, event.refundId));
      break;
    }
  }
  return { duplicate: false };
}
