import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { reviews, services, staff, users } from "@/server/db/schema";
import { ok, route } from "@/server/http/handler";

export const GET = route<{ salonId: string }>(async (req, { params }) => {
  const { salonId } = await params;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const rows = await db
    .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, ownerReply: reviews.ownerReply, createdAt: reviews.createdAt, customerName: users.name, serviceName: services.name, staffName: staff.name })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.customerId))
    .leftJoin(services, eq(services.id, reviews.serviceId))
    .leftJoin(staff, eq(staff.id, reviews.staffId))
    .where(and(eq(reviews.salonId, salonId), eq(reviews.status, "PUBLISHED")))
    .orderBy(desc(reviews.createdAt))
    .limit(20)
    .offset((page - 1) * 20);
  return ok(rows);
});
