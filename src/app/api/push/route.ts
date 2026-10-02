import { z } from "zod";
import { db } from "@/server/db";
import { pushSubscriptions } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";

const schema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

/** Store a Web Push subscription (delivered by the push adapter when VAPID keys are configured). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const sub = await parseBody(req, schema);
  await db.insert(pushSubscriptions).values({ userId: user.id, ...sub }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, keys: sub.keys } });
  return ok({ subscribed: true });
});

export const GET = route(async () => ok({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null }));
