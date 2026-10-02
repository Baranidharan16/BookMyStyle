import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { businessHours } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { weeklyHoursSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

export const GET = salonRoute(null, async ({ params }) => ok(await db.query.businessHours.findMany({ where: eq(businessHours.salonId, params.salonId), orderBy: [asc(businessHours.weekday), asc(businessHours.openMinute)] })));

/** Replace the weekly schedule (multiple shifts per day supported). */
export const PUT = salonRoute("OWNER", async ({ req, user, params }) => {
  const days = await parseBody(req, weeklyHoursSchema);
  const before = await db.query.businessHours.findMany({ where: eq(businessHours.salonId, params.salonId) });
  await db.transaction(async (tx) => {
    await tx.delete(businessHours).where(eq(businessHours.salonId, params.salonId));
    const rows = days.flatMap((d) => d.shifts.map((s) => ({ salonId: params.salonId, weekday: d.weekday, openMinute: s.start, closeMinute: s.end })));
    if (rows.length) await tx.insert(businessHours).values(rows);
    await tx.execute(sql`update salons set onboarding_step = greatest(onboarding_step, 5) where id = ${params.salonId}`);
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "salon.hours_changed", entity: "salon", entityId: params.salonId, oldValue: before.map((b) => [b.weekday, b.openMinute, b.closeMinute]), newValue: rows.map((b) => [b.weekday, b.openMinute, b.closeMinute]) });
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "availability" });
  });
  return ok({ saved: true });
});
