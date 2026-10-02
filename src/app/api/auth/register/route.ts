import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { customerProfiles, users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { createSession, homeFor } from "@/server/auth/session";
import { clientIp, ok, parseBody, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { rateLimit } from "@/server/http/rate-limit";
import { registerSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

export const POST = route(async (req) => {
  await rateLimit(`register:${clientIp(req)}`, 10, 3600);
  const input = await parseBody(req, registerSchema);
  const exists = await db.query.users.findFirst({ where: eq(sql`lower(${users.email})`, input.email), columns: { id: true } });
  if (exists) throw Errors.conflict("EMAIL_TAKEN", "An account with this email already exists. Try signing in instead.");
  const user = await db.transaction(async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({ name: input.name, email: input.email, phone: input.phone, role: input.role, passwordHash: await hashPassword(input.password) })
      .returning({ id: users.id, role: users.role });
    if (input.role === "CUSTOMER") await tx.insert(customerProfiles).values({ userId: u!.id });
    await audit(tx, { actorId: u!.id, action: "user.registered", entity: "user", entityId: u!.id, newValue: { role: input.role }, ip: clientIp(req) });
    return u!;
  });
  await createSession(user.id, { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined });
  return ok({ redirect: input.role === "OWNER" ? "/business/onboarding" : homeFor(user.role) }, { status: 201 });
});
