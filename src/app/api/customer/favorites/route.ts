import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { favorites } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";

const schema = z.object({ salonId: z.string().uuid() });

export const GET = route(async () => {
  const user = await requireUser(["CUSTOMER"]);
  const rows = await db.select({ salonId: favorites.salonId }).from(favorites).where(eq(favorites.userId, user.id));
  return ok(rows.map((r) => r.salonId));
});

export const POST = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  const { salonId } = await parseBody(req, schema);
  await db.insert(favorites).values({ userId: user.id, salonId }).onConflictDoNothing();
  return ok({ favorite: true });
});

export const DELETE = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  const { salonId } = await parseBody(req, schema);
  await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.salonId, salonId)));
  return ok({ favorite: false });
});
