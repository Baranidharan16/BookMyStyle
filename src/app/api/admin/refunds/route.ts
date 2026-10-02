import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, refunds, salons } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const rows = await db
    .select({ id: refunds.id, amount: refunds.amount, status: refunds.status, reason: refunds.reason, failureReason: refunds.failureReason, providerRefundId: refunds.providerRefundId, createdAt: refunds.createdAt, processedAt: refunds.processedAt, bookingCode: bookings.code, customerName: bookings.customerName, salonName: salons.name })
    .from(refunds)
    .innerJoin(bookings, eq(bookings.id, refunds.bookingId))
    .innerJoin(salons, eq(salons.id, bookings.salonId))
    .orderBy(desc(refunds.createdAt))
    .limit(100);
  return ok(rows);
});
