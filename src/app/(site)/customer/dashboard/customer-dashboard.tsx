"use client";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarX, Heart, History, Search, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/utils";
import { toDateKey } from "@/lib/time";
import { BookingCard, type BookingCardData } from "@/components/booking/booking-card";
import { ButtonLink } from "@/components/ui/button";
import { Segmented } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { Stat } from "@/components/ui/card";

export function CustomerDashboard({ name, initial }: { name: string; userId: string; initial: BookingCardData[] }) {
  const { data = initial } = useQuery({ queryKey: ["bookings", "all"], queryFn: () => api.get<BookingCardData[]>("/api/customer/bookings?tab=all"), initialData: initial });
  const [tab, setTab] = useState<"upcoming" | "history" | "cancelled">("upcoming");
  const now = Date.now();
  const today = toDateKey(new Date());
  const active = ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE", "PAYMENT_PENDING"];
  const upcoming = data.filter((b) => active.includes(b.status) && new Date(b.endsAt).getTime() > now - 3 * 3_600_000).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const todays = upcoming.filter((b) => toDateKey(new Date(b.startsAt), b.timezone) === today);
  const history = data.filter((b) => ["COMPLETED", "NO_SHOW"].includes(b.status));
  const cancelled = data.filter((b) => ["CANCELLED", "FAILED"].includes(b.status));
  const spent = history.filter((b) => b.status === "COMPLETED").reduce((s, b) => s + b.total, 0);
  const list = tab === "upcoming" ? upcoming : tab === "history" ? history : cancelled;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted">Hello,</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{name.split(" ")[0]} 👋</h1>
        </div>
        <ButtonLink href="/search"><Search className="h-4 w-4" /> Book something new</ButtonLink>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Upcoming" value={upcoming.length} icon={<CalendarCheck className="h-4 w-4" />} tone="brand" />
        <Stat label="Visits" value={history.filter((b) => b.status === "COMPLETED").length} icon={<History className="h-4 w-4" />} tone="success" />
        <Stat label="Spent" value={formatINR(spent)} icon={<Wallet className="h-4 w-4" />} tone="info" />
        <Link href="/customer/favorites" className="contents"><Stat label="Favourites" value={<span className="text-base">View saved →</span>} icon={<Heart className="h-4 w-4" />} tone="danger" /></Link>
      </div>

      {todays.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-accent" /> Today</h2>
          <div className="space-y-3">{todays.map((b) => <BookingCard key={b.id} b={b} />)}</div>
        </section>
      )}

      <section className="mt-8">
        <Segmented value={tab} onChange={setTab} options={[{ value: "upcoming", label: `Upcoming (${upcoming.length})` }, { value: "history", label: `History (${history.length})` }, { value: "cancelled", label: `Cancelled (${cancelled.length})` }]} />
        <div className="mt-4 space-y-3">
          {list.length ? (
            list.map((b) => <BookingCard key={b.id} b={b} />)
          ) : (
            <EmptyState
              icon={tab === "cancelled" ? <CalendarX className="h-6 w-6" /> : <CalendarCheck className="h-6 w-6" />}
              title={tab === "upcoming" ? "No upcoming bookings" : tab === "history" ? "No past visits yet" : "No cancelled bookings"}
              description={tab === "upcoming" ? "Find a salon nearby and grab a slot in seconds." : undefined}
              action={tab === "upcoming" ? <ButtonLink href="/search">Find a salon</ButtonLink> : undefined}
            />
          )}
        </div>
      </section>
    </div>
  );
}
