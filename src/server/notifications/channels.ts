import "server-only";
import type { NotificationInput } from "./index";

/**
 * Channel adapter registry. Each adapter is enabled only when its provider
 * credentials are configured; otherwise it is a no-op (logged in dev). Plug in
 * real providers (SES/SMTP, MSG91/Twilio, WhatsApp Cloud API, web-push) here.
 */
type Adapter = { name: string; enabled: () => boolean; send: (userId: string, n: NotificationInput) => Promise<void> };

const adapters: Adapter[] = [
  { name: "email", enabled: () => !!process.env.SMTP_URL, send: async () => {} },
  { name: "sms", enabled: () => !!process.env.SMS_PROVIDER_API_KEY, send: async () => {} },
  { name: "whatsapp", enabled: () => !!process.env.WHATSAPP_PROVIDER_API_KEY, send: async () => {} },
  { name: "push", enabled: () => !!process.env.VAPID_PRIVATE_KEY, send: async () => {} },
];

export async function deliverExternal(userId: string, n: NotificationInput) {
  const active = adapters.filter((a) => a.enabled());
  if (!active.length) {
    if (process.env.NODE_ENV === "development" && process.env.LOG_NOTIFICATIONS === "true") {
      console.log(`[notify:dev] → ${userId}: ${n.title} — ${n.body}`);
    }
    return;
  }
  await Promise.allSettled(active.map((a) => a.send(userId, n)));
}
