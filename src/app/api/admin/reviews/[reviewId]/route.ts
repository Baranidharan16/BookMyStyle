import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { reviews } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { audit } from "@/server/audit";

/** Moderate: publish or hide. Ratings are recomputed from published reviews only. */
export const PATCH = route<{ reviewId: string }>(async (req, { params }) => {
  const admin = await requireUser(["ADMIN"]);
  const { reviewId } = await params;
  const input = await parseBody(req, z.object({ status: z.enum(["PUBLISHED", "HIDDEN"]), moderationNote: z.string().max(300).optional() }));
  const [r] = await db.update(reviews).set(input).where(eq(reviews.id, reviewId)).returning();
  if (!r) throw Errors.notFound("Review");
  await db.execute(sql`update salons s set rating_avg = coalesce(round(x.a::numeric, 1), 0), rating_count = x.n from (select avg(rating) a, count(*) n from reviews where salon_id = ${r.salonId} and status = 'PUBLISHED') x where s.id = ${r.salonId}`);
  await audit(db, { actorId: admin.id, salonId: r.salonId, action: `admin.review_${input.status.toLowerCase()}`, entity: "review", entityId: r.id, newValue: input });
  return ok({ saved: true });
});
