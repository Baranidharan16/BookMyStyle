import { requireUser } from "@/server/auth/session";
import { getSalonAccess } from "@/server/auth/access";
import { getBookingDetail } from "@/server/domain/bookings";
import { ok, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";

/** GET /api/bookings/:id — visible to its customer and to the salon's team. */
export const GET = route<{ bookingId: string }>(async (_req, { params }) => {
  const { bookingId } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) throw Errors.notFound("Booking");
  const d = await getBookingDetail(bookingId);
  if (!d) throw Errors.notFound("Booking");
  const isCustomer = d.booking.customerId === user.id;
  const isTeam = !isCustomer && (await getSalonAccess(user, d.booking.salonId));
  if (!isCustomer && !isTeam) throw Errors.notFound("Booking");
  // the check-in token is only for the customer's QR code
  const booking = isCustomer ? d.booking : { ...d.booking, checkInToken: "" };
  return ok({ ...d, booking, viewer: isCustomer ? "CUSTOMER" : "SALON" });
});
