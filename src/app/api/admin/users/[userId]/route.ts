import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { destroyAllSessions, requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { audit } from "@/server/audit";

/** Block / unblock accounts. Blocking revokes all sessions immediately. */
export const PATCH = route<{ userId: string }>(async (req, { params }) => {
  const admin = await requireUser(["ADMIN"]);
  const { userId } = await params;
  const { status } = await parseBody(req, z.object({ status: z.enum(["ACTIVE", "BLOCKED"]) }));
  if (userId === admin.id) throw Errors.validation("You can't block your own account.");
  const res = await db.update(users).set({ status }).where(eq(users.id, userId)).returning({ id: users.id, role: users.role });
  if (!res.length) throw Errors.notFound("User");
  if (status === "BLOCKED") await destroyAllSessions(userId);
  await audit(db, { actorId: admin.id, action: status === "BLOCKED" ? "admin.user_blocked" : "admin.user_unblocked", entity: "user", entityId: userId });
  return ok({ status });
});
