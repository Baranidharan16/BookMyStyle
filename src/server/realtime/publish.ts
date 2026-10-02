import "server-only";
import { sql } from "drizzle-orm";
import type { Executor } from "../db";

export const REALTIME_PG_CHANNEL = "bms_events";

export type RealtimeEvent = { ch: string; type: string; data?: Record<string, unknown> };

/**
 * Publish realtime events through Postgres NOTIFY. When called inside a
 * transaction the notification is only delivered if/when it commits — so
 * clients never see an event for a change that was rolled back.
 * Payloads are tiny "something changed" hints; clients refetch through the
 * authorised API, so no private data travels over public channels.
 */
export async function publish(ex: Executor, events: RealtimeEvent | RealtimeEvent[]) {
  const list = Array.isArray(events) ? events : [events];
  for (const e of list) {
    await ex.execute(sql`select pg_notify(${REALTIME_PG_CHANNEL}, ${JSON.stringify(e)})`);
  }
}

export const channels = {
  /** Public: slot availability for a salon changed on `date`. No PII. */
  salonAvailability: (salonId: string) => `salon:${salonId}`,
  /** Private: salon operations (owner + staff of that salon). */
  salonOps: (salonId: string) => `ops:${salonId}`,
  /** Private: a single user's inbox / bookings. */
  user: (userId: string) => `user:${userId}`,
  /** Private: a single booking's live status (customer + salon). */
  booking: (bookingId: string) => `booking:${bookingId}`,
};

/** Standard fan-out for any booking change. */
export function bookingChangedEvents(b: { id: string; salonId: string; customerId: string | null; status: string; date?: string }) {
  const ev: RealtimeEvent[] = [
    { ch: channels.salonAvailability(b.salonId), type: "availability", data: { date: b.date } },
    { ch: channels.salonOps(b.salonId), type: "booking", data: { bookingId: b.id, status: b.status } },
    { ch: channels.booking(b.id), type: "status", data: { status: b.status } },
  ];
  if (b.customerId) ev.push({ ch: channels.user(b.customerId), type: "booking", data: { bookingId: b.id, status: b.status } });
  return ev;
}
