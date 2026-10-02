import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { serviceCategories } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { slugify } from "@/lib/utils";

export const GET = route(async () => ok(await db.select().from(serviceCategories).orderBy(asc(serviceCategories.sort))));

export const POST = route(async (req) => {
  await requireUser(["ADMIN"]);
  const { name, icon } = await parseBody(req, z.object({ name: z.string().trim().min(2).max(40), icon: z.string().max(30).default("scissors") }));
  const [max] = await db.select({ m: sql<number>`coalesce(max(sort),0)::int` }).from(serviceCategories);
  const [c] = await db.insert(serviceCategories).values({ name, icon, slug: slugify(name), sort: (max?.m ?? 0) + 1 }).returning();
  return ok(c, { status: 201 });
});
