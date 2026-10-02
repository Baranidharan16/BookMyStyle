import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { salonPolicies, salons } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { audit } from "@/server/audit";
import { slugify } from "@/lib/utils";
import { salonProfileSchema } from "@/lib/validation";
import { cookies } from "next/headers";
import { ACTIVE_SALON_COOKIE } from "@/server/auth/access";

/** GET: the owner's salons. POST: start onboarding a new salon (status DRAFT). */
export const GET = route(async () => {
  const user = await requireUser(["OWNER"]);
  return ok(await db.query.salons.findMany({ where: eq(salons.ownerId, user.id), columns: { id: true, name: true, status: true, onboardingStep: true, citySlug: true, slug: true } }));
});

export const POST = route(async (req) => {
  const user = await requireUser(["OWNER"]);
  const input = await parseBody(req, salonProfileSchema.extend({ city: z.string().trim().min(2).max(60) }));
  const base = slugify(input.name) || "salon";
  const citySlug = slugify(input.city);
  let slug = base;
  for (let i = 2; await db.query.salons.findFirst({ where: (s, { and, eq }) => and(eq(s.citySlug, citySlug), eq(s.slug, slug)), columns: { id: true } }); i++) slug = `${base}-${i}`;
  const { city: _c, ...profile } = input;
  const salon = await db.transaction(async (tx) => {
    const [s] = await tx.insert(salons).values({ ...profile, ownerId: user.id, slug, citySlug, status: "DRAFT", onboardingStep: 3 }).returning();
    await tx.insert(salonPolicies).values({ salonId: s!.id });
    await audit(tx, { actorId: user.id, salonId: s!.id, action: "salon.created", entity: "salon", entityId: s!.id, newValue: { name: s!.name } });
    return s!;
  });
  (await cookies()).set(ACTIVE_SALON_COOKIE, salon.id, { path: "/", httpOnly: true, sameSite: "lax" });
  return ok({ id: salon.id }, { status: 201 });
});
