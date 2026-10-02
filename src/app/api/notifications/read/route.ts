import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";

const schema = z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() });

export const POST = route(async (req) => {
  const user = await requireUser();
  const { ids, all } = await parseBody(req, schema);
  const where = all ? and(eq(notifications.userId, user.id), isNull(notifications.readAt)) : and(eq(notifications.userId, user.id), inArray(notifications.id, ids ?? []));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
  return ok({ read: true });
});
