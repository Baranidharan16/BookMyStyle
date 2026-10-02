"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api-client";
import { formatDate } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { Stars } from "@/components/ui/misc";
import { EmptyState, Skeleton } from "@/components/ui/states";

type R = { id: string; rating: number; comment: string | null; status: string; moderationNote: string | null; createdAt: string; customerName: string; salonName: string };

export default function AdminReviews() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("FLAGGED");
  const { data, isLoading } = useQuery({ queryKey: ["admin", "reviews", status], queryFn: () => api.get<R[]>(`/api/admin/reviews${qs({ status })}`) });
  const m = useMutation({ mutationFn: (v: { id: string; status: string }) => api.patch(`/api/admin/reviews/${v.id}`, { status: v.status }), onSuccess: () => { toast.success("Review updated"); qc.invalidateQueries({ queryKey: ["admin"] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="Review moderation" description="Only customers with completed bookings can review, one review per booking." actions={<Segmented size="sm" value={status} onChange={setStatus} options={[{ value: "FLAGGED", label: "Flagged" }, { value: "PUBLISHED", label: "Published" }, { value: "HIDDEN", label: "Hidden" }, { value: "", label: "All" }]} />} />
      {isLoading ? <Skeleton className="h-64" /> : !data?.length ? <EmptyState title="Nothing to moderate" /> : (
        <div className="space-y-3">{data.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><Stars value={r.rating} size={14} /><span className="text-sm font-semibold">{r.customerName}</span><span className="text-xs text-muted">on {r.salonName} · {formatDate(r.createdAt)}</span><Badge tone={r.status === "FLAGGED" ? "warning" : r.status === "HIDDEN" ? "danger" : "success"}>{r.status}</Badge></div>
              {r.comment && <p className="mt-2 text-sm text-ink-2">{r.comment}</p>}
            </div>
            <div className="flex gap-2">{r.status !== "PUBLISHED" && <Button size="sm" variant="secondary" onClick={() => m.mutate({ id: r.id, status: "PUBLISHED" })}>Publish</Button>}{r.status !== "HIDDEN" && <Button size="sm" variant="dangerSoft" onClick={() => m.mutate({ id: r.id, status: "HIDDEN" })}>Hide</Button>}</div>
          </Card>
        ))}</div>
      )}
    </>
  );
}
