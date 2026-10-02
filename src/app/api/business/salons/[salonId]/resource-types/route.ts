import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { resourceTypes, resources } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { resourceTypeSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

export const GET = salonRoute(null, async ({ params }) => {
  const types = await db.query.resourceTypes.findMany({ where: eq(resourceTypes.salonId, params.salonId), orderBy: asc(resourceTypes.name) });
  const res = await db.query.resources.findMany({ where: eq(resources.salonId, params.salonId), orderBy: [asc(resources.sort), asc(resources.name)] });
  return ok(types.map((t) => ({ ...t, resources: res.filter((r) => r.resourceTypeId === t.id) })));
});

/** Create a resource type and N resources of it (e.g. "Haircut Chair" × 6). */
export const POST = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, resourceTypeSchema);
  const out = await db.transaction(async (tx) => {
    const [t] = await tx.insert(resourceTypes).values({ salonId: params.salonId, name: input.name, area: input.area ?? null }).returning();
    const short = input.name.split(" ").pop() ?? input.name;
    if (input.count) await tx.insert(resources).values(Array.from({ length: input.count }, (_, i) => ({ salonId: params.salonId, resourceTypeId: t!.id, name: `${short} ${i + 1}`, sort: i })));
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "resource_type.created", entity: "resource_type", entityId: t!.id, newValue: input });
    await tx.execute(sql`update salons set onboarding_step = greatest(onboarding_step, 6) where id = ${params.salonId}`);
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "availability" });
    return t!;
  });
  return ok(out, { status: 201 });
});
