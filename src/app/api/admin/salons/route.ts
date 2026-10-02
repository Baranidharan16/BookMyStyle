import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { salonLocations, salons, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  await requireUser(["ADMIN"]);
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const q = sp.get("q")?.trim();
  const rows = await db
    .select({
      id: salons.id, name: salons.name, slug: salons.slug, citySlug: salons.citySlug, status: salons.status, plan: salons.plan, featured: salons.featured,
      commissionPercent: salons.commissionPercent, ratingAvg: salons.ratingAvg, ratingCount: salons.ratingCount, createdAt: salons.createdAt, verificationNotes: salons.verificationNotes,
      ownerName: users.name, ownerEmail: users.email, area: salonLocations.area, city: salonLocations.city, onboardingStep: salons.onboardingStep,
      bookings30d: sql<number>`(select count(*) from bookings b where b.salon_id = ${salons.id} and b.created_at > now() - interval '30 days' and b.status not in ('FAILED','PAYMENT_PENDING'))::int`,
    })
    .from(salons)
    .innerJoin(users, eq(users.id, salons.ownerId))
    .leftJoin(salonLocations, eq(salonLocations.salonId, salons.id))
    .where(and(status ? eq(salons.status, status as "PENDING") : undefined, q ? ilike(salons.name, `%${q}%`) : undefined))
    .orderBy(desc(salons.createdAt))
    .limit(100);
  return ok(rows);
});
