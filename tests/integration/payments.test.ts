import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { holdSlot } from "@/server/booking/engine";
import { createPaymentOrder, handleWebhook, verifyCheckout } from "@/server/payments/service";
import { SandboxProvider } from "@/server/payments/sandbox";
import { hmacSha256Hex } from "@/server/payments/crypto";
import { AppError } from "@/server/http/errors";
import { futureDate, H, makeSalon, makeUser, resetDb } from "./fixtures";

beforeEach(resetDb);

async function setup() {
  const fx = await makeSalon({ chairs: 1 });
  const c = await makeUser("CUSTOMER");
  const b = await holdSlot(c, { salonId: fx.salon.id, serviceId: fx.service.id, optionIds: [], date: futureDate(), startMinute: H(16) });
  const { config } = await createPaymentOrder(c, b!.id);
  return { ...fx, c, b: b!, orderId: config.orderId };
}

describe("payment verification", () => {
  it("confirms only after a valid signature and provider record", async () => {
    const { c, b, orderId } = await setup();
    const sim = await new SandboxProvider().simulateCheckout(orderId, "success", "upi");
    const res = await verifyCheckout(c, { orderId, paymentId: sim.paymentId, signature: sim.signature! });
    expect(res.outcome).toBe("CONFIRMED");
    const row = await db.query.bookings.findFirst({ where: eq(s.bookings.id, b.id) });
    expect(row).toMatchObject({ status: "CONFIRMED", paymentStatus: "SUCCESSFUL" });
    // idempotent
    expect((await verifyCheckout(c, { orderId, paymentId: sim.paymentId, signature: sim.signature! })).outcome).toBe("ALREADY_CONFIRMED");
  });

  it("rejects a forged signature — the frontend can't fake success", async () => {
    const { c, b, orderId } = await setup();
    const sim = await new SandboxProvider().simulateCheckout(orderId, "success", "upi");
    await expect(verifyCheckout(c, { orderId, paymentId: sim.paymentId, signature: "deadbeef".repeat(8) })).rejects.toBeInstanceOf(AppError);
    const row = await db.query.bookings.findFirst({ where: eq(s.bookings.id, b.id) });
    expect(row!.status).toBe("PAYMENT_PENDING");
  });

  it("rejects failed payments even with a well-formed request", async () => {
    const { c, orderId } = await setup();
    const sim = await new SandboxProvider().simulateCheckout(orderId, "failure", "card");
    const fakeSig = hmacSha256Hex(process.env.SANDBOX_KEY_SECRET!, `${orderId}|${sim.paymentId}`);
    await expect(verifyCheckout(c, { orderId, paymentId: sim.paymentId, signature: fakeSig })).rejects.toMatchObject({ code: "PAYMENT_FAILED" });
  });

  it("webhook confirms the booking (tab closed after paying) and is idempotent; bad signatures rejected", async () => {
    const { b, orderId } = await setup();
    const sim = await new SandboxProvider().simulateCheckout(orderId, "success", "upi");
    const body = JSON.stringify({ eventId: "evt_1", type: "payment.captured", orderId, paymentId: sim.paymentId, refundId: null, amount: b.total, method: "upi", errorDescription: null });
    await expect(handleWebhook(body, new Headers({ "x-sandbox-signature": "bad" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const sig = hmacSha256Hex(process.env.SANDBOX_WEBHOOK_SECRET!, body);
    expect(await handleWebhook(body, new Headers({ "x-sandbox-signature": sig }))).toEqual({ duplicate: false });
    expect(await handleWebhook(body, new Headers({ "x-sandbox-signature": sig }))).toEqual({ duplicate: true });
    const row = await db.query.bookings.findFirst({ where: eq(s.bookings.id, b.id) });
    expect(row!.status).toBe("CONFIRMED");
  });

  it("payment after hold expiry whose slot was taken → booking fails and is fully refunded", async () => {
    const { c, b, orderId, salon, service } = await setup();
    await db.update(s.bookings).set({ lockExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.bookings.id, b.id));
    const other = await makeUser("CUSTOMER");
    await holdSlot(other, { salonId: salon.id, serviceId: service.id, optionIds: [], date: futureDate(), startMinute: H(16) }); // takes the chair
    const sim = await new SandboxProvider().simulateCheckout(orderId, "success", "upi");
    const res = await verifyCheckout(c, { orderId, paymentId: sim.paymentId, signature: sim.signature! });
    expect(res.outcome).toBe("SLOT_LOST");
    const refund = await db.query.refunds.findFirst({ where: eq(s.refunds.bookingId, b.id) });
    expect(refund).toMatchObject({ amount: b.total, status: "PROCESSED" });
  });

  it("another customer can't pay for or verify my booking", async () => {
    const { b, orderId } = await setup();
    const stranger = await makeUser("CUSTOMER");
    await expect(createPaymentOrder(stranger, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const sim = await new SandboxProvider().simulateCheckout(orderId, "success", "upi");
    await expect(verifyCheckout(stranger, { orderId, paymentId: sim.paymentId, signature: sim.signature! })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
