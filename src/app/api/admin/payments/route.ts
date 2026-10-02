import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, payments, salons } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  await requireUser(["ADMIN"]);
  const status = req.nextUrl.searchParams.get("status");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const rows = await db
    .select({ id: payments.id, provider: payments.provider, providerOrderId: payments.providerOrderId, providerPaymentId: payments.providerPaymentId, amount: payments.amount, status: payments.status, method: payments.method, failureReason: payments.failureReason, createdAt: payments.createdAt, bookingCode: bookings.code, salonName: salons.name, total_count: sql<number>`count(*) over()` })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(salons, eq(salons.id, bookings.salonId))
    .where(and(status ? eq(payments.status, status as "SUCCESSFUL") : undefined, sql`${payments.provider} <> 'offline'`))
    .orderBy(desc(payments.createdAt))
    .limit(30)
    .offset((page - 1) * 30);
  return ok({ items: rows, total: Number(rows[0]?.total_count ?? 0) });
});
