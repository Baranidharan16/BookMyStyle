"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { couponSchema } from "@/lib/validation";
import { formatINR } from "@/lib/utils";
import { formatDate, formatMinutes, toDateKey, WEEKDAY_SHORT, zonedToUtc, addDaysKey } from "@/lib/time";
import { useBiz } from "@/components/business/business-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/states";

type Coupon = { id: string; code: string; title: string; description: string | null; kind: string; type: "PERCENT" | "FLAT"; value: number; maxDiscount: number | null; minAmount: number; validFrom: string; validTo: string; startMinute: number | null; endMinute: number | null; weekdays: number[] | null; serviceIds: string[] | null; firstBookingOnly: boolean; newCustomerOnly: boolean; usageLimit: number | null; perUserLimit: number; usedCount: number; active: boolean };

export default function OffersPage() {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["biz", "coupons", biz.salonId], queryFn: () => api.get<Coupon[]>(biz.api("/coupons")) });
  const [edit, setEdit] = useState<Coupon | "new" | null>(null);
  const toggle = useMutation({ mutationFn: (c: Coupon) => api.patch(biz.api(`/coupons/${c.id}`), { active: !c.active }), onSuccess: () => qc.invalidateQueries({ queryKey: ["biz"] }), onError: (e) => toast.error(errorMessage(e)) });
  const now = Date.now();
  return (
    <>
      <PageHeader title="Offers & coupons" description="Percentage, flat, first-visit, weekend, festival, service- and time-specific offers." actions={<Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Create offer</Button>} />
      {isLoading ? <Skeleton className="h-64" /> : !data?.length ? (
        <EmptyState icon={<Tag className="h-6 w-6" />} title="No offers yet" description="Offers appear on your salon page and in search results." action={<Button onClick={() => setEdit("new")}>Create offer</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => {
            const live = c.active && new Date(c.validFrom).getTime() <= now && new Date(c.validTo).getTime() >= now;
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-lg border border-dashed border-accent px-2 py-0.5 font-mono text-sm font-bold text-accent">{c.code}</span>
                  <Badge tone={live ? "success" : c.active ? "warning" : "neutral"}>{live ? "Live" : c.active ? (new Date(c.validTo).getTime() < now ? "Expired" : "Scheduled") : "Paused"}</Badge>
                </div>
                <p className="mt-3 font-bold">{c.title}</p>
                <p className="text-sm text-ink-2">{c.type === "PERCENT" ? `${c.value}% off` : `${formatINR(c.value)} off`}{c.maxDiscount ? ` (up to ${formatINR(c.maxDiscount)})` : ""}{c.minAmount ? ` · min ${formatINR(c.minAmount)}` : ""}</p>
                <p className="mt-2 text-xs text-muted">{formatDate(c.validFrom, biz.timezone)} → {formatDate(c.validTo, biz.timezone)}{c.startMinute != null ? ` · ${formatMinutes(c.startMinute)}–${formatMinutes(c.endMinute!)}` : ""}{c.weekdays?.length ? ` · ${c.weekdays.map((d) => WEEKDAY_SHORT[d]).join("/")}` : ""}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>Used {c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""} times</span>
                  <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => toggle.mutate(c)}>{c.active ? "Pause" : "Resume"}</Button></span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {edit && <CouponDialog coupon={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function CouponDialog({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data: services = [] } = useQuery({ queryKey: ["biz", "services", biz.salonId], queryFn: () => api.get<{ id: string; name: string }[]>(biz.api("/services")) });
  const today = toDateKey(new Date(), biz.timezone);
  const hh = (m: number | null) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  const [f, setF] = useState({
    code: coupon?.code ?? "", title: coupon?.title ?? "", description: coupon?.description ?? "", kind: coupon?.kind ?? "GENERAL", type: coupon?.type ?? "PERCENT", value: coupon ? String(coupon.type === "FLAT" ? coupon.value / 100 : coupon.value) : "20",
    maxDiscount: coupon?.maxDiscount ? String(coupon.maxDiscount / 100) : "", minAmount: coupon?.minAmount ? String(coupon.minAmount / 100) : "", from: coupon ? toDateKey(new Date(coupon.validFrom), biz.timezone) : today, to: coupon ? toDateKey(new Date(coupon.validTo), biz.timezone) : addDaysKey(today, 14),
    timeFrom: hh(coupon?.startMinute ?? null), timeTo: hh(coupon?.endMinute ?? null), weekdays: coupon?.weekdays ?? [], serviceIds: coupon?.serviceIds ?? [], firstBookingOnly: coupon?.firstBookingOnly ?? false, newCustomerOnly: coupon?.newCustomerOnly ?? false,
    usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : "", perUserLimit: String(coupon?.perUserLimit ?? 1), active: coupon?.active ?? true,
  });
  const [err, setErr] = useState<string | null>(null);
  const parse = (s: string) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);
  const m = useMutation({
    mutationFn: () => {
      const payload = {
        code: f.code, title: f.title, description: f.description || null, kind: f.kind, type: f.type, value: f.type === "FLAT" ? Math.round(Number(f.value) * 100) : Number(f.value),
        maxDiscount: f.maxDiscount ? Math.round(Number(f.maxDiscount) * 100) : null, minAmount: f.minAmount ? Math.round(Number(f.minAmount) * 100) : 0,
        validFrom: zonedToUtc(f.from, 0, biz.timezone).toISOString(), validTo: zonedToUtc(f.to, 1439, biz.timezone).toISOString(),
        startMinute: parse(f.timeFrom), endMinute: parse(f.timeTo), weekdays: f.weekdays.length ? f.weekdays : null, serviceIds: f.serviceIds.length ? f.serviceIds : null,
        firstBookingOnly: f.firstBookingOnly, newCustomerOnly: f.newCustomerOnly, usageLimit: f.usageLimit ? Number(f.usageLimit) : null, perUserLimit: Number(f.perUserLimit || 1), active: f.active,
      };
      const p = couponSchema.safeParse(payload);
      if (!p.success) { const i = p.error.issues[0]!; setErr(`${i.path.join(".") || "Offer"}: ${i.message}`); throw new Error("Please fix the form"); }
      setErr(null);
      return coupon ? api.put(biz.api(`/coupons/${coupon.id}`), p.data) : api.post(biz.api("/coupons"), p.data);
    },
    onSuccess: () => { toast.success("Offer saved"); qc.invalidateQueries({ queryKey: ["biz"] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onClose={onClose} size="lg" title={coupon ? "Edit offer" : "Create offer"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} loading={m.isPending}>Save offer</Button></>}>
      {err && <p role="alert" className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{err}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code">{(p) => <Input {...p} className="font-mono uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="GROOM20" />}</Field>
        <Field label="Type of offer">{(p) => <Select {...p} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["GENERAL", "FIRST_BOOKING", "NEW_CUSTOMER", "WEEKEND", "FESTIVAL", "SERVICE", "TIME", "MIN_PURCHASE"].map((k) => <option key={k} value={k}>{k.replace("_", " ").toLowerCase()}</option>)}</Select>}</Field>
        <Field label="Title" className="sm:col-span-2">{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="20% OFF Hair Spa" />}</Field>
        <Field label="Description" optional className="sm:col-span-2">{(p) => <Textarea {...p} className="min-h-[60px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Discount">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "PERCENT" | "FLAT" })}><option value="PERCENT">Percent</option><option value="FLAT">Flat ₹</option></Select>}</Field>
          <Field label={f.type === "PERCENT" ? "Percent" : "Amount ₹"}>{(p) => <Input {...p} type="number" min={1} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Max discount ₹" optional>{(p) => <Input {...p} type="number" min={0} value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} />}</Field>
          <Field label="Min bill ₹" optional>{(p) => <Input {...p} type="number" min={0} value={f.minAmount} onChange={(e) => setF({ ...f, minAmount: e.target.value })} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Valid from">{(p) => <Input {...p} type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />}</Field>
          <Field label="Valid to">{(p) => <Input {...p} type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Time from" optional hint="Appointment time window">{(p) => <Input {...p} type="time" step={900} value={f.timeFrom} onChange={(e) => setF({ ...f, timeFrom: e.target.value })} />}</Field>
          <Field label="Time to" optional>{(p) => <Input {...p} type="time" step={900} value={f.timeTo} onChange={(e) => setF({ ...f, timeTo: e.target.value })} />}</Field>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Days (leave empty for every day)</p>
          <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6, 0].map((d) => { const on = f.weekdays.includes(d); return <button key={d} type="button" aria-pressed={on} onClick={() => setF({ ...f, weekdays: on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] })} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${on ? "border-brand bg-brand text-white" : "border-line"}`}>{WEEKDAY_SHORT[d]}</button>; })}</div>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Services (leave empty for all)</p>
          <div className="flex flex-wrap gap-1.5">{services.map((s) => { const on = f.serviceIds.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, serviceIds: on ? f.serviceIds.filter((x) => x !== s.id) : [...f.serviceIds, s.id] })} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-brand bg-brand text-white" : "border-line"}`}>{s.name}</button>; })}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Total uses" optional>{(p) => <Input {...p} type="number" min={1} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} placeholder="Unlimited" />}</Field>
          <Field label="Per customer">{(p) => <Input {...p} type="number" min={1} value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value })} />}</Field>
        </div>
        <div className="space-y-2 pt-6">
          <Checkbox checked={f.firstBookingOnly} onChange={(v) => setF({ ...f, firstBookingOnly: v })} label="First BookMyStyle booking only" />
          <Checkbox checked={f.newCustomerOnly} onChange={(v) => setF({ ...f, newCustomerOnly: v })} label="New customers of this salon only" />
        </div>
        <div className="sm:col-span-2"><Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" /></div>
      </div>
    </Dialog>
  );
}
