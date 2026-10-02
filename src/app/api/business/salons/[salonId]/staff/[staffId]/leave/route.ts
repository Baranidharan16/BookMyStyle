import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookingStaff, bookings, staff, staffLeaves } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { leaveSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

type P = { salonId: string; staffId: string };

export const POST = salonRoute<P>("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, leaveSchema);
  const st = await db.query.staff.findFirst({ where: and(eq(staff.id, params.staffId), eq(staff.salonId, params.salonId)) });
  if (!st) throw Errors.notFound("Staff member");
  const from = new Date(input.startsAt), to = new Date(input.endsAt);
  const clash = await db
    .select({ code: bookings.code, startsAt: bookings.startsAt })
    .from(bookingStaff)
    .innerJoin(bookings, eq(bookings.id, bookingStaff.bookingId))
    .where(and(eq(bookingStaff.staffId, params.staffId), eq(bookingStaff.active, true), sql`${bookingStaff.startsAt} < ${to} and ${bookingStaff.endsAt} > ${from}`))
    .limit(10);
  if (clash.length) throw Errors.conflict("LEAVE_CONFLICT", `${st.name} has ${clash.length} booking(s) during this leave (${clash.map((c) => c.code).join(", ")}). Reassign or move them first.`);
  const [row] = await db.insert(staffLeaves).values({ staffId: params.staffId, startsAt: from, endsAt: to, reason: input.reason }).returning();
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "staff.leave_added", entity: "staff", entityId: params.staffId, newValue: input });
  await publish(db, { ch: channels.salonAvailability(params.salonId), type: "availability" });
  return ok(row, { status: 201 });
});

export const DELETE = salonRoute<P>("OWNER", async ({ req, params }) => {
  const id = req.nextUrl.searchParams.get("leaveId") ?? "";
  await db.delete(staffLeaves).where(and(eq(staffLeaves.id, id), eq(staffLeaves.staffId, params.staffId)));
  await publish(db, { ch: channels.salonAvailability(params.salonId), type: "availability" });
  return ok({ deleted: true });
});
