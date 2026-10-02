import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { coupons } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { couponSchema } from "@/lib/validation";
import { Errors, PG, pgCode } from "@/server/http/errors";

export const GET = salonRoute(null, async ({ params }) => ok(await db.query.coupons.findMany({ where: eq(coupons.salonId, params.salonId), orderBy: desc(coupons.createdAt) })));

export const POST = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, couponSchema);
  try {
    const [c] = await db.insert(coupons).values({ ...input, salonId: params.salonId, validFrom: new Date(input.validFrom), validTo: new Date(input.validTo) }).returning();
    await audit(db, { actorId: user.id, salonId: params.salonId, action: "coupon.created", entity: "coupon", entityId: c!.id, newValue: input });
    return ok(c, { status: 201 });
  } catch (e) {
    if (pgCode(e) === PG.UNIQUE_VIOLATION) throw Errors.conflict("CODE_TAKEN", `The code ${input.code} is already in use at your salon.`);
    throw e;
  }
});
