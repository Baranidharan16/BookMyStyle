"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, MessageSquareQuote, Reply } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/time";
import { useBiz } from "@/components/business/business-context";
import { Avatar, Stars } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Segmented, Textarea } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/states";

type R = { id: string; rating: number; serviceRating: number | null; staffRating: number | null; comment: string | null; ownerReply: string | null; status: string; createdAt: string; customerName: string; serviceName: string | null; staffName: string | null };

export default function ReviewsPage() {
  const biz = useBiz();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useQuery({ queryKey: ["biz", "reviews", biz.salonId], queryFn: () => api.get<R[]>(biz.api("/reviews")) });
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState("");
  const m = useMutation({
    mutationFn: (v: { id: string; reply?: string; flag?: boolean }) => api.post(biz.api(`/reviews/${v.id}`), v),
    onSuccess: (_d, v) => { toast.success(v.flag ? "Flagged for moderation" : "Reply posted"); setReplying(null); setText(""); qc.invalidateQueries({ queryKey: ["biz"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const list = (data ?? []).filter((r) => filter === "all" || (filter === "unreplied" ? !r.ownerReply : r.rating <= 3));
  const avg = data?.length ? data.reduce((s, r) => s + r.rating, 0) / data.length : 0;
  return (
    <>
      <PageHeader title="Reviews" description={data ? `${avg.toFixed(1)}★ average across the latest ${data.length} verified reviews` : undefined} actions={<Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unreplied", label: "Needs reply" }, { value: "low", label: "≤ 3★" }]} />} />
      {isLoading ? <Skeleton className="h-64" /> : !list.length ? <EmptyState icon={<MessageSquareQuote className="h-6 w-6" />} title="No reviews here" description="Reviews come only from customers with completed bookings." /> : (
        <div className="space-y-3">
          {list.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={r.customerName} size={40} />
                  <div><p className="font-bold">{r.customerName}</p><p className="text-xs text-muted">{[r.serviceName, r.staffName && `with ${r.staffName}`].filter(Boolean).join(" ")} · {formatDate(r.createdAt, biz.timezone)}</p></div>
                </div>
                <div className="text-right"><Stars value={r.rating} />{r.status !== "PUBLISHED" && <Badge tone="warning" className="mt-1">{r.status.toLowerCase()}</Badge>}</div>
              </div>
              {r.comment && <p className="mt-3 text-sm text-ink-2">{r.comment}</p>}
              {r.ownerReply ? <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><span className="font-bold">Your reply: </span>{r.ownerReply}</p> : replying === r.id ? (
                <div className="mt-3 space-y-2"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Thank the customer or address their concern…" aria-label="Reply" /><div className="flex gap-2"><Button size="sm" onClick={() => m.mutate({ id: r.id, reply: text })} loading={m.isPending} disabled={text.trim().length < 2}>Post reply</Button><Button size="sm" variant="ghost" onClick={() => setReplying(null)}>Cancel</Button></div></div>
              ) : (
                <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setReplying(r.id)}><Reply className="h-4 w-4" /> Reply</Button>{r.status === "PUBLISHED" && <Button size="sm" variant="ghost" onClick={() => m.mutate({ id: r.id, flag: true })}><Flag className="h-4 w-4" /> Report</Button>}</div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
