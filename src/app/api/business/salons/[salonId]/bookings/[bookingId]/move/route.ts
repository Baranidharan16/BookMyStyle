import { eq } from "drizzle-orm";
import { moveBooking } from "@/server/booking/engine";
import { db } from "@/server/db";
import { bookings } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { moveSchema } from "@/lib/validation";

/** Drag-and-drop reschedule from the calendar — always revalidated by the engine. */
export const POST = salonRoute<{ salonId: string; bookingId: string }>("MANAGE_BOOKINGS", async ({ req, user, params }) => {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, params.bookingId), columns: { salonId: true } });
  if (!b || b.salonId !== params.salonId) throw Errors.notFound("Booking");
  const moved = await moveBooking(user, params.bookingId, await parseBody(req, moveSchema));
  return ok({ startsAt: moved!.startsAt, endsAt: moved!.endsAt });
});
