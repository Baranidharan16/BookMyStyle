import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { reviews } from "@/server/db/schema";
import { ok, parseBody } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { notify } from "@/server/notifications";

/** Owner reply, or flag an inappropriate review for admin moderation. */
export const POST = salonRoute<{ salonId: string; reviewId: string }>("OWNER", async ({ req, params }) => {
  const input = await parseBody(req, z.object({ reply: z.string().trim().min(2).max(1000).optional(), flag: z.boolean().optional() }));
  const r = await db.query.reviews.findFirst({ where: and(eq(reviews.id, params.reviewId), eq(reviews.salonId, params.salonId)) });
  if (!r) throw Errors.notFound("Review");
  if (input.flag) {
    await db.update(reviews).set({ status: "FLAGGED" }).where(eq(reviews.id, r.id));
    return ok({ flagged: true });
  }
  await db.update(reviews).set({ ownerReply: input.reply, repliedAt: new Date() }).where(eq(reviews.id, r.id));
  await notify(db, r.customerId, { category: "SALON", type: "review.reply", title: "The salon replied to your review", body: input.reply!.slice(0, 140) });
  return ok({ replied: true });
});
