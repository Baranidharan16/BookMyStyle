import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { resourceTypes, resources } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { resourceSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

export const GET = salonRoute(null, async ({ params }) => {
  const rows = await db
    .select({ id: resources.id, name: resources.name, active: resources.active, resourceTypeId: resources.resourceTypeId, typeName: resourceTypes.name, area: resourceTypes.area })
    .from(resources)
    .innerJoin(resourceTypes, eq(resourceTypes.id, resources.resourceTypeId))
    .where(eq(resources.salonId, params.salonId))
    .orderBy(resourceTypes.name, resources.sort);
  return ok(rows);
});

export const POST = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, resourceSchema);
  const t = await db.query.resourceTypes.findFirst({ where: and(eq(resourceTypes.id, input.resourceTypeId), eq(resourceTypes.salonId, params.salonId)) });
  if (!t) throw Errors.notFound("Resource type");
  const [maxSort] = await db.select({ m: sql<number>`coalesce(max(sort), -1)::int` }).from(resources).where(eq(resources.resourceTypeId, t.id));
  const [r] = await db.insert(resources).values({ ...input, salonId: params.salonId, sort: (maxSort?.m ?? -1) + 1 }).returning();
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "resource.created", entity: "resource", entityId: r!.id, newValue: input });
  await publish(db, { ch: channels.salonAvailability(params.salonId), type: "availability" });
  return ok(r, { status: 201 });
});
