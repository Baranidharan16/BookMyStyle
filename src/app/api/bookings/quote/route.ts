import { quoteBooking } from "@/server/booking/engine";
import { getSessionUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { quoteSchema } from "@/lib/validation";

/** POST /api/bookings/quote — price breakdown (service + add-ons − discount + GST). */
export const POST = route(async (req) => {
  const input = await parseBody(req, quoteSchema);
  return ok(await quoteBooking(await getSessionUser(), { ...input, couponCode: input.couponCode ?? undefined }));
});
