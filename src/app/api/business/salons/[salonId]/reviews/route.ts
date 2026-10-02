import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { reviews, services, staff, users } from "@/server/db/schema";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";

export const GET = salonRoute(null, async ({ params }) => {
  const rows = await db
    .select({ id: reviews.id, rating: reviews.rating, serviceRating: reviews.serviceRating, staffRating: reviews.staffRating, comment: reviews.comment, ownerReply: reviews.ownerReply, repliedAt: reviews.repliedAt, status: reviews.status, createdAt: reviews.createdAt, customerName: users.name, serviceName: services.name, staffName: staff.name })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.customerId))
    .leftJoin(services, eq(services.id, reviews.serviceId))
    .leftJoin(staff, eq(staff.id, reviews.staffId))
    .where(eq(reviews.salonId, params.salonId))
    .orderBy(desc(reviews.createdAt))
    .limit(100);
  return ok(rows);
});
