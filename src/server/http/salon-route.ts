import "server-only";
import type { NextRequest } from "next/server";
import { requireSalonAccess, type SalonAccess, type StaffPermission } from "../auth/access";
import { requireUser, type SessionUser } from "../auth/session";
import { route } from "./handler";

type SalonCtx<P> = { req: NextRequest; user: SessionUser; access: SalonAccess; params: P };

/**
 * Route wrapper for /api/business/salons/[salonId]/** — authenticates,
 * enforces tenant isolation (owner/staff of *this* salon or admin) and the
 * required staff permission before the handler runs.
 */
export function salonRoute<P extends { salonId: string }>(permission: StaffPermission | "OWNER" | null, fn: (ctx: SalonCtx<P>) => Promise<Response>) {
  return route<P>(async (req, ctx) => {
    const params = await ctx.params;
    const user = await requireUser(["OWNER", "STAFF", "ADMIN"]);
    const access = await requireSalonAccess(user, params.salonId, permission ?? undefined);
    return fn({ req, user, access, params });
  });
}
