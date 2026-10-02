import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { reviews, salons, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  await requireUser(["ADMIN"]);
  const status = req.nextUrl.searchParams.get("status");
  const rows = await db
    .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, status: reviews.status, moderationNote: reviews.moderationNote, createdAt: reviews.createdAt, customerName: users.name, salonName: salons.name })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.customerId))
    .innerJoin(salons, eq(salons.id, reviews.salonId))
    .where(status ? eq(reviews.status, status as "FLAGGED") : undefined)
    .orderBy(desc(reviews.createdAt))
    .limit(100);
  return ok(rows);
});
