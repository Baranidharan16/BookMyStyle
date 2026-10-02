import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { autoMarkNoShows, expireHolds } from "./booking/engine";
import { deliverPendingExternal, notify } from "./notifications";
import { purgeExpiredSessions } from "./auth/session";
import { formatTime } from "@/lib/time";

/**
 * Periodic maintenance. Every step claims work with atomic
 * UPDATE … RETURNING, so running several instances concurrently is safe.
 */
export async function sendReminders() {
  const claimed = await db.execute<{ id: string; customer_id: string; starts_at: Date; salon_name: string; tz: string; service_name: string }>(sql`
    update bookings b set reminder_sent_at = now()
    from salons s, services sv
    where s.id = b.salon_id and sv.id = b.service_id
      and b.status = 'CONFIRMED' and b.customer_id is not null and b.reminder_sent_at is null
      and b.starts_at > now() and b.starts_at <= now() + interval '60 minutes'
    returning b.id, b.customer_id, b.starts_at, s.name as salon_name, s.timezone as tz, sv.name as service_name`);
  for (const r of claimed.rows) {
    await notify(db, r.customer_id, {
      category: "BOOKING",
      type: "booking.reminder",
      title: "Upcoming appointment",
      body: `${r.service_name} at ${r.salon_name} at ${formatTime(r.starts_at, r.tz)}. Show your QR ticket at the desk to check in.`,
      link: `/customer/bookings/${r.id}`,
    });
  }
  return claimed.rows.length;
}

export async function sendReviewRequests() {
  const claimed = await db.execute<{ id: string; customer_id: string; salon_name: string }>(sql`
    update bookings b set review_requested_at = now()
    from salons s
    where s.id = b.salon_id and b.status = 'COMPLETED' and b.customer_id is not null and b.review_requested_at is null
      and b.completed_at < now() - interval '30 minutes' and b.completed_at > now() - interval '3 days'
      and not exists (select 1 from reviews r where r.booking_id = b.id)
    returning b.id, b.customer_id, s.name as salon_name`);
  for (const r of claimed.rows) {
    await notify(db, r.customer_id, { category: "BOOKING", type: "review.request", title: `How was ${r.salon_name}?`, body: "Rate your visit — it takes 10 seconds and helps others choose.", link: `/customer/bookings/${r.id}#review` });
  }
  return claimed.rows.length;
}

export async function runSweep() {
  const out: Record<string, number> = {};
  const steps: [string, () => Promise<number | void>][] = [
    ["expiredHolds", () => expireHolds(db)],
    ["noShows", autoMarkNoShows],
    ["reminders", sendReminders],
    ["reviewRequests", sendReviewRequests],
    ["externalNotifications", () => deliverPendingExternal(db)],
    ["sessions", async () => void (await purgeExpiredSessions())],
  ];
  for (const [name, fn] of steps) {
    try {
      out[name] = (await fn()) ?? 0;
    } catch (e) {
      console.error(`[sweep] ${name} failed`, e);
    }
  }
  return out;
}
