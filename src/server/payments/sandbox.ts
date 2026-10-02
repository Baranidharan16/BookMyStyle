import "server-only";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { sandboxGatewayOrders, sandboxGatewayPayments } from "../db/schema";
import { hmacSha256Hex, safeEqualHex } from "./crypto";
import type { CheckoutConfig, CreatedOrder, PaymentProvider, ProviderPayment, WebhookEvent } from "./types";

/**
 * Sandbox provider — a local stand-in for a real gateway, for development
 * and automated tests. It mirrors Razorpay's contract exactly (orders,
 * HMAC-signed checkout result, HMAC-signed webhooks, refunds) so the merchant
 * code path is identical. No money moves; it is refused in production.
 */
export class SandboxProvider implements PaymentProvider {
  name = "sandbox" as const;
  private keySecret = process.env.SANDBOX_KEY_SECRET ?? "";
  private webhookSecret = process.env.SANDBOX_WEBHOOK_SECRET ?? "";

  constructor() {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_SANDBOX_PAYMENTS !== "true") {
      throw new Error("The sandbox payment provider cannot be used in production");
    }
    if (!this.keySecret || !this.webhookSecret) throw new Error("SANDBOX_KEY_SECRET / SANDBOX_WEBHOOK_SECRET must be set");
  }

  async createOrder(input: { amount: number; currency: string; receipt: string }): Promise<CreatedOrder> {
    const id = `order_sbx_${randomBytes(9).toString("hex")}`;
    await db.insert(sandboxGatewayOrders).values({ id, amount: input.amount, currency: input.currency, receipt: input.receipt });
    return { orderId: id, amount: input.amount, currency: input.currency };
  }

  checkoutConfig(order: CreatedOrder): CheckoutConfig {
    return { ...order, provider: "sandbox", checkoutUrl: `/pay/sandbox/${order.orderId}` };
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    return safeEqualHex(hmacSha256Hex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const p = await db.query.sandboxGatewayPayments.findFirst({ where: eq(sandboxGatewayPayments.id, paymentId) });
    if (!p) throw new Error("Unknown sandbox payment");
    return { paymentId: p.id, orderId: p.orderId, amount: p.amount, status: p.status as ProviderPayment["status"], method: p.method };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null) {
    return !!signature && safeEqualHex(hmacSha256Hex(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: string): WebhookEvent {
    return JSON.parse(rawBody) as WebhookEvent;
  }

  async refund(paymentId: string, amount: number) {
    const res = await db.execute<{ id: string }>(sql`
      update sandbox_gateway_payments
      set refunded_amount = refunded_amount + ${amount},
          status = case when refunded_amount + ${amount} >= amount then 'refunded' else 'partially_refunded' end
      where id = ${paymentId} and status in ('captured','partially_refunded') and refunded_amount + ${amount} <= amount
      returning id`);
    if (!res.rows.length) throw new Error("Sandbox refund rejected");
    return { refundId: `rfnd_sbx_${randomBytes(8).toString("hex")}`, status: "processed" as const };
  }

  /* ---------- gateway-side simulation (what the provider's servers do) ---------- */

  /** Simulate the customer completing (or failing) checkout on the gateway. */
  async simulateCheckout(orderId: string, outcome: "success" | "failure", method: string) {
    const order = await db.query.sandboxGatewayOrders.findFirst({ where: eq(sandboxGatewayOrders.id, orderId) });
    if (!order) throw new Error("Unknown sandbox order");
    if (order.status === "paid") throw new Error("Order already paid");
    const paymentId = `pay_sbx_${randomBytes(9).toString("hex")}`;
    const status = outcome === "success" ? "captured" : "failed";
    await db.insert(sandboxGatewayPayments).values({ id: paymentId, orderId, amount: order.amount, status, method });
    if (status === "captured") await db.update(sandboxGatewayOrders).set({ status: "paid" }).where(eq(sandboxGatewayOrders.id, orderId));

    const event: WebhookEvent = {
      eventId: `evt_sbx_${randomBytes(9).toString("hex")}`,
      type: status === "captured" ? "payment.captured" : "payment.failed",
      orderId,
      paymentId,
      refundId: null,
      amount: order.amount,
      method,
      errorDescription: status === "failed" ? "Payment declined by the (sandbox) bank" : null,
    };
    // Like a real gateway, deliver the signed webhook asynchronously.
    void this.deliverWebhook(event);

    return {
      paymentId,
      orderId,
      status,
      signature: status === "captured" ? hmacSha256Hex(this.keySecret, `${orderId}|${paymentId}`) : null,
      error: event.errorDescription,
    };
  }

  private async deliverWebhook(event: WebhookEvent) {
    const body = JSON.stringify(event);
    const base = process.env.APP_URL ?? "http://localhost:3000";
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await fetch(`${base}/api/payments/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sandbox-signature": hmacSha256Hex(this.webhookSecret, body) },
        body,
      });
    } catch (e) {
      console.warn("[sandbox] webhook delivery failed (the verify call still confirms the booking)", (e as Error).message);
    }
  }
}
