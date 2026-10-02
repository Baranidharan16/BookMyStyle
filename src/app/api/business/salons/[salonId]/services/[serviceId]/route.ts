import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { services } from "@/server/db/schema";
import { saveService } from "@/server/domain/catalog";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { serviceSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

type P = { salonId: string; serviceId: string };

export const PUT = salonRoute<P>("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, serviceSchema);
  const before = await db.query.services.findFirst({ where: and(eq(services.id, params.serviceId), eq(services.salonId, params.salonId)) });
  if (!before) throw Errors.notFound("Service");
  await db.transaction(async (tx) => {
    await saveService(tx, params.salonId, input, params.serviceId);
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "service.changed", entity: "service", entityId: params.serviceId, oldValue: { name: before.name, price: before.price, duration: before.durationMinutes, buffer: before.bufferMinutes, active: before.active }, newValue: { name: input.name, price: input.price, duration: input.durationMinutes, buffer: input.bufferMinutes, active: input.active } });
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "services" });
  });
  return ok({ saved: true });
});

/** Services referenced by bookings are never hard-deleted — they're deactivated. */
export const DELETE = salonRoute<P>("OWNER", async ({ user, params }) => {
  const res = await db.update(services).set({ active: false }).where(and(eq(services.id, params.serviceId), eq(services.salonId, params.salonId))).returning({ id: services.id });
  if (!res.length) throw Errors.notFound("Service");
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "service.deactivated", entity: "service", entityId: params.serviceId });
  await publish(db, { ch: channels.salonAvailability(params.salonId), type: "services" });
  return ok({ deactivated: true });
});
