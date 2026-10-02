import "server-only";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Executor } from "../db";
import { notifications, salons, staff, users } from "../db/schema";
import { channels, publish } from "../realtime/publish";
import { deliverExternal } from "./channels";

export type NotificationCategory = "BOOKING" | "PAYMENT" | "OFFER" | "SYSTEM" | "SALON";

export type NotificationInput = {
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link?: string;
};

/**
 * Store an in-app notification and push a realtime hint to the user. External
 * channels (email / SMS / WhatsApp / web-push) are dispatched through the
 * adapter layer so providers can be plugged in without touching callers.
 */
export async function notify(ex: Executor, userId: string, n: NotificationInput) {
  const [row] = await ex
    .insert(notifications)
    .values({ userId, category: n.category, type: n.type, title: n.title, body: n.body, link: n.link })
    .returning({ id: notifications.id });
  await publish(ex, { ch: channels.user(userId), type: "notification", data: { id: row!.id, title: n.title } });
}

/**
 * Outbox processor (run by the sweeper): notifications are committed with the
 * business change, then delivered to external channels — so a rolled-back
 * transaction never sends an SMS, and a crashed send is retried.
 */
export async function deliverPendingExternal(ex: Executor, limit = 100) {
  const pending = await ex
    .select()
    .from(notifications)
    .where(isNull(notifications.externalDeliveredAt))
    .orderBy(asc(notifications.createdAt))
    .limit(limit);
  for (const n of pending) {
    try {
      await deliverExternal(n.userId, { category: n.category, type: n.type, title: n.title, body: n.body, link: n.link ?? undefined });
    } catch (e) {
      console.error("[notify] external delivery failed", e);
      continue;
    }
    await ex.update(notifications).set({ externalDeliveredAt: new Date() }).where(eq(notifications.id, n.id));
  }
  return pending.length;
}

/** Notify the salon owner and every staff login of a salon. */
export async function notifySalonTeam(ex: Executor, salonId: string, n: NotificationInput, opts: { includeStaff?: boolean } = {}) {
  const salon = await ex.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { ownerId: true } });
  const ids = new Set<string>();
  if (salon) ids.add(salon.ownerId);
  if (opts.includeStaff) {
    const team = await ex
      .select({ userId: staff.userId })
      .from(staff)
      .where(and(eq(staff.salonId, salonId), eq(staff.active, true), isNotNull(staff.userId)));
    team.forEach((t) => t.userId && ids.add(t.userId));
  }
  for (const id of ids) await notify(ex, id, n);
}

export async function notifyAdmins(ex: Executor, n: NotificationInput) {
  const admins = await ex.select({ id: users.id }).from(users).where(eq(users.role, "ADMIN"));
  for (const a of admins) await notify(ex, a.id, n);
}
