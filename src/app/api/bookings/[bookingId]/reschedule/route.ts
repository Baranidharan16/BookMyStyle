import { rescheduleBooking } from "@/server/booking/engine";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { rescheduleSchema } from "@/lib/validation";

export const POST = route<{ bookingId: string }>(async (req, { params }) => {
  const user = await requireUser(["CUSTOMER"]);
  const input = await parseBody(req, rescheduleSchema);
  const b = await rescheduleBooking(user, (await params).bookingId, input);
  return ok({ startsAt: b!.startsAt, endsAt: b!.endsAt, rescheduleCount: b!.rescheduleCount });
});
