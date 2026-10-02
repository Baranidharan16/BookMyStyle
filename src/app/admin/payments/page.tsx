"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/time";
import { PaymentStatusBadge } from "@/components/booking/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";

type P = { id: string; provider: string; providerOrderId: string | null; providerPaymentId: string | null; amount: number; status: string; method: string | null; failureReason: string | null; createdAt: string; bookingCode: string; salonName: string };
type R = { id: string; amount: number; status: string; reason: string | null; failureReason: string | null; providerRefundId: string | null; createdAt: string; processedAt: string | null; bookingCode: string; customerName: string; salonName: string };

export default function AdminPayments() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"payments" | "refunds">("payments");
  const [status, setStatus] = useState("");
  const { data: pays, isLoading } = useQuery({ queryKey: ["admin", "payments", status], queryFn: () => api.get<{ items: P[]; total: number }>(`/api/admin/payments${qs({ status })}`), enabled: tab === "payments" });
  const { data: refunds } = useQuery({ queryKey: ["admin", "refunds"], queryFn: () => api.get<R[]>("/api/admin/refunds"), enabled: tab === "refunds" });
  const retry = useMutation({ mutationFn: (id: string) => api.post<{ status: string }>(`/api/admin/refunds/${id}`), onSuccess: (r) => { toast.success(`Refund ${r.status?.toLowerCase()}`); qc.invalidateQueries({ queryKey: ["admin"] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="Payments & refunds" actions={<Segmented value={tab} onChange={setTab} options={[{ value: "payments", label: "Payments" }, { value: "refunds", label: "Refunds" }]} />} />
      {tab === "payments" ? (
        <>
          <div className="mb-4"><Segmented size="sm" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "SUCCESSFUL", label: "Successful" }, { value: "FAILED", label: "Failed" }, { value: "INITIATED", label: "Initiated" }, { value: "REFUNDED", label: "Refunded" }]} /></div>
          {isLoading ? <Skeleton className="h-64" /> : (
            <Card className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm">
              <thead className="bg-surface-2 text-left text-xs font-bold uppercase text-muted"><tr><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Provider refs</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">When</th></tr></thead>
              <tbody className="divide-y divide-line">{pays?.items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3"><p className="font-mono text-xs font-semibold">{p.bookingCode}</p><p className="text-xs text-muted">{p.salonName}</p></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted">{p.provider}<br />{p.providerOrderId}<br />{p.providerPaymentId}</td>
                  <td className="px-4 py-3">{p.method?.toUpperCase() ?? "—"}</td>
                  <td className="px-4 py-3"><PaymentStatusBadge status={p.status} />{p.failureReason && <p className="mt-1 text-xs text-danger">{p.failureReason}</p>}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatINR(p.amount, { decimals: true })}</td>
                  <td className="px-4 py-3 text-xs">{formatDate(p.createdAt)} {formatTime(p.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table></Card>
          )}
        </>
      ) : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm">
          <thead className="bg-surface-2 text-left text-xs font-bold uppercase text-muted"><tr><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Created</th><th /></tr></thead>
          <tbody className="divide-y divide-line">{refunds?.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3"><p className="font-mono text-xs font-semibold">{r.bookingCode}</p><p className="text-xs text-muted">{r.customerName} · {r.salonName}</p></td>
              <td className="px-4 py-3 text-xs text-ink-2">{r.reason}{r.failureReason && <p className="text-danger">{r.failureReason}</p>}</td>
              <td className="px-4 py-3"><Badge tone={r.status === "PROCESSED" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{r.status}</Badge></td>
              <td className="px-4 py-3 text-right font-semibold">{formatINR(r.amount, { decimals: true })}</td>
              <td className="px-4 py-3 text-xs">{formatDate(r.createdAt)}</td>
              <td className="px-4 py-3 text-right">{r.status !== "PROCESSED" && <Button size="sm" variant="secondary" onClick={() => retry.mutate(r.id)} loading={retry.isPending}>Retry</Button>}</td>
            </tr>
          ))}</tbody>
        </table></Card>
      )}
    </>
  );
}
