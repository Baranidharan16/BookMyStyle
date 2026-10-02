import { db } from "@/server/db";
import { listServices, saveService } from "@/server/domain/catalog";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { serviceSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

export const GET = salonRoute(null, async ({ params }) => ok(await listServices(params.salonId)));

export const POST = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, serviceSchema);
  const id = await db.transaction(async (tx) => {
    const sid = await saveService(tx, params.salonId, input);
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "service.created", entity: "service", entityId: sid, newValue: { name: input.name, price: input.price, duration: input.durationMinutes } });
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "services" });
    return sid;
  });
  return ok({ id }, { status: 201 });
});
