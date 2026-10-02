"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/time";
import { useDebounce } from "@/hooks/use-debounce";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/booking/status";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";

type B = { id: string; code: string; status: string; source: string; startsAt: string; total: number; paymentStatus: string; customerName: string; salonName: string; serviceName: string };

export default function AdminBookings() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "bookings", dq, status, page], queryFn: () => api.get<{ items: B[]; total: number }>(`/api/admin/bookings${qs({ q: dq, status, page })}`) });
  return (
    <>
      <PageHeader title="Bookings" description={data ? `${data.total} bookings` : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Booking ID, customer or salon" className="h-9 w-72" aria-label="Search" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 w-48" aria-label="Status">{["", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW", "FAILED", "PAYMENT_PENDING", "IN_SERVICE"].map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}</Select>
      </div>
      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-bold uppercase text-muted"><tr><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Salon</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data?.items.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3"><p className="font-mono text-xs font-semibold">{b.code}</p><p>{b.customerName} · {b.serviceName}</p></td>
                  <td className="px-4 py-3">{b.salonName}<p className="text-xs text-muted">{b.source}</p></td>
                  <td className="px-4 py-3">{formatDate(b.startsAt)} {formatTime(b.startsAt)}</td>
                  <td className="px-4 py-3"><BookingStatusBadge status={b.status} /></td>
                  <td className="px-4 py-3 text-right">{formatINR(b.total)} <PaymentStatusBadge status={b.paymentStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="mt-4 flex justify-center gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={!data || page * 30 >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>
    </>
  );
}
