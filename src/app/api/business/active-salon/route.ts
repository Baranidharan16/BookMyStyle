import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { ACTIVE_SALON_COOKIE, requireSalonAccess } from "@/server/auth/access";
import { ok, parseBody, route } from "@/server/http/handler";

export const POST = route(async (req) => {
  const user = await requireUser(["OWNER"]);
  const { salonId } = await parseBody(req, z.object({ salonId: z.string().uuid() }));
  await requireSalonAccess(user, salonId, "OWNER");
  (await cookies()).set(ACTIVE_SALON_COOKIE, salonId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return ok({ salonId });
});
