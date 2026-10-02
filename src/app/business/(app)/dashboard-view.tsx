"use client";
import { useQuery } from "@tanstack/react-query";
import { Armchair, Ban, CalendarCheck, ChevronRight, Footprints, Globe, Hourglass, IndianRupee, UserPlus, UserX, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/utils";
import { formatDateKey, formatTime, minutesOfDay } from "@/lib/time";

const greeting = (m: number) => (m < 720 ? "morning" : m < 1020 ? "afternoon" : "evening");
import { useBiz } from "@/components/business/business-context";
import { useSalonLive } from "@/hooks/use-salon-live";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, LiveDot, Skeleton } from "@/components/ui/states";
import { BookingStatusBadge } from "@/components/booking/status";
import { BookingDialog } from "@/components/business/booking-dialog";
import { Badge } from "@/components/ui/badge";

type Overview = { date: string; bookings: number; online: number; walkins: number; cancelled: number; noShows: number; pendingPayments: number; pendingAmount: number; revenue: number; waiting: number; inService: number; resourcesTotal: number; resourcesOccupied: number };
type Row = { id: string; code: string; status: string; startsAt: string; endsAt: string; customerName: string; serviceName: string; staffNames: string | null; resourceNames: string | null; source: string; total: number; paymentStatus: string };

export function BusinessDashboard() {
  const biz = useBiz();
  const { connected } = useSalonLive();
  const [open, setOpen] = useState<string | null>(null);
  const { data: o } = useQuery({ queryKey: ["biz", "overview", biz.salonId], queryFn: () => api.get<Overview>(biz.api("/overview")) });
  const { data: today } = useQuery({ queryKey: ["biz", "today", biz.salonId], queryFn: () => api.get<{ items: Row[] }>(biz.api(`/bookings?date=${o!.date}&status=CONFIRMED,CHECKED_IN,WAITING,IN_SERVICE,COMPLETED&page=1`)), enabled: !!o });
  const { data: a } = useQuery({ queryKey: ["biz", "analytics", biz.salonId, 14], queryFn: () => api.get<{ daily: { day: string; revenue: number; bookings: number }[]; popularServices: { name: string; bookings: number }[] }>(biz.api("/analytics?days=14")) });
  const now = Date.now();
  const upcoming = today?.items.filter((b) => new Date(b.endsAt).getTime() > now && b.status !== "COMPLETED") ?? [];

  return (
    <>
      <PageHeader eyebrow={o ? formatDateKey(o.date, { weekday: "long", month: "long" }) : "Today"} title={`Good ${greeting(minutesOfDay(new Date(), biz.timezone))}`} description={<span className="inline-flex items-center gap-2">{biz.salonName} {connected && <LiveDot />}</span>} actions={<><ButtonLink href="/business/walk-in"><UserPlus className="h-4 w-4" /> Add walk-in</ButtonLink><ButtonLink href="/business/board" variant="secondary">Open live board</ButtonLink></>} />
      {!o ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
          <Stat label="Today's bookings" value={o.bookings} icon={<CalendarCheck className="h-4 w-4" />} tone="brand" hint={`${o.online} online · ${o.walkins} walk-in`} />
          <Stat label="Today's revenue" value={formatINR(o.revenue)} icon={<IndianRupee className="h-4 w-4" />} tone="success" hint="Collected, excl. GST" />
          <Stat label="Online bookings" value={o.online} icon={<Globe className="h-4 w-4" />} tone="info" />
          <Stat label="Walk-ins" value={o.walkins} icon={<Footprints className="h-4 w-4" />} />
          <Stat label="Seats occupied" value={`${o.resourcesOccupied}/${o.resourcesTotal}`} icon={<Armchair className="h-4 w-4" />} tone="warning" hint={`${o.resourcesTotal - o.resourcesOccupied} available now`} />
          <Stat label="Waiting / in service" value={`${o.waiting} / ${o.inService}`} icon={<Hourglass className="h-4 w-4" />} />
          <Stat label="Pending payments" value={o.pendingPayments} icon={<Wallet className="h-4 w-4" />} tone="warning" hint={o.pendingAmount ? `${formatINR(o.pendingAmount)} to collect` : undefined} />
          <Stat label="Cancelled" value={o.cancelled} icon={<Ban className="h-4 w-4" />} tone="danger" />
          <Stat label="No-shows" value={o.noShows} icon={<UserX className="h-4 w-4" />} tone="danger" />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Up next today" description="Live — updates as bookings, walk-ins and check-ins happen" action={<Link href="/business/bookings" className="inline-flex items-center text-sm font-semibold text-brand">All <ChevronRight className="h-4 w-4" /></Link>} />
          <CardBody className="pt-3">
            {!today ? <Skeleton className="h-40" /> : upcoming.length === 0 ? (
              <EmptyState className="py-8" title="Nothing else scheduled today" description="New online bookings and walk-ins will appear here instantly." />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.slice(0, 10).map((b) => (
                  <li key={b.id}>
                    <button onClick={() => setOpen(b.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-2/50">
                      <span className="w-16 shrink-0 text-sm font-bold tabular-nums">{formatTime(b.startsAt, biz.timezone)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{b.customerName} <span className="font-normal text-muted">· {b.serviceName}</span></span>
                        <span className="block truncate text-xs text-muted">{[b.staffNames, b.resourceNames].filter(Boolean).join(" · ")}</span>
                      </span>
                      {b.source !== "ONLINE" && <Badge>Walk-in</Badge>}
                      <BookingStatusBadge status={b.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Revenue — last 14 days" />
            <CardBody className="h-56 pt-2">
              {a ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={a.daily.map((d) => ({ ...d, rupees: d.revenue / 100, label: d.day.slice(5) }))} margin={{ left: -10, right: 5 }}>
                    <defs><linearGradient id="rv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--brand)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--brand)" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                    <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }} formatter={(v) => [formatINR(Number(v) * 100), "Revenue"]} />
                    <Area type="monotone" dataKey="rupees" stroke="var(--brand)" strokeWidth={2} fill="url(#rv)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Skeleton className="h-full" />}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Popular services (14 days)" action={<Link href="/business/analytics" className="text-sm font-semibold text-brand">Analytics</Link>} />
            <CardBody className="space-y-2.5 pt-3">
              {a?.popularServices.slice(0, 5).map((s) => {
                const max = a.popularServices[0]!.bookings;
                return (
                  <div key={s.name}>
                    <div className="flex justify-between text-sm"><span className="font-semibold">{s.name}</span><span className="text-muted">{s.bookings}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-brand" style={{ width: `${(s.bookings / max) * 100}%` }} /></div>
                  </div>
                );
              }) ?? <Skeleton className="h-32" />}
            </CardBody>
          </Card>
        </div>
      </div>
      <BookingDialog bookingId={open} onClose={() => setOpen(null)} />
    </>
  );
}
