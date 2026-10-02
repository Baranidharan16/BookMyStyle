import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { verifyCheckout } from "@/server/payments/service";

const schema = z.object({ orderId: z.string().min(1).max(100), paymentId: z.string().min(1).max(100), signature: z.string().min(1).max(200) });

/**
 * POST /api/bookings/confirm (alias of /api/payments/verify) — a booking is
 * only confirmed after server-side verification of the payment.
 */
export const POST = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  const res = await verifyCheckout(user, await parseBody(req, schema));
  return ok({ outcome: res.outcome, bookingId: res.booking.id, code: res.booking.code });
});
