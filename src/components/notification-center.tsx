"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarCheck, CheckCheck, CreditCard, Megaphone, Store, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/time";
import { Button } from "./ui/button";
import { Segmented } from "./ui/form";
import { EmptyState, Skeleton } from "./ui/states";
import { PageHeader } from "./ui/card";

type N = { id: string; category: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };
const ICON: Record<string, typeof Bell> = { BOOKING: CalendarCheck, PAYMENT: CreditCard, OFFER: Tag, SYSTEM: Megaphone, SALON: Store };

export function NotificationCenter() {
  const qc = useQueryClient();
  const [cat, setCat] = useState("ALL");
  const { data, isLoading } = useQuery({ queryKey: ["notifications", cat], queryFn: () => api.get<{ items: N[]; unread: number }>(`/api/notifications${cat !== "ALL" ? `?category=${cat}` : ""}`) });
  const read = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api.post("/api/notifications/read", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <>
      <PageHeader title="Notifications" description={data ? `${data.unread} unread` : undefined} actions={<Button variant="secondary" size="sm" onClick={() => read.mutate({ all: true })} disabled={!data?.unread}><CheckCheck className="h-4 w-4" /> Mark all read</Button>} />
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <Segmented size="sm" value={cat} onChange={setCat} options={[{ value: "ALL", label: "All" }, { value: "BOOKING", label: "Bookings" }, { value: "PAYMENT", label: "Payments" }, { value: "OFFER", label: "Offers" }, { value: "SALON", label: "Salon updates" }, { value: "SYSTEM", label: "System" }]} />
      </div>
      <div className="mt-4 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)
        ) : !data?.items.length ? (
          <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" description="Booking updates, payment receipts and offers will show up here." />
        ) : (
          data.items.map((n) => {
            const Icon = ICON[n.category] ?? Bell;
            const content = (
              <div className={cn("flex gap-3 rounded-2xl border p-4 transition", n.readAt ? "border-line bg-surface" : "border-brand/20 bg-brand-soft/40")}>
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", n.readAt ? "bg-surface-2 text-muted" : "bg-brand text-white")}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold">{n.title}</p>
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt)} · {formatTime(n.createdAt)}</p>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} onClick={() => !n.readAt && read.mutate({ ids: [n.id] })} className="block">{content}</Link>
            ) : (
              <button key={n.id} onClick={() => !n.readAt && read.mutate({ ids: [n.id] })} className="block w-full text-left">{content}</button>
            );
          })
        )}
      </div>
    </>
  );
}
