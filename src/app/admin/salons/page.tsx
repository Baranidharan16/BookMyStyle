"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api-client";
import { formatDate } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Segmented, Select, Switch, Textarea } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";
import { RatingPill } from "@/components/ui/misc";

type S = { id: string; name: string; slug: string; citySlug: string; status: string; plan: string; featured: boolean; commissionPercent: number | null; ratingAvg: number; ratingCount: number; createdAt: string; ownerName: string; ownerEmail: string; area: string | null; city: string | null; bookings30d: number; verificationNotes: string | null; onboardingStep: number };
const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { APPROVED: "success", PENDING: "warning", UNDER_REVIEW: "info", REJECTED: "danger", SUSPENDED: "danger", DRAFT: "neutral" };

export default function AdminSalons() {
  const [status, setStatus] = useState(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("status") ?? "" : "");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["admin", "salons", status, q], queryFn: () => api.get<S[]>(`/api/admin/salons${qs({ status, q })}`) });
  const [edit, setEdit] = useState<S | null>(null);
  return (
    <>
      <PageHeader title="Salons" description="Verify new salons, suspend bad actors and configure plans, featured listings and commission." />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="no-scrollbar max-w-full overflow-x-auto"><Segmented size="sm" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "PENDING", label: "Pending" }, { value: "UNDER_REVIEW", label: "Under review" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }, { value: "SUSPENDED", label: "Suspended" }, { value: "DRAFT", label: "Draft" }]} /></div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search salon" className="h-9 w-56" aria-label="Search salons" />
      </div>
      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-bold uppercase text-muted"><tr><th className="px-4 py-3">Salon</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3 text-right">Bookings 30d</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-line">
              {data?.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3"><Link href={`/salons/${s.citySlug}/${s.slug}`} className="font-semibold hover:text-brand">{s.name}</Link><p className="text-xs text-muted">{s.area ?? "—"}, {s.city ?? "—"} · joined {formatDate(s.createdAt)}</p></td>
                  <td className="px-4 py-3">{s.ownerName}<p className="text-xs text-muted">{s.ownerEmail}</p></td>
                  <td className="px-4 py-3"><Badge tone={TONE[s.status]}>{s.status.replace("_", " ")}</Badge>{s.featured && <Badge tone="accent" className="ml-1">Featured</Badge>}</td>
                  <td className="px-4 py-3">{s.plan}{s.commissionPercent != null && <p className="text-xs text-muted">{s.commissionPercent}% commission</p>}</td>
                  <td className="px-4 py-3 text-right">{s.bookings30d}</td>
                  <td className="px-4 py-3"><RatingPill value={s.ratingAvg} count={s.ratingCount} /></td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => setEdit(s)}>Manage</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {edit && <ManageSalon s={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ManageSalon({ s, onClose }: { s: S; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ status: s.status === "DRAFT" ? "PENDING" : s.status, verificationNotes: s.verificationNotes ?? "", featured: s.featured, plan: s.plan, commissionPercent: s.commissionPercent == null ? "" : String(s.commissionPercent) });
  const m = useMutation({
    mutationFn: () => api.patch(`/api/admin/salons/${s.id}`, { ...f, commissionPercent: f.commissionPercent === "" ? null : Number(f.commissionPercent) }),
    onSuccess: () => { toast.success("Salon updated"); qc.invalidateQueries({ queryKey: ["admin"] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onClose={onClose} title={s.name} description={`Onboarding step ${Math.min(10, s.onboardingStep)}/10`} footer={<Button onClick={() => m.mutate()} loading={m.isPending}>Save</Button>}>
      <div className="space-y-4">
        <label className="block text-sm font-semibold">Verification status<Select className="mt-1" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="PENDING">Pending</option><option value="UNDER_REVIEW">Under review</option><option value="APPROVED">Approved (live)</option><option value="REJECTED">Rejected</option><option value="SUSPENDED">Suspended</option></Select></label>
        <label className="block text-sm font-semibold">Notes to owner<Textarea className="mt-1" value={f.verificationNotes} onChange={(e) => setF({ ...f, verificationNotes: e.target.value })} placeholder="Shown to the owner on rejection/suspension" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">Plan<Select className="mt-1" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option>FREE</option><option>PRO</option><option>PREMIUM</option></Select></label>
          <label className="block text-sm font-semibold">Commission override %<Input className="mt-1" type="number" min={0} max={50} step="0.5" value={f.commissionPercent} onChange={(e) => setF({ ...f, commissionPercent: e.target.value })} placeholder="Plan default" /></label>
        </div>
        <Switch checked={f.featured} onChange={(v) => setF({ ...f, featured: v })} label="Featured listing" description="Boosted in default search ranking" />
      </div>
    </Dialog>
  );
}
