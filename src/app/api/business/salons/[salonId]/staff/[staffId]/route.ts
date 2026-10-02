import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookingStaff, staff } from "@/server/db/schema";
import { listStaff, saveStaff } from "@/server/domain/catalog";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { staffSchema } from "@/lib/validation";
import { channels, publish } from "@/server/realtime/publish";
import { z } from "zod";

type P = { salonId: string; staffId: string };

export const PUT = salonRoute<P>("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, staffSchema);
  const before = (await listStaff(params.salonId)).find((s) => s.id === params.staffId);
  if (!before) throw Errors.notFound("Staff member");
  const res = await db.transaction(async (tx) => {
    const r = await saveStaff(tx, params.salonId, input, params.staffId);
    await audit(tx, { actorId: user.id, salonId: params.salonId, action: "staff.schedule_changed", entity: "staff", entityId: params.staffId, oldValue: { schedule: before.schedule, breaks: before.breaks, serviceIds: before.serviceIds }, newValue: { schedule: input.schedule, breaks: input.breaks, serviceIds: input.serviceIds } });
    await publish(tx, { ch: channels.salonAvailability(params.salonId), type: "availability" });
    return r;
  });
  return ok(res);
});

/** Quick availability toggle (Available / On break / Off duty) — staff can set their own. */
export const PATCH = salonRoute<P>(null, async ({ req, user, params, access }) => {
  const { availability } = await parseBody(req, z.object({ availability: z.enum(["AVAILABLE", "BUSY", "ON_BREAK", "OFF_DUTY"]) }));
  if (access.level === "STAFF" && access.staffId !== params.staffId) throw Errors.forbidden("You can only update your own status.");
  const res = await db.update(staff).set({ availability }).where(and(eq(staff.id, params.staffId), eq(staff.salonId, params.salonId))).returning({ id: staff.id });
  if (!res.length) throw Errors.notFound("Staff member");
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "staff.availability", entity: "staff", entityId: params.staffId, newValue: { availability } });
  await publish(db, { ch: channels.salonOps(params.salonId), type: "staff" });
  return ok({ availability });
});

export const DELETE = salonRoute<P>("OWNER", async ({ user, params }) => {
  const [future] = await db.select({ n: sql<number>`count(*)::int` }).from(bookingStaff).where(and(eq(bookingStaff.staffId, params.staffId), eq(bookingStaff.active, true), gt(bookingStaff.endsAt, new Date())));
  if ((future?.n ?? 0) > 0) throw Errors.conflict("HAS_BOOKINGS", `${future!.n} upcoming booking(s) are assigned to this staff member. Reassign them first.`);
  const res = await db.update(staff).set({ active: false }).where(and(eq(staff.id, params.staffId), eq(staff.salonId, params.salonId))).returning({ id: staff.id });
  if (!res.length) throw Errors.notFound("Staff member");
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "staff.deactivated", entity: "staff", entityId: params.staffId });
  return ok({ deactivated: true });
});
