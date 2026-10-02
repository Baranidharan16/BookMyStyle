import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { refunds } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { processRefund } from "@/server/booking/engine";
import { ok, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { audit } from "@/server/audit";

/** Retry a failed refund. */
export const POST = route<{ refundId: string }>(async (_req, { params }) => {
  const admin = await requireUser(["ADMIN"]);
  const { refundId } = await params;
  const r = await db.query.refunds.findFirst({ where: eq(refunds.id, refundId) });
  if (!r) throw Errors.notFound("Refund");
  if (r.status === "PROCESSED") throw Errors.conflict("ALREADY_PROCESSED", "This refund has already been processed.");
  await db.update(refunds).set({ status: "PENDING", failureReason: null }).where(eq(refunds.id, r.id));
  await audit(db, { actorId: admin.id, action: "admin.refund_retry", entity: "refund", entityId: r.id });
  const res = await processRefund(r.id);
  return ok({ status: res?.status });
});
