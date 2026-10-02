import { transitionBooking } from "@/server/booking/engine";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { db } from "@/server/db";
import { bookings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { transitionSchema } from "@/lib/validation";

export const POST = salonRoute<{ salonId: string; bookingId: string }>(null, async ({ req, user, params }) => {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, params.bookingId), columns: { salonId: true } });
  if (!b || b.salonId !== params.salonId) throw Errors.notFound("Booking");
  const { action, ...payload } = await parseBody(req, transitionSchema);
  const res = await transitionBooking(user, params.bookingId, action, payload);
  return ok({ status: res.booking.status, message: res.message });
});
