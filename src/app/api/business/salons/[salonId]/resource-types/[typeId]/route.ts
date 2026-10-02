import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { resourceTypes, serviceResourceRequirements } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { z } from "zod";

type P = { salonId: string; typeId: string };

export const PATCH = salonRoute<P>("OWNER", async ({ req, params }) => {
  const input = await parseBody(req, z.object({ name: z.string().trim().min(2).max(60), area: z.string().trim().max(60).nullable().optional() }));
  const res = await db.update(resourceTypes).set(input).where(and(eq(resourceTypes.id, params.typeId), eq(resourceTypes.salonId, params.salonId))).returning();
  if (!res.length) throw Errors.notFound("Resource type");
  return ok(res[0]);
});

export const DELETE = salonRoute<P>("OWNER", async ({ user, params }) => {
  const used = await db.query.serviceResourceRequirements.findFirst({ where: eq(serviceResourceRequirements.resourceTypeId, params.typeId) });
  if (used) throw Errors.conflict("IN_USE", "Services still require this resource type. Update those services first.");
  const res = await db.delete(resourceTypes).where(and(eq(resourceTypes.id, params.typeId), eq(resourceTypes.salonId, params.salonId))).returning();
  if (!res.length) throw Errors.notFound("Resource type");
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "resource_type.deleted", entity: "resource_type", entityId: params.typeId });
  return ok({ deleted: true });
});
