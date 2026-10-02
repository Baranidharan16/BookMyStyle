import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { coupons } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { couponSchema } from "@/lib/validation";
import { z } from "zod";

type P = { salonId: string; couponId: string };

export const PUT = salonRoute<P>("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, couponSchema);
  const res = await db.update(coupons).set({ ...input, validFrom: new Date(input.validFrom), validTo: new Date(input.validTo) }).where(and(eq(coupons.id, params.couponId), eq(coupons.salonId, params.salonId))).returning();
  if (!res.length) throw Errors.notFound("Offer");
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "coupon.updated", entity: "coupon", entityId: params.couponId, newValue: input });
  return ok(res[0]);
});

export const PATCH = salonRoute<P>("OWNER", async ({ req, user, params }) => {
  const { active } = await parseBody(req, z.object({ active: z.boolean() }));
  const res = await db.update(coupons).set({ active }).where(and(eq(coupons.id, params.couponId), eq(coupons.salonId, params.salonId))).returning();
  if (!res.length) throw Errors.notFound("Offer");
  await audit(db, { actorId: user.id, salonId: params.salonId, action: active ? "coupon.activated" : "coupon.paused", entity: "coupon", entityId: params.couponId });
  return ok(res[0]);
});
