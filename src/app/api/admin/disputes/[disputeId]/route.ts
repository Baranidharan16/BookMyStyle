import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { disputes } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";

export const PATCH = route<{ disputeId: string }>(async (req, { params }) => {
  const admin = await requireUser(["ADMIN"]);
  const { disputeId } = await params;
  const input = await parseBody(req, z.object({ status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"]), resolution: z.string().trim().max(1000).optional() }));
  const [d] = await db.update(disputes).set(input).where(eq(disputes.id, disputeId)).returning();
  if (!d) throw Errors.notFound("Dispute");
  await audit(db, { actorId: admin.id, action: "admin.dispute_updated", entity: "dispute", entityId: d.id, newValue: input });
  if (input.status === "RESOLVED" || input.status === "REJECTED") {
    await notify(db, d.raisedBy, { category: "SYSTEM", type: "dispute.update", title: `Dispute ${input.status.toLowerCase()}`, body: input.resolution ?? "Your dispute has been reviewed.", link: `/customer/bookings/${d.bookingId}` });
  }
  return ok(d);
});
