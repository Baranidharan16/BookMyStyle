import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db";
import { bookingResources, bookings, resourceBlocks, resources } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { blockSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";
import { sql } from "drizzle-orm";

export const GET = salonRoute(null, async ({ params }) => {
  const rows = await db
    .select({ id: resourceBlocks.id, resourceId: resourceBlocks.resourceId, resourceName: resources.name, startsAt: resourceBlocks.startsAt, endsAt: resourceBlocks.endsAt, reason: resourceBlocks.reason })
    .from(resourceBlocks)
    .innerJoin(resources, eq(resources.id, resourceBlocks.resourceId))
    .where(and(eq(resourceBlocks.salonId, params.salonId), gt(resourceBlocks.endsAt, new Date())))
    .orderBy(resourceBlocks.startsAt);
  return ok(rows);
});

/** Block a seat/resource (maintenance, private use). Refused if it would bump existing bookings. */
export const POST = salonRoute("MANAGE_BOOKINGS", async ({ req, user, params }) => {
  const input = await parseBody(req, blockSchema);
  const r = await db.query.resources.findFirst({ where: and(eq(resources.id, input.resourceId), eq(resources.salonId, params.salonId)) });
  if (!r) throw Errors.notFound("Resource");
  const block = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${params.salonId}, 42))`);
    const clash = await tx
      .select({ code: bookings.code, customerName: bookings.customerName })
      .from(bookingResources)
      .innerJoin(bookings, eq(bookings.id, bookingResources.bookingId))
      .where(
        and(
          eq(bookingResources.resourceId, input.resourceId),
          eq(bookingResources.active, true),
          sql`${bookingResources.startsAt} < ${new Date(input.endsAt)} and ${bookingResources.endsAt} > ${new Date(input.startsAt)}`,
          sql`(${bookings.status} <> 'PAYMENT_PENDING' or ${bookings.lockExpiresAt} > now())`,
        ),
      )
      .limit(5);
    if (clash.length) throw Errors.conflict("BLOCK_CONFLICT", `${r.name} has bookings in that window (${clash.map((c) => `${c.code} · ${c.customerName}`).join(", ")}). Move them first.`, { clash });
    const [b] = await tx.insert(resourceBlocks).values({ salonId: params.salonId, resourceId: input.resourceId, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), reason: input.reason, createdBy: user.id }).returning();
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "resource.blocked", entity: "resource", entityId: input.resourceId, newValue: input });
    await publish(tx, [{ ch: channels.salonAvailability(params.salonId), type: "availability" }, { ch: channels.salonOps(params.salonId), type: "resource" }]);
    return b!;
  });
  return ok(block, { status: 201 });
});
