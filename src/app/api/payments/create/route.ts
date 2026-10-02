import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { rateLimit } from "@/server/http/rate-limit";
import { createPaymentOrder } from "@/server/payments/service";

const schema = z.object({ bookingId: z.string().uuid() });

/** POST /api/payments/create — create a provider order for a held booking. */
export const POST = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  await rateLimit(`pay:${user.id}`, 20, 600);
  const { bookingId } = await parseBody(req, schema);
  const { config, booking } = await createPaymentOrder(user, bookingId);
  return ok({ config, lockExpiresAt: booking.lockExpiresAt, code: booking.code });
});
