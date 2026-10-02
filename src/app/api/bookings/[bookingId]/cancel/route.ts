import { cancelBooking, cancellationPreview } from "@/server/booking/engine";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { cancelSchema } from "@/lib/validation";

/** GET → refund preview under the salon's policy. POST → cancel. */
export const GET = route<{ bookingId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  return ok(await cancellationPreview(user, (await params).bookingId));
});

export const POST = route<{ bookingId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { reason } = await parseBody(req, cancelSchema);
  const res = await cancelBooking(user, (await params).bookingId, reason);
  return ok({ status: res.booking.status, refund: res.refund });
});
