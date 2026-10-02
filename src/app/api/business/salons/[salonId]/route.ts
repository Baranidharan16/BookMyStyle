import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { salons } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { salonProfileSchema } from "@/lib/validation";
import { publish, channels } from "@/server/realtime/publish";

export const GET = salonRoute(null, async ({ params }) => {
  const s = await db.query.salons.findFirst({ where: eq(salons.id, params.salonId) });
  return ok(s);
});

export const PATCH = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, salonProfileSchema);
  const before = await db.query.salons.findFirst({ where: eq(salons.id, params.salonId) });
  await db.transaction(async (tx) => {
    await tx.update(salons).set({ ...input, phone: input.phone ?? null, email: input.email || null, onboardingStep: Math.max(before!.onboardingStep, 3) }).where(eq(salons.id, params.salonId));
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "salon.profile_updated", entity: "salon", entityId: params.salonId, oldValue: { name: before?.name, tagline: before?.tagline }, newValue: { name: input.name, tagline: input.tagline } });
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "profile" });
  });
  return ok({ saved: true });
});
