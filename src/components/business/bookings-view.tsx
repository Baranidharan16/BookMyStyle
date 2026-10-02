"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, Search, UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/utils";
import { addDaysKey, formatDateKey, formatTime, toDateKey } from "@/lib/time";
import { useDebounce } from "@/hooks/use-debounce";
import { useSalonLive } from "@/hooks/use-salon-live";
import { useBiz } from "./business-context";
import { BookingDialog } from "./booking-dialog";
import { BookingActions } from "./booking-actions";
import { BookingStatusBadge, PaymentStatusBadge } from "../booking/status";
import { Badge } from "../ui/badge";
import { Button, ButtonLink } from "../ui/button";
import { Card, PageHeader } from "../ui/card";
import { Input, Select, Segmented } from "../ui/form";
import { EmptyState, LiveDot, Skeleton } from "../ui/states";

type Row = { id: string; code: string; status: string; startsAt: string; endsAt: string; total: number; paymentStatus: string; source: string; customerName: string; customerPhone: string | null; serviceName: string; staffNames: string | null; resourceNames: string | null; lateMinutes: number | null; overrideConflict: boolean };

export function BookingsView() {
  const biz = useBiz();
  const sp = useSearchParams();
  const { connected } = useSalonLive();
  const today = toDateKey(new Date(), biz.timezone);
  const [mode, setMode] = useState<"day" | "all">("day");
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(sp.get("focus"));
  const dq = useDebounce(q, 300);
  useEffect(() => setPage(1), [mode, date, status, source, dq]);
  const { data, isLoading } = useQuery({
    queryKey: ["biz", "bookings", biz.salonId, mode, date, status, source, dq, page],
    queryFn: () => api.get<{ items: Row[]; total: number; pageSize: number }>(biz.api(`/bookings${qs({ date: mode === "day" ? date : undefined, status, source, q: dq, page })}`)),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Bookings" description={<span className="inline-flex items-center gap-2">Online bookings and walk-ins in one place {connected && <LiveDot />}</span>} actions={biz.can("WALK_IN") ? <ButtonLink href={`${biz.basePath}/walk-in`}><UserPlus className="h-4 w-4" /> Add walk-in</ButtonLink> : undefined} />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "day", label: "By day" }, { value: "all", label: "All" }]} />
        {mode === "day" && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="iconSm" onClick={() => setDate(addDaysKey(date, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-auto" aria-label="Date" />
            <Button variant="ghost" size="iconSm" onClick={() => setDate(addDaysKey(date, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
            {date !== today && <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Today</Button>}
          </div>
        )}
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto" aria-label="Status filter">
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CHECKED_IN,WAITING">Checked in / waiting</option>
          <option value="IN_SERVICE">In service</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="NO_SHOW">No-show</option>
          <option value="PAYMENT_PENDING">Payment pending</option>
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="h-9 w-auto" aria-label="Source filter">
          <option value="">Online + offline</option><option value="ONLINE">Online</option><option value="WALK_IN">Walk-in</option><option value="OWNER">Desk booking</option>
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or booking ID" className="h-9 pl-9" aria-label="Search bookings" />
        </div>
      </Card>

      {isLoading ? <Skeleton className="h-80" /> : !data?.items.length ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={mode === "day" ? `No bookings on ${formatDateKey(date)}` : "No bookings found"} description="Try another date or clear the filters." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs font-bold uppercase tracking-wider text-muted">
                <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Staff · Seat</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-2/50">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <button onClick={() => setOpen(b.id)} className="text-left font-semibold hover:text-brand">{formatTime(b.startsAt, biz.timezone)}</button>
                      {mode === "all" && <p className="text-xs text-muted">{formatDateKey(toDateKey(new Date(b.startsAt), biz.timezone))}</p>}
                    </td>
                    <td className="px-4 py-3"><button onClick={() => setOpen(b.id)} className="text-left"><p className="font-semibold hover:text-brand">{b.customerName}</p><p className="text-xs text-muted">{b.code}{b.customerPhone ? ` · ${b.customerPhone}` : ""}</p></button></td>
                    <td className="px-4 py-3"><p>{b.serviceName}</p>{b.source !== "ONLINE" && <Badge className="mt-0.5">{b.source === "WALK_IN" ? "Walk-in" : "Desk"}</Badge>}</td>
                    <td className="px-4 py-3 text-ink-2">{b.staffNames ?? "—"}<p className="text-xs text-muted">{b.resourceNames}</p></td>
                    <td className="px-4 py-3"><div className="flex flex-col items-start gap-1"><BookingStatusBadge status={b.status} />{b.lateMinutes ? <Badge tone="warning">{b.lateMinutes}m late</Badge> : null}</div></td>
                    <td className="px-4 py-3 text-right"><p className="font-semibold">{formatINR(b.total)}</p><PaymentStatusBadge status={b.paymentStatus} /></td>
                    <td className="px-4 py-3"><BookingActions b={b} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {data.items.map((b) => (
              <Card key={b.id} className="p-3.5">
                <button onClick={() => setOpen(b.id)} className="flex w-full items-start justify-between gap-2 text-left">
                  <div className="min-w-0">
                    <p className="font-bold">{formatTime(b.startsAt, biz.timezone)} · {b.customerName}</p>
                    <p className="truncate text-sm text-ink-2">{b.serviceName}</p>
                    <p className="truncate text-xs text-muted">{[b.staffNames, b.resourceNames].filter(Boolean).join(" · ")}</p>
                  </div>
                  <BookingStatusBadge status={b.status} />
                </button>
                <div className="mt-2"><BookingActions b={b} /></div>
              </Card>
            ))}
          </div>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted">Page {page} of {pages} · {data.total} bookings</span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
      <BookingDialog bookingId={open} onClose={() => setOpen(null)} />
    </>
  );
}
