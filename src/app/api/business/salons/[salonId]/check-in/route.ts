import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { bookings } from "@/server/db/schema";
import { transitionBooking } from "@/server/booking/engine";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";

const schema = z.object({ code: z.string().trim().min(4).max(40), token: z.string().max(100).optional() });

/** Check in by booking code (manual) or by scanning the ticket QR (code + secret token). */
export const POST = salonRoute("CHECK_IN", async ({ req, user, params }) => {
  const { code, token } = await parseBody(req, schema);
  const b = await db.query.bookings.findFirst({ where: and(eq(bookings.salonId, params.salonId), sql`upper(${bookings.code}) = ${code.toUpperCase()}`) });
  if (!b) throw Errors.notFound("Booking for this salon");
  const res = await transitionBooking(user, b.id, "CHECK_IN", token !== undefined ? { checkInToken: token } : {});
  return ok({ bookingId: b.id, customerName: b.customerName, status: res.booking.status, message: res.message, lateMinutes: res.booking.lateMinutes });
});
