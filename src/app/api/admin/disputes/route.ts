import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { bookings, disputes, salons, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { notifyAdmins } from "@/server/notifications";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const rows = await db
    .select({ id: disputes.id, reason: disputes.reason, status: disputes.status, resolution: disputes.resolution, createdAt: disputes.createdAt, bookingCode: bookings.code, bookingId: bookings.id, salonName: salons.name, raisedBy: users.name })
    .from(disputes)
    .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
    .innerJoin(salons, eq(salons.id, bookings.salonId))
    .innerJoin(users, eq(users.id, disputes.raisedBy))
    .orderBy(desc(disputes.createdAt));
  return ok(rows);
});

/** Customers raise a dispute on their own booking. */
export const POST = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  const { bookingId, reason } = await parseBody(req, z.object({ bookingId: z.string().uuid(), reason: z.string().trim().min(10, "Please describe the issue (10+ characters)").max(1000) }));
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!b || b.customerId !== user.id) throw Errors.notFound("Booking");
  const [d] = await db.insert(disputes).values({ bookingId, raisedBy: user.id, reason }).returning();
  await notifyAdmins(db, { category: "SYSTEM", type: "admin.dispute", title: "New dispute raised", body: `${user.name} on ${b.code}: ${reason.slice(0, 100)}`, link: "/admin/disputes" });
  return ok(d, { status: 201 });
});
