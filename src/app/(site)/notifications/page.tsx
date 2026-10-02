import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { NotificationCenter } from "@/components/notification-center";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requirePageUser(undefined, "/notifications");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <NotificationCenter />
    </div>
  );
}
