import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookingResources, bookings, resources } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { z } from "zod";
import { channels, publish } from "@/server/realtime/publish";

type P = { salonId: string; resourceId: string };

export const PATCH = salonRoute<P>("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60).optional(), active: z.boolean().optional() }));
  const before = await db.query.resources.findFirst({ where: and(eq(resources.id, params.resourceId), eq(resources.salonId, params.salonId)) });
  if (!before) throw Errors.notFound("Resource");
  if (input.active === false && before.active) {
    const future = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookingResources)
      .innerJoin(bookings, eq(bookings.id, bookingResources.bookingId))
      .where(and(eq(bookingResources.resourceId, params.resourceId), eq(bookingResources.active, true), gt(bookingResources.endsAt, new Date())));
    if ((future[0]?.n ?? 0) > 0) throw Errors.conflict("HAS_BOOKINGS", `This resource has ${future[0]!.n} upcoming booking(s). Move them before deactivating, or block it temporarily instead.`);
  }
  const [r] = await db.update(resources).set(input).where(eq(resources.id, params.resourceId)).returning();
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "resource.updated", entity: "resource", entityId: params.resourceId, oldValue: { name: before.name, active: before.active }, newValue: input });
  await publish(db, [{ ch: channels.salonAvailability(params.salonId), type: "availability" }, { ch: channels.salonOps(params.salonId), type: "resource" }]);
  return ok(r);
});
