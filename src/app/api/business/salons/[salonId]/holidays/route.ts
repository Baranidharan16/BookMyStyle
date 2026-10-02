import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, holidays, salons } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { holidaySchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";
import { addDaysKey, zonedToUtc } from "@/lib/time";

export const GET = salonRoute(null, async ({ params }) => ok(await db.query.holidays.findMany({ where: and(eq(holidays.salonId, params.salonId), gte(holidays.date, sql`current_date`)), orderBy: asc(holidays.date) })));

/** Add a holiday / closure / special-hours day. Returns existing bookings that day so the owner can act on them. */
export const POST = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, holidaySchema);
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, params.salonId), columns: { timezone: true } });
  const tz = salon!.timezone;
  const [h] = await db.insert(holidays).values({ salonId: params.salonId, date: input.date, isClosed: input.isClosed, openMinute: input.isClosed ? null : input.openMinute, closeMinute: input.isClosed ? null : input.closeMinute, reason: input.reason }).returning();
  const affected = await db
    .select({ id: bookings.id, code: bookings.code, customerName: bookings.customerName, startsAt: bookings.startsAt })
    .from(bookings)
    .where(and(eq(bookings.salonId, params.salonId), sql`${bookings.startsAt} >= ${zonedToUtc(input.date, 0, tz)} and ${bookings.startsAt} < ${zonedToUtc(addDaysKey(input.date, 1), 0, tz)}`, sql`${bookings.status} in ('CONFIRMED','PAYMENT_PENDING')`));
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "salon.holiday_added", entity: "holiday", entityId: h!.id, newValue: input });
  await publish(db, { ch: channels.salonAvailability(params.salonId), type: "availability", data: { date: input.date } });
  return ok({ holiday: h, affectedBookings: affected }, { status: 201 });
});
