import { holdSlot } from "@/server/booking/engine";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { rateLimit } from "@/server/http/rate-limit";
import { holdSchema } from "@/lib/validation";

/** POST /api/bookings/lock — atomically validate + hold a slot for checkout. */
export const POST = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  await rateLimit(`hold:${user.id}`, 30, 600);
  const input = await parseBody(req, holdSchema);
  const b = await holdSlot(user, input);
  return ok({ bookingId: b!.id, code: b!.code, lockExpiresAt: b!.lockExpiresAt, total: b!.total }, { status: 201 });
});
