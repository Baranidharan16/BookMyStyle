import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { salonLocations, salons } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { locationSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";

export const GET = salonRoute(null, async ({ params }) => ok((await db.query.salonLocations.findFirst({ where: eq(salonLocations.salonId, params.salonId) })) ?? null));

export const PUT = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, locationSchema);
  await db.transaction(async (tx) => {
    await tx.insert(salonLocations).values({ salonId: params.salonId, ...input }).onConflictDoUpdate({ target: salonLocations.salonId, set: input });
    const s = await tx.query.salons.findFirst({ where: eq(salons.id, params.salonId), columns: { status: true } });
    // the public URL city only changes before approval (keeps SEO links stable)
    if (s && s.status !== "APPROVED") await tx.update(salons).set({ citySlug: slugify(input.city) }).where(eq(salons.id, params.salonId));
    await tx.execute(sql`update salons set onboarding_step = greatest(onboarding_step, 4) where id = ${params.salonId}`);
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "salon.location_changed", entity: "salon", entityId: params.salonId, newValue: input });
  });
  return ok({ saved: true });
});
