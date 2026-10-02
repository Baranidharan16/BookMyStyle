import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { salonPolicies } from "@/server/db/schema";
import { getPolicy } from "@/server/booking/context";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { policySchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";

export const GET = salonRoute(null, async ({ params }) => ok(await getPolicy(db, params.salonId)));

export const PUT = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, policySchema);
  const before = await getPolicy(db, params.salonId);
  await db.transaction(async (tx) => {
    await tx.insert(salonPolicies).values({ salonId: params.salonId, ...input }).onConflictDoUpdate({ target: salonPolicies.salonId, set: input });
    await tx.execute(sql`update salons set onboarding_step = greatest(onboarding_step, 10) where id = ${params.salonId}`);
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "salon.policies_changed", entity: "salon_policies", entityId: params.salonId, oldValue: before, newValue: input });
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "availability" });
  });
  return ok(await getPolicy(db, params.salonId));
});
