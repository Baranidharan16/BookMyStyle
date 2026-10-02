import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "../db";
import { salons, staff } from "../db/schema";
import { Errors } from "../http/errors";
import type { SessionUser } from "./session";

export type StaffPermission = "CHECK_IN" | "WALK_IN" | "MANAGE_BOOKINGS" | "VIEW_CUSTOMERS";
export const ALL_STAFF_PERMISSIONS: StaffPermission[] = ["CHECK_IN", "WALK_IN", "MANAGE_BOOKINGS", "VIEW_CUSTOMERS"];

export type SalonAccess = {
  salonId: string;
  level: "ADMIN" | "OWNER" | "STAFF";
  staffId: string | null;
  permissions: Set<StaffPermission | "OWNER">;
};

/**
 * Tenant isolation: every salon-scoped operation goes through here. Owners
 * only reach salons they own, staff only the salon they belong to (and only
 * the permissions granted to them), admins everything.
 */
export async function getSalonAccess(user: SessionUser, salonId: string): Promise<SalonAccess | null> {
  if (user.role === "ADMIN") {
    return { salonId, level: "ADMIN", staffId: null, permissions: new Set([...ALL_STAFF_PERMISSIONS, "OWNER"]) };
  }
  if (user.role === "OWNER") {
    const s = await db.query.salons.findFirst({ where: and(eq(salons.id, salonId), eq(salons.ownerId, user.id)), columns: { id: true } });
    return s ? { salonId, level: "OWNER", staffId: null, permissions: new Set([...ALL_STAFF_PERMISSIONS, "OWNER"]) } : null;
  }
  if (user.role === "STAFF") {
    const s = await db.query.staff.findFirst({
      where: and(eq(staff.userId, user.id), eq(staff.salonId, salonId), eq(staff.active, true)),
      columns: { id: true, permissions: true },
    });
    return s ? { salonId, level: "STAFF", staffId: s.id, permissions: new Set(s.permissions as StaffPermission[]) } : null;
  }
  return null;
}

export async function requireSalonAccess(user: SessionUser, salonId: string, permission?: StaffPermission | "OWNER") {
  const access = await getSalonAccess(user, salonId);
  // Same response for "not yours" and "doesn't exist" — no tenant enumeration.
  if (!access) throw Errors.notFound("Salon");
  if (permission && !access.permissions.has(permission)) throw Errors.forbidden("Your role doesn't allow this action.");
  return access;
}

export const ACTIVE_SALON_COOKIE = "bms_active_salon";

/** The salon an owner/staff is currently working in (owners may own several). */
export async function getActiveSalonId(user: SessionUser): Promise<string | null> {
  if (user.role === "STAFF") {
    const s = await db.query.staff.findFirst({ where: and(eq(staff.userId, user.id), eq(staff.active, true)), columns: { salonId: true } });
    return s?.salonId ?? null;
  }
  if (user.role === "OWNER") {
    const jar = await cookies();
    const preferred = jar.get(ACTIVE_SALON_COOKIE)?.value;
    const owned = await db.query.salons.findMany({
      where: eq(salons.ownerId, user.id),
      columns: { id: true },
      orderBy: asc(salons.createdAt),
    });
    if (preferred && owned.some((s) => s.id === preferred)) return preferred;
    return owned[0]?.id ?? null;
  }
  return null;
}
