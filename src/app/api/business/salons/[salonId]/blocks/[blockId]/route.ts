import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { resourceBlocks } from "@/server/db/schema";
import { ok } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { channels, publish } from "@/server/realtime/publish";

export const DELETE = salonRoute<{ salonId: string; blockId: string }>("MANAGE_BOOKINGS", async ({ user, params }) => {
  const res = await db.delete(resourceBlocks).where(and(eq(resourceBlocks.id, params.blockId), eq(resourceBlocks.salonId, params.salonId))).returning();
  if (!res.length) throw Errors.notFound("Block");
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "resource.unblocked", entity: "resource", entityId: res[0]!.resourceId });
  await publish(db, [{ ch: channels.salonAvailability(params.salonId), type: "availability" }, { ch: channels.salonOps(params.salonId), type: "resource" }]);
  return ok({ deleted: true });
});
