import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, salons, services } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  await requireUser(["ADMIN"]);
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const status = sp.get("status");
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const rows = await db
    .select({ id: bookings.id, code: bookings.code, status: bookings.status, source: bookings.source, startsAt: bookings.startsAt, total: bookings.total, paymentStatus: bookings.paymentStatus, customerName: bookings.customerName, salonName: salons.name, serviceName: services.name, createdAt: bookings.createdAt, total_count: sql<number>`count(*) over()` })
    .from(bookings)
    .innerJoin(salons, eq(salons.id, bookings.salonId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(and(q ? or(ilike(bookings.code, `%${q}%`), ilike(bookings.customerName, `%${q}%`), ilike(salons.name, `%${q}%`)) : undefined, status ? eq(bookings.status, status as "CONFIRMED") : undefined))
    .orderBy(desc(bookings.createdAt))
    .limit(30)
    .offset((page - 1) * 30);
  return ok({ items: rows, total: Number(rows[0]?.total_count ?? 0) });
});
