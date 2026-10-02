"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { deskBookingSchema } from "@/lib/validation";
import { formatDuration, formatINR } from "@/lib/utils";
import { formatTime, minutesOfDay, toDateKey, zonedToUtc, toHHMM } from "@/lib/time";
import { Button } from "../ui/button";
import { Checkbox, Field, Input, Select, Segmented, Textarea } from "../ui/form";
import { useBiz } from "./business-context";

type Svc = { id: string; name: string; price: number; durationMinutes: number; active: boolean; staffIds: string[]; requirements: { resourceTypeId: string; name: string }[] };
type StaffRow = { id: string; name: string; title: string; active: boolean };
type Res = { id: string; name: string; resourceTypeId: string; typeName: string; active: boolean };
type Conflict = { code: string; customerName: string; startsAt: string; endsAt: string; on: string };

/** "Add Walk-In Customer" — writes through the same booking engine as online bookings. */
export function WalkInForm({ onCreated, defaultSource = "WALK_IN" }: { onCreated?: () => void; defaultSource?: "WALK_IN" | "OWNER" }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data: services = [] } = useQuery({ queryKey: ["biz", "services", biz.salonId], queryFn: () => api.get<Svc[]>(biz.api("/services")) });
  const { data: staff = [] } = useQuery({ queryKey: ["biz", "staff", biz.salonId], queryFn: () => api.get<StaffRow[]>(biz.api("/staff")) });
  const { data: resources = [] } = useQuery({ queryKey: ["biz", "resources", biz.salonId], queryFn: () => api.get<Res[]>(biz.api("/resources")) });
  const now = new Date();
  const [f, setF] = useState({ source: defaultSource, customerName: "", customerPhone: "", serviceId: "", staffId: "", resourceId: "", when: "now" as "now" | "later", date: toDateKey(now, biz.timezone), time: toHHMM((Math.ceil(minutesOfDay(now, biz.timezone) / 15) * 15) % 1440), durationMinutes: "", price: "", paymentMode: "CASH" as "CASH" | "UPI" | "CARD" | "OTHER" | "PAY_AT_SALON", paymentCollected: false, notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ message: string; conflicts: Conflict[]; canOverride: boolean } | null>(null);
  const svc = services.find((s) => s.id === f.serviceId);
  useEffect(() => {
    if (!f.serviceId && services.length) setF((x) => ({ ...x, serviceId: services.find((s) => s.active)?.id ?? "" }));
  }, [services, f.serviceId]);
  useEffect(() => setConflict(null), [f.serviceId, f.staffId, f.resourceId, f.when, f.date, f.time, f.durationMinutes]);
  const eligibleStaff = staff.filter((s) => s.active && (!svc || svc.staffIds.includes(s.id)));
  const eligibleRes = useMemo(() => resources.filter((r) => r.active && (!svc || svc.requirements.some((q) => q.resourceTypeId === r.resourceTypeId))), [resources, svc]);

  const m = useMutation({
    mutationFn: async (override: boolean) => {
      const startsAt = f.when === "now" ? null : zonedToUtc(f.date, Number(f.time.slice(0, 2)) * 60 + Number(f.time.slice(3)), biz.timezone).toISOString();
      const payload = {
        source: f.source,
        customerName: f.customerName,
        customerPhone: f.customerPhone,
        serviceId: f.serviceId,
        staffId: f.staffId || null,
        resourceId: f.resourceId || null,
        startsAt,
        durationMinutes: f.durationMinutes ? Number(f.durationMinutes) : null,
        price: f.price ? Math.round(Number(f.price) * 100) : null,
        paymentMode: f.paymentMode,
        paymentCollected: f.paymentCollected,
        notes: f.notes || null,
        override,
      };
      const parsed = deskBookingSchema.safeParse(payload);
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      return api.post<{ code: string; status: string }>(biz.api("/walk-ins"), parsed.data);
    },
    onSuccess: (r) => {
      toast.success(`${f.source === "WALK_IN" ? "Walk-in" : "Booking"} added — ${r.code}`, { description: "The seat is now unavailable for online customers." });
      qc.invalidateQueries({ queryKey: ["biz"] });
      setF((x) => ({ ...x, customerName: "", customerPhone: "", notes: "", price: "", durationMinutes: "", paymentCollected: false }));
      setConflict(null);
      onCreated?.();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "DESK_CONFLICT") {
        const d = e.details as { conflicts: Conflict[]; canOverride: boolean };
        setConflict({ message: e.message, conflicts: d?.conflicts ?? [], canOverride: !!d?.canOverride });
        return;
      }
      toast.error(errorMessage(e));
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(false); }} className="space-y-5" noValidate>
      <Segmented value={f.source} onChange={(v) => setF({ ...f, source: v as typeof f.source })} options={[{ value: "WALK_IN", label: "Walk-in" }, { value: "OWNER", label: "Phone / desk booking" }]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" error={errors.customerName}>{(p) => <Input {...p} value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} autoComplete="off" />}</Field>
        <Field label="Phone number" optional error={errors.customerPhone}>{(p) => <Input {...p} type="tel" value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value })} />}</Field>
        <Field label="Service" error={errors.serviceId}>
          {(p) => (
            <Select {...p} value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value, staffId: "", resourceId: "" })}>
              {services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {formatINR(s.price)} · {formatDuration(s.durationMinutes)}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Assigned staff" hint="Leave on ‘Auto’ to pick the least busy free stylist.">
          {(p) => <Select {...p} value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}><option value="">Auto-assign</option>{eligibleStaff.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.title}</option>)}</Select>}
        </Field>
        <Field label="Seat / resource">
          {(p) => <Select {...p} value={f.resourceId} onChange={(e) => setF({ ...f, resourceId: e.target.value })}><option value="">Auto-assign</option>{eligibleRes.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.typeName})</option>)}</Select>}
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Start time</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={f.when} onChange={(v) => setF({ ...f, when: v as "now" | "later" })} options={[{ value: "now", label: "Now" }, { value: "later", label: "Pick time" }]} />
            {f.when === "later" && (
              <>
                <Input type="date" className="h-9 w-auto" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
                <Input type="time" step={300} className="h-9 w-auto" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} aria-label="Time" />
              </>
            )}
          </div>
        </div>
        <Field label="Expected duration (min)" optional hint={svc ? `Default ${svc.durationMinutes} min` : undefined} error={errors.durationMinutes}>{(p) => <Input {...p} type="number" min={5} max={720} placeholder={svc ? String(svc.durationMinutes) : ""} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })} />}</Field>
        <Field label="Price (₹)" optional hint={svc ? `Menu price ${formatINR(svc.price)} + GST` : undefined} error={errors.price}>{(p) => <Input {...p} type="number" min={0} step="1" placeholder={svc ? String(svc.price / 100) : ""} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />}</Field>
        <Field label="Payment mode">
          {(p) => <Select {...p} value={f.paymentMode} onChange={(e) => setF({ ...f, paymentMode: e.target.value as typeof f.paymentMode })}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="OTHER">Other</option><option value="PAY_AT_SALON">Pay after service</option></Select>}
        </Field>
        <div className="flex items-end pb-2"><Checkbox checked={f.paymentCollected} onChange={(v) => setF({ ...f, paymentCollected: v })} label="Payment already collected" /></div>
      </div>
      <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes (optional)" maxLength={500} aria-label="Notes" />

      {conflict && (
        <div role="alert" className="rounded-2xl border border-warning/40 bg-warning-soft p-4">
          <p className="flex items-center gap-2 font-bold text-warning"><AlertTriangle className="h-5 w-5" /> Conflict detected</p>
          <p className="mt-1 text-sm text-ink-2">{conflict.message}</p>
          {conflict.conflicts.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {conflict.conflicts.map((c, i) => <li key={i}>• <strong>{c.customerName}</strong> ({c.code}) on {c.on}, {formatTime(c.startsAt, biz.timezone)}–{formatTime(c.endsAt, biz.timezone)}</li>)}
            </ul>
          )}
          {conflict.canOverride ? (
            <Button type="button" variant="danger" size="sm" className="mt-3" loading={m.isPending} onClick={() => m.mutate(true)}><ShieldAlert className="h-4 w-4" /> Override and add anyway</Button>
          ) : (
            <p className="mt-2 text-xs text-muted">Only the salon owner can override a conflict. Pick another seat, stylist or time.</p>
          )}
        </div>
      )}
      <Button type="submit" size="lg" loading={m.isPending && !conflict}><UserPlus className="h-4 w-4" /> Add {f.source === "WALK_IN" ? "walk-in" : "booking"}</Button>
    </form>
  );
}
