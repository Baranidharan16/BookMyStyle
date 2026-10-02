import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { bookings, payments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { markPaymentFailed } from "@/server/payments/service";

const schema = z.object({ orderId: z.string().min(1).max(100), reason: z.string().max(300).optional() });

/** Customer closed / failed checkout. Only marks the attempt failed — never confirms anything. */
export const POST = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  const { orderId, reason } = await parseBody(req, schema);
  const p = await db.select({ id: payments.id }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).where(and(eq(payments.providerOrderId, orderId), eq(bookings.customerId, user.id)));
  if (p.length) await markPaymentFailed(orderId, reason ?? "The payment was cancelled.");
  return ok({ recorded: true });
});
