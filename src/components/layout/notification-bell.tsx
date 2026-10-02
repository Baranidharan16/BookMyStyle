"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useRealtime } from "@/hooks/use-realtime";

export function NotificationBell({ userId, href = "/notifications" }: { userId: string; href?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ unread: number; items: unknown[] }>("/api/notifications"), staleTime: 60_000 });
  useRealtime([`user:${userId}`], (m) => {
    if (m.type === "notification") {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (m.data?.title) toast(String(m.data.title));
    }
    if (m.type === "booking") qc.invalidateQueries({ queryKey: ["bookings"] });
  });
  const unread = data?.unread ?? 0;
  return (
    <Link href={href} className="relative grid h-10 w-10 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
      <Bell className="h-5 w-5" />
      {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
