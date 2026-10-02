import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, homeFor } from "@/server/auth/session";
import { clientIp, ok, parseBody, route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { rateLimit } from "@/server/http/rate-limit";
import { loginSchema } from "@/lib/validation";

// Constant-ish work for unknown emails to avoid account enumeration by timing.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password-0"));

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await rateLimit(`login:${ip}`, 20, 900);
  const { email, password } = await parseBody(req, loginSchema);
  await rateLimit(`login:${email}`, 10, 900);
  const user = await db.query.users.findFirst({ where: eq(sql`lower(${users.email})`, email) });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) throw new AppError("INVALID_CREDENTIALS", "That email and password combination doesn't match our records.", 401);
  if (user.status === "BLOCKED") throw new AppError("ACCOUNT_BLOCKED", "This account has been suspended. Please contact support.", 403);
  if (user.status === "DELETED") throw new AppError("INVALID_CREDENTIALS", "That email and password combination doesn't match our records.", 401);
  await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
  const next = req.nextUrl.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  return ok({ redirect: safeNext ?? homeFor(user.role), role: user.role });
});
