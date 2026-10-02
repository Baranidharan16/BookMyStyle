import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { businessHours, resources, salonLocations, salons, services, staff } from "@/server/db/schema";
import { ok } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { notifyAdmins } from "@/server/notifications";

/** Final onboarding step: validate completeness and submit for verification. */
export const POST = salonRoute("OWNER", async ({ user, params }) => {
  const s = await db.query.salons.findFirst({ where: eq(salons.id, params.salonId) });
  if (!s) throw Errors.notFound("Salon");
  if (!["DRAFT", "REJECTED"].includes(s.status)) throw Errors.conflict("ALREADY_SUBMITTED", "This salon has already been submitted for verification.");
  const [loc, hours, res, st, svc] = await Promise.all([
    db.query.salonLocations.findFirst({ where: eq(salonLocations.salonId, s.id) }),
    db.query.businessHours.findFirst({ where: eq(businessHours.salonId, s.id) }),
    db.query.resources.findFirst({ where: and(eq(resources.salonId, s.id), eq(resources.active, true)) }),
    db.query.staff.findFirst({ where: and(eq(staff.salonId, s.id), eq(staff.active, true)) }),
    db.query.services.findFirst({ where: and(eq(services.salonId, s.id), eq(services.active, true)) }),
  ]);
  const missing = [!loc && "location", !hours && "business hours", !res && "at least one seat/resource", !st && "at least one staff member", !svc && "at least one service", !s.payoutDetails?.ifsc && "payout details"].filter(Boolean);
  if (missing.length) throw Errors.validation(`Please add ${missing.join(", ")} before submitting.`);
  await db.transaction(async (tx) => {
    await tx.update(salons).set({ status: "PENDING", onboardingStep: 11 }).where(eq(salons.id, s.id));
    await audit(tx, { actorId: user.id, salonId: s.id, action: "salon.submitted", entity: "salon", entityId: s.id });
    await notifyAdmins(tx, { category: "SYSTEM", type: "admin.salon_pending", title: "New salon awaiting verification", body: `${s.name} submitted its profile for review.`, link: "/admin/salons?status=PENDING" });
  });
  return ok({ status: "PENDING" });
});
