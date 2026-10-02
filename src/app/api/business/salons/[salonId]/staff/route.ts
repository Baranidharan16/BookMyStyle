import { db } from "@/server/db";
import { listStaff, saveStaff } from "@/server/domain/catalog";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { staffSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

export const GET = salonRoute(null, async ({ params }) => ok(await listStaff(params.salonId)));

export const POST = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, staffSchema);
  const res = await db.transaction(async (tx) => {
    const r = await saveStaff(tx, params.salonId, input);
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "staff.created", entity: "staff", entityId: r.id, newValue: { name: input.name, schedule: input.schedule } });
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "availability" });
    return r;
  });
  return ok(res, { status: 201 });
});
