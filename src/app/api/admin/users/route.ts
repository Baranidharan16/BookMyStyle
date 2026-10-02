import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  await requireUser(["ADMIN"]);
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const role = sp.get("role");
  const status = sp.get("status");
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, total: sql<number>`count(*) over()` })
    .from(users)
    .where(and(q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.phone, `%${q}%`)) : undefined, role ? eq(users.role, role as "CUSTOMER") : undefined, status ? eq(users.status, status as "ACTIVE") : undefined))
    .orderBy(desc(users.createdAt))
    .limit(30)
    .offset((page - 1) * 30);
  return ok({ items: rows, total: Number(rows[0]?.total ?? 0) });
});
