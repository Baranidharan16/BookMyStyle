"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { serviceSchema } from "@/lib/validation";
import { formatDuration } from "@/lib/utils";
import { useBiz } from "./business-context";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/form";

export type ServiceRow = {
  id: string; name: string; categoryId: string | null; description: string | null; price: number; durationMinutes: number; prepMinutes: number; bufferMinutes: number; staffRequired: number; gender: string; active: boolean; imageUrl: string | null;
  requirements: { resourceTypeId: string; quantity: number; name: string }[]; staffIds: string[];
  optionGroups: { id: string; name: string; multiSelect: boolean; required: boolean; options: { id: string; name: string; priceDelta: number; durationDelta: number }[] }[];
};
type Opt = { name: string; price: string; minutes: string };
type Grp = { name: string; multiSelect: boolean; required: boolean; options: Opt[] };

export function ServiceDialog({ service, onClose, onSaved }: { service: ServiceRow | null; onClose: () => void; onSaved?: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/admin/categories"), staleTime: 3_600_000 });
  const { data: types = [] } = useQuery({ queryKey: ["biz", "resource-types", biz.salonId], queryFn: () => api.get<{ id: string; name: string }[]>(biz.api("/resource-types")) });
  const { data: staff = [] } = useQuery({ queryKey: ["biz", "staff", biz.salonId], queryFn: () => api.get<{ id: string; name: string; active: boolean }[]>(biz.api("/staff")) });
  const [f, setF] = useState({
    name: service?.name ?? "", categoryId: service?.categoryId ?? "", description: service?.description ?? "", price: service ? String(service.price / 100) : "", durationMinutes: String(service?.durationMinutes ?? 30),
    prepMinutes: String(service?.prepMinutes ?? 0), bufferMinutes: String(service?.bufferMinutes ?? 10), staffRequired: String(service?.staffRequired ?? 1), gender: service?.gender ?? "UNISEX", active: service?.active ?? true,
    requirements: service?.requirements.map((r) => ({ resourceTypeId: r.resourceTypeId, quantity: String(r.quantity) })) ?? [],
    staffIds: service?.staffIds ?? [],
  });
  const [groups, setGroups] = useState<Grp[]>(service?.optionGroups.map((g) => ({ name: g.name, multiSelect: g.multiSelect, required: g.required, options: g.options.map((o) => ({ name: o.name, price: String(o.priceDelta / 100), minutes: String(o.durationDelta) })) })) ?? []);
  const [err, setErr] = useState<string | null>(null);
  const reqs = f.requirements.length ? f.requirements : types[0] ? [{ resourceTypeId: types[0].id, quantity: "1" }] : [];

  const m = useMutation({
    mutationFn: () => {
      const payload = {
        ...f,
        categoryId: f.categoryId || null,
        price: Math.round(Number(f.price || 0) * 100),
        requirements: reqs.map((r) => ({ resourceTypeId: r.resourceTypeId, quantity: Number(r.quantity) })),
        optionGroups: groups.map((g) => ({ ...g, options: g.options.map((o) => ({ name: o.name, priceDelta: Math.round(Number(o.price || 0) * 100), durationDelta: Number(o.minutes || 0) })) })),
      };
      const p = serviceSchema.safeParse(payload);
      if (!p.success) {
        const i = p.error.issues[0]!;
        setErr(`${i.path.join(" › ")}: ${i.message}`);
        throw new Error("Please fix the form");
      }
      setErr(null);
      return service ? api.put(biz.api(`/services/${service.id}`), p.data) : api.post(biz.api("/services"), p.data);
    },
    onSuccess: () => { toast.success("Service saved"); qc.invalidateQueries({ queryKey: ["biz"] }); onSaved?.(); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const total = Number(f.prepMinutes || 0) + Number(f.durationMinutes || 0) + Number(f.bufferMinutes || 0);

  return (
    <Dialog open onClose={onClose} size="xl" title={service ? `Edit ${service.name}` : "Add service"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} loading={m.isPending}>Save service</Button></>}>
      {err && <p role="alert" className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{err}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Service name">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Premium Haircut" />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">{(p) => <Select {...p} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">Other</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
            <Field label="For">{(p) => <Select {...p} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="UNISEX">Everyone</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="KIDS">Kids</option></Select>}</Field>
          </div>
          <Field label="Description" optional>{(p) => <Textarea {...p} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Price (₹)">{(p) => <Input {...p} type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />}</Field>
            <Field label="Duration">{(p) => <Input {...p} type="number" min={5} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })} />}</Field>
            <Field label="Prep (min)">{(p) => <Input {...p} type="number" min={0} value={f.prepMinutes} onChange={(e) => setF({ ...f, prepMinutes: e.target.value })} />}</Field>
            <Field label="Buffer (min)">{(p) => <Input {...p} type="number" min={0} value={f.bufferMinutes} onChange={(e) => setF({ ...f, bufferMinutes: e.target.value })} />}</Field>
          </div>
          <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">Each booking blocks the seat & stylist for <strong>{formatDuration(total)}</strong> (prep + service + cleanup), so back-to-back bookings stay realistic.</p>
          <Checkbox checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active — visible and bookable" />
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-[13px] font-semibold text-ink-2">Required resources</p>
            {types.length === 0 && <p className="text-sm text-warning">Add seats/resources first.</p>}
            {reqs.map((r, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Select value={r.resourceTypeId} onChange={(e) => setF({ ...f, requirements: reqs.map((x, j) => (j === i ? { ...x, resourceTypeId: e.target.value } : x)) })} aria-label="Resource type">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
                <Input type="number" min={1} max={10} className="w-20" value={r.quantity} onChange={(e) => setF({ ...f, requirements: reqs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} aria-label="Quantity" />
                <Button variant="ghost" size="icon" onClick={() => setF({ ...f, requirements: reqs.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {types.length > 0 && <Button size="sm" variant="ghost" onClick={() => setF({ ...f, requirements: [...reqs, { resourceTypeId: types[0]!.id, quantity: "1" }] })}><Plus className="h-4 w-4" /> Add requirement</Button>}
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink-2">Staff who can perform it</p>
              <label className="flex items-center gap-1.5 text-xs">Needs <Input type="number" min={0} max={5} className="h-8 w-14" value={f.staffRequired} onChange={(e) => setF({ ...f, staffRequired: e.target.value })} aria-label="Staff required" /> staff</label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {staff.filter((s) => s.active).map((s) => {
                const on = f.staffIds.includes(s.id);
                return <button key={s.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, staffIds: on ? f.staffIds.filter((x) => x !== s.id) : [...f.staffIds, s.id] })} className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-brand bg-brand text-white" : "border-line"}`}>{s.name}</button>;
              })}
            </div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between"><p className="text-[13px] font-semibold text-ink-2">Customer options</p><Button size="sm" variant="ghost" onClick={() => setGroups([...groups, { name: "Hair length", multiSelect: false, required: false, options: [{ name: "Short", price: "0", minutes: "0" }] }])}><Plus className="h-4 w-4" /> Option group</Button></div>
            {groups.map((g, gi) => (
              <div key={gi} className="mt-3 rounded-lg bg-surface-2 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="h-9 flex-1" value={g.name} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)))} aria-label="Group name" />
                  <Checkbox checked={g.required} onChange={(v) => setGroups(groups.map((x, j) => (j === gi ? { ...x, required: v } : x)))} label="Required" />
                  <Checkbox checked={g.multiSelect} onChange={(v) => setGroups(groups.map((x, j) => (j === gi ? { ...x, multiSelect: v } : x)))} label="Multi" />
                  <Button size="iconSm" variant="ghost" onClick={() => setGroups(groups.filter((_, j) => j !== gi))} aria-label="Remove group"><Trash2 className="h-4 w-4" /></Button>
                </div>
                {g.options.map((o, oi) => (
                  <div key={oi} className="mt-2 grid grid-cols-[1fr_80px_80px_32px] gap-1.5">
                    <Input className="h-8" value={o.name} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, name: e.target.value } : y)) } : x)))} aria-label="Option name" />
                    <Input className="h-8" type="number" min={0} value={o.price} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, price: e.target.value } : y)) } : x)))} aria-label="Extra price ₹" placeholder="+₹" />
                    <Input className="h-8" type="number" min={0} value={o.minutes} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, minutes: e.target.value } : y)) } : x)))} aria-label="Extra minutes" placeholder="+min" />
                    <Button size="iconSm" variant="ghost" onClick={() => setGroups(groups.map((x, j) => (j === gi ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x)))} aria-label="Remove option"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                <button type="button" className="mt-2 text-xs font-semibold text-brand" onClick={() => setGroups(groups.map((x, j) => (j === gi ? { ...x, options: [...x.options, { name: "", price: "0", minutes: "0" }] } : x)))}>+ Add option</button>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-muted">Columns: option · extra price (₹) · extra minutes</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
