import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { getSalonAccess } from "@/server/auth/access";
import { hub } from "@/server/realtime/hub";
import type { RealtimeEvent } from "@/server/realtime/publish";

export const dynamic = "force-dynamic";

/** Authorise a channel for the current viewer. Public channels carry no PII. */
async function canSubscribe(ch: string, user: Awaited<ReturnType<typeof getSessionUser>>) {
  const [kind, id] = ch.split(":");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  if (kind === "salon") return true;
  if (!user) return false;
  if (kind === "user") return id === user.id;
  if (kind === "ops") return !!(await getSalonAccess(user, id));
  if (kind === "booking") {
    const b = await db.query.bookings.findFirst({ where: eq(bookings.id, id), columns: { customerId: true, salonId: true } });
    if (!b) return false;
    return b.customerId === user.id || !!(await getSalonAccess(user, b.salonId));
  }
  return false;
}

/**
 * GET /api/realtime?ch=salon:<id>,booking:<id> — Server-Sent Events stream.
 * Backed by Postgres LISTEN/NOTIFY; clients refetch through the normal
 * authorised APIs when they receive a hint. Heartbeats keep proxies open.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const requested = (req.nextUrl.searchParams.get("ch") ?? "").split(",").filter(Boolean).slice(0, 10);
  const allowed: string[] = [];
  for (const ch of requested) if (await canSubscribe(ch, user)) allowed.push(ch);
  if (!allowed.length) return new Response("No channels", { status: 403 });

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup?.();
        }
      };
      const onEvent = (e: RealtimeEvent) => send(`event: message\ndata: ${JSON.stringify(e)}\n\n`);
      const unsubs = await Promise.all(allowed.map((ch) => hub.subscribe(ch, onEvent)));
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);
      send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ channels: allowed })}\n\n`);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubs.forEach((u) => u());
        cleanup = null;
      };
      req.signal.addEventListener("abort", () => {
        cleanup?.();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
