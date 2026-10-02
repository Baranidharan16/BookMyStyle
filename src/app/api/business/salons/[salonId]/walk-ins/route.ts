import { createDeskBooking } from "@/server/booking/engine";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { deskBookingSchema } from "@/lib/validation";

/** POST /api/business/salons/:id/walk-ins — add a walk-in / phone booking (instantly reduces online availability). */
export const POST = salonRoute(null, async ({ req, user, params }) => {
  const input = await parseBody(req, deskBookingSchema);
  const b = await createDeskBooking(user, params.salonId, input);
  return ok({ id: b!.id, code: b!.code, status: b!.status, overrideConflict: b!.overrideConflict }, { status: 201 });
});
