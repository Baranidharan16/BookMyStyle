import "server-only";
import { RazorpayProvider } from "./razorpay";
import { SandboxProvider } from "./sandbox";
import type { PaymentProvider, ProviderName } from "./types";

let cached: PaymentProvider | null = null;

export function activeProviderName(): ProviderName {
  return process.env.PAYMENT_PROVIDER === "razorpay" ? "razorpay" : "sandbox";
}

export function getPaymentProvider(name: ProviderName = activeProviderName()): PaymentProvider {
  if (cached && cached.name === name) return cached;
  cached = name === "razorpay" ? new RazorpayProvider() : new SandboxProvider();
  return cached;
}

export function webhookSignatureHeader(name: ProviderName) {
  return name === "razorpay" ? "x-razorpay-signature" : "x-sandbox-signature";
}
