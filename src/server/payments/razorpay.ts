import "server-only";
import { hmacSha256Hex, safeEqualHex } from "./crypto";
import type { CheckoutConfig, CreatedOrder, PaymentProvider, ProviderPayment, WebhookEvent } from "./types";

/**
 * Razorpay provider (UPI, cards, net banking, wallets).
 * Docs: https://razorpay.com/docs/payments/server-integration/
 *  - Orders API → Checkout → signature verification
 *    (HMAC_SHA256(order_id + "|" + payment_id, key_secret))
 *  - Webhooks verified with HMAC_SHA256(raw_body, webhook_secret)
 */
export class RazorpayProvider implements PaymentProvider {
  name = "razorpay" as const;
  private keyId = process.env.RAZORPAY_KEY_ID ?? "";
  private keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  private webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

  constructor() {
    if (!this.keyId || !this.keySecret) throw new Error("Razorpay is selected but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    const body = (await res.json()) as T & { error?: { description?: string } };
    if (!res.ok) throw new Error(`Razorpay ${path} failed: ${body.error?.description ?? res.status}`);
    return body;
  }

  async createOrder(input: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }): Promise<CreatedOrder> {
    const o = await this.api<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({ amount: input.amount, currency: input.currency, receipt: input.receipt, notes: input.notes }),
    });
    return { orderId: o.id, amount: o.amount, currency: o.currency };
  }

  checkoutConfig(order: CreatedOrder): CheckoutConfig {
    return { provider: "razorpay", keyId: this.keyId, orderId: order.orderId, amount: order.amount, currency: order.currency };
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    return safeEqualHex(hmacSha256Hex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const p = await this.api<{ id: string; order_id: string; amount: number; status: ProviderPayment["status"]; method: string }>(
      `/payments/${encodeURIComponent(paymentId)}`,
    );
    return { paymentId: p.id, orderId: p.order_id, amount: p.amount, status: p.status, method: p.method };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null) {
    if (!signature || !this.webhookSecret) return false;
    return safeEqualHex(hmacSha256Hex(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: string, headers: Headers): WebhookEvent {
    const body = JSON.parse(rawBody) as {
      event: string;
      payload: {
        payment?: { entity: { id: string; order_id: string; amount: number; method: string; error_description?: string } };
        refund?: { entity: { id: string; payment_id: string; amount: number } };
      };
      created_at: number;
    };
    const pay = body.payload.payment?.entity;
    const refund = body.payload.refund?.entity;
    const type: WebhookEvent["type"] = ["payment.captured", "payment.failed", "refund.processed", "refund.failed"].includes(body.event)
      ? (body.event as WebhookEvent["type"])
      : "other";
    return {
      eventId: headers.get("x-razorpay-event-id") ?? `${body.event}:${pay?.id ?? refund?.id}:${body.created_at}`,
      type,
      orderId: pay?.order_id ?? null,
      paymentId: pay?.id ?? refund?.payment_id ?? null,
      refundId: refund?.id ?? null,
      amount: pay?.amount ?? refund?.amount ?? null,
      method: pay?.method ?? null,
      errorDescription: pay?.error_description ?? null,
    };
  }

  async refund(paymentId: string, amount: number, notes?: Record<string, string>) {
    const r = await this.api<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount, notes }),
    });
    return { refundId: r.id, status: r.status === "processed" ? ("processed" as const) : ("pending" as const) };
  }
}
