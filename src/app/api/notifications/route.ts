import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  const user = await requireUser();
  const category = req.nextUrl.searchParams.get("category");
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), category ? eq(notifications.category, category as "BOOKING") : undefined))
    .orderBy(desc(notifications.createdAt))
    .limit(60);
  const [unread] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  return ok({ items: rows.map(({ externalDeliveredAt: _x, ...r }) => r), unread: unread?.n ?? 0 });
});
