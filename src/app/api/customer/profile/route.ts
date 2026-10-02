import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, customerProfiles, users } from "@/server/db/schema";
import { destroyAllSessions, destroySession, requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { audit } from "@/server/audit";
import { profileSchema } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireUser();
  const u = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { passwordHash: false } });
  const profile = await db.query.customerProfiles.findFirst({ where: eq(customerProfiles.userId, user.id) });
  return ok({ user: u, profile });
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, profileSchema);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: input.name, phone: input.phone, dateOfBirth: input.dateOfBirth || null, avatarUrl: input.avatarUrl ?? undefined }).where(eq(users.id, user.id));
    if (user.role === "CUSTOMER") {
      await tx
        .insert(customerProfiles)
        .values({ userId: user.id, savedLocations: input.savedLocations ?? [], preferences: input.preferences ?? {} })
        .onConflictDoUpdate({ target: customerProfiles.userId, set: { ...(input.savedLocations ? { savedLocations: input.savedLocations } : {}), ...(input.preferences ? { preferences: input.preferences } : {}) } });
    }
  });
  return ok({ saved: true });
});

/** Account deletion: anonymises PII, keeps financial records (legal retention). */
export const DELETE = route(async () => {
  const user = await requireUser(["CUSTOMER"]);
  const active = await db.query.bookings.findFirst({ where: and(eq(bookings.customerId, user.id), inArray(bookings.status, ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE"])), columns: { id: true } });
  if (active) throw Errors.conflict("HAS_ACTIVE_BOOKINGS", "Please cancel or complete your upcoming bookings before deleting your account.");
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ status: "DELETED", deletedAt: new Date(), name: "Deleted user", email: `deleted-${user.id}@deleted.invalid`, phone: null, avatarUrl: null, dateOfBirth: null, passwordHash: randomBytes(32).toString("hex") })
      .where(eq(users.id, user.id));
    await tx.update(bookings).set({ customerName: "Deleted user", customerPhone: null }).where(eq(bookings.customerId, user.id));
    await tx.delete(customerProfiles).where(eq(customerProfiles.userId, user.id));
    await audit(tx, { actorId: user.id, action: "user.deleted", entity: "user", entityId: user.id });
  });
  await destroyAllSessions(user.id);
  await destroySession();
  return ok({ deleted: true });
});
