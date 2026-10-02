import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { salons } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { channels, publish } from "@/server/realtime/publish";

const schema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  verificationNotes: z.string().trim().max(1000).optional(),
  featured: z.boolean().optional(),
  plan: z.enum(["FREE", "PRO", "PREMIUM"]).optional(),
  commissionPercent: z.number().min(0).max(50).nullable().optional(),
});

/** Verification workflow + business-model knobs (plan, featured listing, commission override). */
export const PATCH = route<{ salonId: string }>(async (req, { params }) => {
  const admin = await requireUser(["ADMIN"]);
  const { salonId } = await params;
  const input = await parseBody(req, schema);
  const before = await db.query.salons.findFirst({ where: eq(salons.id, salonId) });
  if (!before) throw Errors.notFound("Salon");
  await db.transaction(async (tx) => {
    await tx.update(salons).set(input).where(eq(salons.id, salonId));
    await audit(tx, { actorId: admin.id, salonId, action: "admin.salon_updated", entity: "salon", entityId: salonId, oldValue: { status: before.status, plan: before.plan, featured: before.featured, commissionPercent: before.commissionPercent }, newValue: input });
    if (input.status && input.status !== before.status) {
      const msg: Record<string, string> = {
        APPROVED: "Congratulations! Your salon is now live on BookMyStyle and accepting bookings.",
        REJECTED: `Your salon application needs changes: ${input.verificationNotes ?? "please review your details."}`,
        SUSPENDED: `Your salon has been suspended. ${input.verificationNotes ?? "Please contact support."}`,
        UNDER_REVIEW: "Your salon is under review. We'll get back to you within 48 hours.",
        PENDING: "Your salon is pending verification.",
      };
      await notify(tx, before.ownerId, { category: "SYSTEM", type: "salon.status", title: `Salon ${input.status.toLowerCase().replace("_", " ")}`, body: msg[input.status]!, link: "/business" });
      await publish(tx, { ch: channels.salonAvailability(salonId), type: "availability" });
    }
  });
  return ok({ saved: true });
});
