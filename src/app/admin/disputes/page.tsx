"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/states";

type D = { id: string; reason: string; status: string; resolution: string | null; createdAt: string; bookingCode: string; salonName: string; raisedBy: string };

export default function AdminDisputes() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "disputes"], queryFn: () => api.get<D[]>("/api/admin/disputes") });
  const [edit, setEdit] = useState<D | null>(null);
  return (
    <>
      <PageHeader title="Disputes" description="Customer-reported issues with bookings, payments or services." />
      {isLoading ? <Skeleton className="h-64" /> : !data?.length ? <EmptyState title="No disputes" description="Customers can report a problem from their booking page." /> : (
        <div className="space-y-3">{data.map((d) => (
          <Card key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><p className="text-sm"><span className="font-mono text-xs font-semibold">{d.bookingCode}</span> · {d.salonName} · by {d.raisedBy} · {formatDate(d.createdAt)}</p><p className="mt-1 text-sm text-ink-2">{d.reason}</p>{d.resolution && <p className="mt-1 text-xs text-success">Resolution: {d.resolution}</p>}</div>
            <Badge tone={d.status === "RESOLVED" ? "success" : d.status === "REJECTED" ? "neutral" : "warning"}>{d.status}</Badge>
            <Button size="sm" variant="secondary" onClick={() => setEdit(d)}>Update</Button>
          </Card>
        ))}</div>
      )}
      {edit && <Resolve d={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Resolve({ d, onClose }: { d: D; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(d.status === "OPEN" ? "IN_REVIEW" : d.status);
  const [resolution, setResolution] = useState(d.resolution ?? "");
  const m = useMutation({ mutationFn: () => api.patch(`/api/admin/disputes/${d.id}`, { status, resolution: resolution || undefined }), onSuccess: () => { toast.success("Dispute updated"); qc.invalidateQueries({ queryKey: ["admin"] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Dialog open onClose={onClose} title={`Dispute ${d.bookingCode}`} footer={<Button onClick={() => m.mutate()} loading={m.isPending}>Save</Button>}>
      <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="OPEN">Open</option><option value="IN_REVIEW">In review</option><option value="RESOLVED">Resolved</option><option value="REJECTED">Rejected</option></Select>
      <Textarea className="mt-3" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Resolution (sent to the customer)" aria-label="Resolution" />
    </Dialog>
  );
}
