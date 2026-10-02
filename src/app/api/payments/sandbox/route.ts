import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { bookings, payments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { activeProviderName, getPaymentProvider } from "@/server/payments";
import type { SandboxProvider } from "@/server/payments/sandbox";

const schema = z.object({ orderId: z.string().startsWith("order_sbx_"), outcome: z.enum(["success", "failure"]), method: z.enum(["upi", "card", "netbanking", "wallet"]) });

/**
 * DEV-ONLY: plays the role of the payment gateway's hosted checkout. Returns
 * what a real gateway returns to the browser (payment id + signature); the
 * merchant must still verify it via /api/payments/verify.
 */
export const POST = route(async (req) => {
  if (activeProviderName() !== "sandbox") throw Errors.notFound("Page");
  const user = await requireUser(["CUSTOMER"]);
  const input = await parseBody(req, schema);
  const owned = await db.select({ id: payments.id }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).where(and(eq(payments.providerOrderId, input.orderId), eq(bookings.customerId, user.id)));
  if (!owned.length) throw Errors.notFound("Order");
  const provider = getPaymentProvider("sandbox") as SandboxProvider;
  try {
    return ok(await provider.simulateCheckout(input.orderId, input.outcome, input.method));
  } catch (e) {
    throw Errors.conflict("SANDBOX", (e as Error).message);
  }
});
