import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, users } from "@/server/db/schema";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";

export const GET = salonRoute("OWNER", async ({ params }) => {
  const rows = await db
    .select({ id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, oldValue: auditLogs.oldValue, newValue: auditLogs.newValue, createdAt: auditLogs.createdAt, actorName: users.name, actorRole: users.role })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(eq(auditLogs.salonId, params.salonId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(150);
  return ok(rows);
});
