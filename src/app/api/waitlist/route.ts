import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { services, waitlistEntries } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { waitlistSchema } from "@/lib/validation";

/** Join the waitlist for a time window; we notify when a matching slot frees up. */
export const POST = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  const input = await parseBody(req, waitlistSchema);
  const svc = await db.query.services.findFirst({ where: and(eq(services.id, input.serviceId), eq(services.salonId, input.salonId)), columns: { id: true } });
  if (!svc) throw Errors.notFound("Service");
  const dup = await db.query.waitlistEntries.findFirst({
    where: and(eq(waitlistEntries.customerId, user.id), eq(waitlistEntries.salonId, input.salonId), eq(waitlistEntries.date, input.date), eq(waitlistEntries.status, "ACTIVE")),
  });
  if (dup) {
    await db.update(waitlistEntries).set({ fromMinute: input.fromMinute, toMinute: input.toMinute, serviceId: input.serviceId }).where(eq(waitlistEntries.id, dup.id));
    return ok({ id: dup.id, updated: true });
  }
  const [row] = await db.insert(waitlistEntries).values({ ...input, customerId: user.id }).returning({ id: waitlistEntries.id });
  return ok({ id: row!.id }, { status: 201 });
});
