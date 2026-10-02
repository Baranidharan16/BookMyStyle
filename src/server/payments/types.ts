export type ProviderName = "razorpay" | "sandbox";

export type CreatedOrder = { orderId: string; amount: number; currency: string };

export type ProviderPayment = {
  paymentId: string;
  orderId: string;
  amount: number;
  /** captured = money received; authorized = will be auto-captured */
  status: "captured" | "authorized" | "failed" | "refunded" | "created";
  method: string | null;
};

export type WebhookEvent = {
  eventId: string;
  type: "payment.captured" | "payment.failed" | "refund.processed" | "refund.failed" | "other";
  orderId: string | null;
  paymentId: string | null;
  refundId: string | null;
  amount: number | null;
  method: string | null;
  errorDescription: string | null;
};

/** Browser-safe data needed to open the provider's checkout. Never contains secrets. */
export type CheckoutConfig =
  | { provider: "razorpay"; keyId: string; orderId: string; amount: number; currency: string }
  | { provider: "sandbox"; orderId: string; amount: number; currency: string; checkoutUrl: string };

export interface PaymentProvider {
  name: ProviderName;
  createOrder(input: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }): Promise<CreatedOrder>;
  checkoutConfig(order: CreatedOrder): CheckoutConfig;
  /** Verify the signature returned to the browser after checkout (server-side). */
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Ask the provider for the authoritative payment record. */
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent;
  refund(paymentId: string, amount: number, notes?: Record<string, string>): Promise<{ refundId: string; status: "processed" | "pending" }>;
}
