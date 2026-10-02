import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, salons, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const rows = await db
    .select({ id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, createdAt: auditLogs.createdAt, actorName: users.name, actorRole: users.role, salonName: salons.name, newValue: auditLogs.newValue })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(salons, eq(salons.id, auditLogs.salonId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);
  return ok(rows);
});
