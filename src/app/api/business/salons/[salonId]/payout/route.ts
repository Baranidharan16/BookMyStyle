import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { salons } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { audit } from "@/server/audit";
import { payoutSchema } from "@/lib/validation";

/** Store payout details. Full account numbers are never stored here — only the last 4 digits (the
 * full number would go to the payment provider's linked-account / payouts API). */
export const PUT = salonRoute("OWNER", async ({ req, user, params }) => {
  const input = await parseBody(req, payoutSchema);
  const details = { accountName: input.accountName, accountNumberLast4: input.accountNumber.slice(-4), ifsc: input.ifsc, upiId: input.upiId || undefined, gstin: input.gstin || undefined, pan: input.pan ? `${input.pan.slice(0, 2)}XXXXX${input.pan.slice(-3)}` : undefined };
  await db.update(salons).set({ payoutDetails: details, onboardingStep: sql`greatest(${salons.onboardingStep}, 9)` }).where(eq(salons.id, params.salonId));
  await audit(db, { actorId: user.id, salonId: params.salonId, action: "salon.payout_updated", entity: "salon", entityId: params.salonId, newValue: { ...details } });
  return ok({ saved: true, details });
});
