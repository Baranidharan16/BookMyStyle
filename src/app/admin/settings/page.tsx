"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Switch } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/states";

type Cfg = { gstPercent: number; defaultCommissionPercent: number; planCommission: Record<"FREE" | "PRO" | "PREMIUM", number>; planMonthlyFee: Record<"FREE" | "PRO" | "PREMIUM", number>; showUnapprovedSalons: boolean; featuredListingFee: number; supportEmail: string };

export default function AdminSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api.get<Cfg>("/api/admin/settings") });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/admin/categories") });
  const [c, setC] = useState<Cfg | null>(null);
  const [cat, setCat] = useState("");
  useEffect(() => { if (data && !c) setC(data); }, [data, c]);
  const save = useMutation({ mutationFn: () => api.put("/api/admin/settings", c), onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["admin"] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const addCat = useMutation({ mutationFn: () => api.post("/api/admin/categories", { name: cat }), onSuccess: () => { setCat(""); qc.invalidateQueries({ queryKey: ["categories"] }); toast.success("Category added"); }, onError: (e) => toast.error(errorMessage(e)) });
  if (!c) return <Skeleton className="h-96" />;
  const plans = ["FREE", "PRO", "PREMIUM"] as const;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Platform settings" description="The business model is configuration, not code: commission per plan, subscription fees, featured listings and tax." />
      <Card><CardHeader title="Tax & visibility" /><CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GST on services (%)">{(p) => <Input {...p} type="number" step="0.5" value={c.gstPercent} onChange={(e) => setC({ ...c, gstPercent: Number(e.target.value) })} />}</Field>
          <Field label="Support email">{(p) => <Input {...p} value={c.supportEmail} onChange={(e) => setC({ ...c, supportEmail: e.target.value })} />}</Field>
        </div>
        <Switch checked={c.showUnapprovedSalons} onChange={(v) => setC({ ...c, showUnapprovedSalons: v })} label="Show salons pending verification publicly" description="They stay non-bookable until approved." />
      </CardBody></Card>
      <Card><CardHeader title="Plans & commission" /><CardBody className="space-y-4">
        <Field label="Default commission (%)">{(p) => <Input {...p} type="number" step="0.5" value={c.defaultCommissionPercent} onChange={(e) => setC({ ...c, defaultCommissionPercent: Number(e.target.value) })} />}</Field>
        <div className="grid gap-3 sm:grid-cols-3">{plans.map((pl) => (
          <div key={pl} className="rounded-xl border border-line p-3">
            <Badge tone="brand">{pl}</Badge>
            <label className="mt-2 block text-xs font-semibold">Commission %<Input type="number" step="0.5" className="mt-1 h-9" value={c.planCommission[pl]} onChange={(e) => setC({ ...c, planCommission: { ...c.planCommission, [pl]: Number(e.target.value) } })} /></label>
            <label className="mt-2 block text-xs font-semibold">Monthly fee ₹<Input type="number" className="mt-1 h-9" value={c.planMonthlyFee[pl] / 100} onChange={(e) => setC({ ...c, planMonthlyFee: { ...c.planMonthlyFee, [pl]: Math.round(Number(e.target.value) * 100) } })} /></label>
          </div>
        ))}</div>
        <Field label="Featured listing fee (₹/month)">{(p) => <Input {...p} type="number" value={c.featuredListingFee / 100} onChange={(e) => setC({ ...c, featuredListingFee: Math.round(Number(e.target.value) * 100) })} />}</Field>
      </CardBody></Card>
      <Button size="lg" onClick={() => save.mutate()} loading={save.isPending}>Save settings</Button>
      <Card><CardHeader title="Service categories" /><CardBody>
        <div className="flex flex-wrap gap-1.5">{cats.map((x) => <Badge key={x.id}>{x.name}</Badge>)}</div>
        <div className="mt-4 flex gap-2"><Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="New category" className="h-10" aria-label="New category" /><Button onClick={() => addCat.mutate()} disabled={cat.trim().length < 2}><Plus className="h-4 w-4" /> Add</Button></div>
      </CardBody></Card>
    </div>
  );
}
