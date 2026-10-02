import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookingStaff, bookings, reviews } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { notifySalonTeam } from "@/server/notifications";
import { getPolicy } from "@/server/booking/context";
import { reviewSchema } from "@/lib/validation";

/** Only the customer of a COMPLETED booking can review it — once (unique booking_id). */
export const POST = route<{ bookingId: string }>(async (req, { params }) => {
  const user = await requireUser(["CUSTOMER"]);
  const { bookingId } = await params;
  const input = await parseBody(req, reviewSchema);
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!b || b.customerId !== user.id) throw Errors.notFound("Booking");
  if (b.status !== "COMPLETED") throw Errors.conflict("NOT_REVIEWABLE", "You can review a visit once the service is completed.");
  const existing = await db.query.reviews.findFirst({ where: eq(reviews.bookingId, b.id), columns: { id: true } });
  if (existing) throw Errors.conflict("ALREADY_REVIEWED", "You've already reviewed this visit. Thank you!");
  const st = await db.query.bookingStaff.findFirst({ where: eq(bookingStaff.bookingId, b.id) });
  await db.transaction(async (tx) => {
    await tx.insert(reviews).values({ bookingId: b.id, salonId: b.salonId, customerId: user.id, serviceId: b.serviceId, staffId: st?.staffId ?? null, ...input });
    await tx.execute(sql`update salons s set rating_avg = round(x.a::numeric, 1), rating_count = x.n from (select avg(rating) a, count(*) n from reviews where salon_id = ${b.salonId} and status = 'PUBLISHED') x where s.id = ${b.salonId}`);
    if (st) await tx.execute(sql`update staff s set rating_avg = round(x.a::numeric, 1), rating_count = x.n from (select avg(coalesce(staff_rating, rating)) a, count(*) n from reviews where staff_id = ${st.staffId} and status = 'PUBLISHED') x where s.id = ${st.staffId}`);
    const policy = await getPolicy(tx, b.salonId);
    if (policy.notificationPrefs.reviews) {
      await notifySalonTeam(tx, b.salonId, { category: "SALON", type: "salon.review", title: `New ${input.rating}★ review`, body: `${user.name}: ${input.comment?.slice(0, 120) || "(no comment)"}`, link: "/business/reviews" });
    }
  });
  return ok({ created: true }, { status: 201 });
});
