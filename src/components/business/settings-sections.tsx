"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { CalendarX, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { holidaySchema, locationSchema, payoutSchema, policySchema, salonProfileSchema, weeklyHoursSchema } from "@/lib/validation";
import { formatDate, formatDateKey, formatMinutes, formatTime, toDateKey } from "@/lib/time";
import { useBiz } from "./business-context";
import { ScheduleEditor, type Week } from "./schedule-editor";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "../ui/form";
import { Skeleton } from "../ui/states";
import { Badge } from "../ui/badge";

const PinPicker = dynamic(() => import("../map/pin-picker"), { ssr: false, loading: () => <Skeleton className="h-64" /> });

function firstError(issues: { path: PropertyKey[]; message: string }[]) {
  const i = issues[0]!;
  return `${i.path.map(String).join(".") || "Form"}: ${i.message}`;
}

export function ProfileSection({ onSaved }: { onSaved?: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["biz", "salon", biz.salonId], queryFn: () => api.get<Record<string, unknown>>(biz.api("")) });
  const [f, setF] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { if (data && !f) setF({ ...data, amenitiesText: ((data.amenities as string[]) ?? []).join(", ") }); }, [data, f]);
  const m = useMutation({
    mutationFn: () => {
      const p = salonProfileSchema.safeParse({ ...f, amenities: String(f!.amenitiesText ?? "").split(",").map((s) => s.trim()).filter(Boolean) });
      if (!p.success) throw new Error(firstError(p.error.issues));
      return api.patch(biz.api(""), p.data);
    },
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["biz"] }); onSaved?.(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!f) return <Skeleton className="h-80" />;
  const v = (k: string) => (f[k] as string) ?? "";
  const s = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Card><CardHeader title="Salon profile" description="Shown on your public salon page." /><CardBody className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Salon name">{(p) => <Input {...p} value={v("name")} onChange={s("name")} />}</Field>
        <Field label="Tagline" optional>{(p) => <Input {...p} value={v("tagline")} onChange={s("tagline")} />}</Field>
        <Field label="Phone" optional>{(p) => <Input {...p} value={v("phone")} onChange={s("phone")} />}</Field>
        <Field label="Email" optional>{(p) => <Input {...p} type="email" value={v("email")} onChange={s("email")} />}</Field>
        <Field label="Serves">{(p) => <Select {...p} value={v("genderType")} onChange={s("genderType")}><option value="UNISEX">Everyone (unisex)</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="KIDS">Kids</option></Select>}</Field>
        <Field label="Brand colour">{(p) => <div className="flex items-center gap-2"><input type="color" value={v("brandColor")} onChange={s("brandColor")} className="h-11 w-14 rounded-lg border border-line" aria-label="Brand colour" /><Input {...p} value={v("brandColor")} onChange={s("brandColor")} /></div>}</Field>
      </div>
      <Field label="About the salon" optional>{(p) => <Textarea {...p} value={v("description")} onChange={s("description")} />}</Field>
      <Field label="Amenities" optional hint="Comma separated, e.g. Air conditioned, Wi-Fi, Card & UPI">{(p) => <Input {...p} value={v("amenitiesText")} onChange={s("amenitiesText")} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parking information" optional>{(p) => <Textarea {...p} className="min-h-[70px]" value={v("parkingInfo")} onChange={s("parkingInfo")} />}</Field>
        <Field label="Accessibility" optional>{(p) => <Textarea {...p} className="min-h-[70px]" value={v("accessibilityInfo")} onChange={s("accessibilityInfo")} />}</Field>
      </div>
      <ImageUpload label="Cover image" value={v("coverUrl")} onChange={(url) => setF({ ...f, coverUrl: url })} />
      <Button onClick={() => m.mutate()} loading={m.isPending}>Save profile</Button>
    </CardBody></Card>
  );
}

function ImageUpload({ label, value, onChange }: { label: string; value: string; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-ink-2">{label} <span className="font-normal text-muted">(optional — we generate artwork otherwise)</span></p>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value && !value.startsWith("gen:") && <img src={value} alt="" className="h-16 w-28 rounded-lg object-cover" />}
        <label className="cursor-pointer rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
          {busy ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            const fd = new FormData(); fd.set("file", file); fd.set("folder", "salons");
            try { const r = await fetch("/api/uploads", { method: "POST", body: fd }); const j = await r.json(); if (!j.ok) throw new Error(j.error?.message); onChange(j.data.url); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
          }} />
        </label>
        {value && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button>}
      </div>
    </div>
  );
}

export function LocationSection({ onSaved }: { onSaved?: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["biz", "location", biz.salonId], queryFn: () => api.get<Record<string, string | number> | null>(biz.api("/location")) });
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => api.get<{ name: string; city: string; lat: number; lng: number }[]>("/api/areas") });
  const [f, setF] = useState<Record<string, string | number> | null>(null);
  useEffect(() => { if (!isLoading && !f) setF(data ?? { addressLine: "", area: "", city: "Chennai", state: "Tamil Nadu", pincode: "", lat: 13.0569, lng: 80.2425 }); }, [data, isLoading, f]);
  const m = useMutation({
    mutationFn: () => { const p = locationSchema.safeParse(f); if (!p.success) throw new Error(firstError(p.error.issues)); return api.put(biz.api("/location"), p.data); },
    onSuccess: () => { toast.success("Location saved"); qc.invalidateQueries({ queryKey: ["biz"] }); onSaved?.(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!f) return <Skeleton className="h-80" />;
  const s = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Card><CardHeader title="Location" description="Customers use this for distance, directions and nearby search." /><CardBody className="space-y-4">
      <Field label="Street address">{(p) => <Input {...p} value={String(f.addressLine ?? "")} onChange={s("addressLine")} placeholder="12, Gandhi Street" />}</Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Area" className="sm:col-span-2">{(p) => (
          <Input {...p} list="bms-areas" value={String(f.area ?? "")} onChange={(e) => { const a = areas.find((x) => x.name === e.target.value); setF({ ...f, area: e.target.value, ...(a ? { city: a.city, lat: a.lat, lng: a.lng, state: a.city === "Chennai" ? "Tamil Nadu" : "Karnataka" } : {}) }); }} />
        )}</Field>
        <datalist id="bms-areas">{areas.map((a) => <option key={a.name} value={a.name}>{a.city}</option>)}</datalist>
        <Field label="City">{(p) => <Input {...p} value={String(f.city ?? "")} onChange={s("city")} />}</Field>
        <Field label="PIN code">{(p) => <Input {...p} inputMode="numeric" value={String(f.pincode ?? "")} onChange={s("pincode")} />}</Field>
      </div>
      <Field label="State">{(p) => <Input {...p} value={String(f.state ?? "")} onChange={s("state")} />}</Field>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Map pin — click or drag to the exact entrance</p>
        <PinPicker lat={Number(f.lat)} lng={Number(f.lng)} onChange={(lat, lng) => setF({ ...f, lat: +lat.toFixed(6), lng: +lng.toFixed(6) })} />
        <p className="mt-1 text-xs text-muted">{Number(f.lat).toFixed(5)}, {Number(f.lng).toFixed(5)}</p>
      </div>
      <Button onClick={() => m.mutate()} loading={m.isPending}>Save location</Button>
    </CardBody></Card>
  );
}

export function HoursSection({ onSaved }: { onSaved?: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["biz", "hours", biz.salonId], queryFn: () => api.get<{ weekday: number; openMinute: number; closeMinute: number }[]>(biz.api("/hours")) });
  const { data: hols = [] } = useQuery({ queryKey: ["biz", "holidays", biz.salonId], queryFn: () => api.get<{ id: string; date: string; isClosed: boolean; openMinute: number | null; closeMinute: number | null; reason: string | null }[]>(biz.api("/holidays")) });
  const [week, setWeek] = useState<Week | null>(null);
  useEffect(() => {
    if (!isLoading && !week) {
      const w: Week = [];
      (data ?? []).forEach((h) => { const d = w.find((x) => x.weekday === h.weekday); const sh = { start: h.openMinute, end: h.closeMinute }; if (d) d.shifts.push(sh); else w.push({ weekday: h.weekday, shifts: [sh] }); });
      setWeek(w.length ? w : [1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, shifts: [{ start: 600, end: 1260 }] })));
    }
  }, [data, isLoading, week]);
  const save = useMutation({
    mutationFn: () => { const p = weeklyHoursSchema.safeParse(week); if (!p.success) throw new Error(firstError(p.error.issues)); return api.put(biz.api("/hours"), p.data); },
    onSuccess: () => { toast.success("Business hours saved"); qc.invalidateQueries({ queryKey: ["biz"] }); onSaved?.(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [h, setH] = useState({ date: toDateKey(new Date(), biz.timezone), isClosed: true, open: "10:00", close: "18:00", reason: "" });
  const addHol = useMutation({
    mutationFn: () => {
      const parse = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
      const p = holidaySchema.safeParse({ date: h.date, isClosed: h.isClosed, openMinute: h.isClosed ? null : parse(h.open), closeMinute: h.isClosed ? null : parse(h.close), reason: h.reason || undefined });
      if (!p.success) throw new Error(firstError(p.error.issues));
      return api.post<{ affectedBookings: { code: string; customerName: string; startsAt: string }[] }>(biz.api("/holidays"), p.data);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["biz"] });
      if (r.affectedBookings.length) toast.warning(`${r.affectedBookings.length} existing booking(s) on this day — please contact or reschedule them.`, { description: r.affectedBookings.map((b) => `${b.code} · ${b.customerName} ${formatTime(b.startsAt, biz.timezone)}`).join(", "), duration: 15000 });
      else toast.success("Saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const delHol = useMutation({ mutationFn: (id: string) => api.del(biz.api(`/holidays/${id}`)), onSuccess: () => qc.invalidateQueries({ queryKey: ["biz"] }) });
  if (!week) return <Skeleton className="h-80" />;
  return (
    <div className="space-y-6">
      <Card><CardHeader title="Business hours" description="Multiple shifts per day are supported (e.g. split lunch closure)." /><CardBody className="space-y-4">
        <ScheduleEditor value={week} onChange={setWeek} defaultShift={{ start: 600, end: 1260 }} />
        <Button onClick={() => save.mutate()} loading={save.isPending}>Save hours</Button>
      </CardBody></Card>
      <Card><CardHeader title="Holidays, closures & special hours" description="Festival hours, temporary closures or holidays for specific dates." /><CardBody className="space-y-4">
        <div className="grid items-end gap-3 sm:grid-cols-[auto_auto_1fr_auto]">
          <label className="text-sm font-semibold">Date<Input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} className="mt-1" /></label>
          <div className="pb-2"><Checkbox checked={h.isClosed} onChange={(v) => setH({ ...h, isClosed: v })} label="Closed all day" /></div>
          {h.isClosed ? <label className="text-sm font-semibold">Reason<Input value={h.reason} onChange={(e) => setH({ ...h, reason: e.target.value })} placeholder="Diwali" className="mt-1" /></label> : (
            <div className="flex items-end gap-2"><label className="text-sm font-semibold">Open<Input type="time" value={h.open} onChange={(e) => setH({ ...h, open: e.target.value })} className="mt-1" /></label><label className="text-sm font-semibold">Close<Input type="time" value={h.close} onChange={(e) => setH({ ...h, close: e.target.value })} className="mt-1" /></label><label className="flex-1 text-sm font-semibold">Note<Input value={h.reason} onChange={(e) => setH({ ...h, reason: e.target.value })} placeholder="Festival hours" className="mt-1" /></label></div>
          )}
          <Button onClick={() => addHol.mutate()} loading={addHol.isPending}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {hols.length === 0 ? <p className="text-sm text-muted">No upcoming special days.</p> : (
          <ul className="divide-y divide-line">{hols.map((x) => <li key={x.id} className="flex items-center justify-between py-2 text-sm"><span className="flex items-center gap-2"><CalendarX className="h-4 w-4 text-muted" /><strong>{formatDateKey(x.date, { year: "numeric" })}</strong> {x.isClosed ? <Badge tone="danger">Closed</Badge> : <Badge tone="info">{formatMinutes(x.openMinute!)}–{formatMinutes(x.closeMinute!)}</Badge>} {x.reason}</span><Button size="iconSm" variant="ghost" onClick={() => delHol.mutate(x.id)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button></li>)}</ul>
        )}
      </CardBody></Card>
    </div>
  );
}

type Policy = { bookingWindowDays: number; minAdvanceMinutes: number; maxBookingMinutes: number; slotIntervalMinutes: number; lockMinutes: number; graceMinutes: number; noShowAfterMinutes: number; lateArrivalMessage: string | null; refundType: string; cancellationTiers: { hoursBefore: number; refundPercent: number }[]; noShowRefundPercent: number; allowReschedule: boolean; rescheduleMinHours: number; maxReschedules: number; walkInPriority: string; waitlistNotifyStrategy: string; notificationPrefs: { newBooking: boolean; cancellations: boolean; reviews: boolean; dailySummary: boolean }; policyText: string | null };

export function PoliciesSection({ onSaved }: { onSaved?: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["biz", "policies", biz.salonId], queryFn: () => api.get<Policy>(biz.api("/policies")) });
  const [p, setP] = useState<Policy | null>(null);
  useEffect(() => { if (data && !p) setP(data); }, [data, p]);
  const m = useMutation({
    mutationFn: () => { const r = policySchema.safeParse(p); if (!r.success) throw new Error(firstError(r.error.issues)); return api.put(biz.api("/policies"), r.data); },
    onSuccess: () => { toast.success("Policies saved"); qc.invalidateQueries({ queryKey: ["biz"] }); onSaved?.(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!p) return <Skeleton className="h-96" />;
  const n = (k: keyof Policy) => ({ value: String(p[k] ?? ""), onChange: (e: { target: { value: string } }) => setP({ ...p, [k]: Number(e.target.value) }) });
  return (
    <div className="space-y-6">
      <Card><CardHeader title="Booking rules" /><CardBody className="grid gap-4 sm:grid-cols-3">
        <Field label="Booking window (days)" hint="How far ahead customers can book">{(x) => <Input {...x} type="number" {...n("bookingWindowDays")} />}</Field>
        <Field label="Minimum advance (min)" hint="e.g. 30 = no bookings within 30 min">{(x) => <Input {...x} type="number" {...n("minAdvanceMinutes")} />}</Field>
        <Field label="Max booking duration (min)">{(x) => <Input {...x} type="number" {...n("maxBookingMinutes")} />}</Field>
        <Field label="Slot interval (min)">{(x) => <Select {...x} {...n("slotIntervalMinutes")}>{[5, 10, 15, 20, 30, 60].map((v) => <option key={v} value={v}>{v}</option>)}</Select>}</Field>
        <Field label="Checkout hold (min)" hint="Slot is locked while the customer pays">{(x) => <Input {...x} type="number" {...n("lockMinutes")} />}</Field>
        <Field label="Walk-in priority">{(x) => <Select {...x} value={p.walkInPriority} onChange={(e) => setP({ ...p, walkInPriority: e.target.value })}><option value="BOOKED_FIRST">Booked customers first</option><option value="ARRIVAL_ORDER">Arrival order</option></Select>}</Field>
      </CardBody></Card>
      <Card><CardHeader title="Late arrival & no-show" description="Late customers keep their booking but don't bump a service already in progress." /><CardBody className="grid gap-4 sm:grid-cols-3">
        <Field label="Grace period (min)">{(x) => <Input {...x} type="number" {...n("graceMinutes")} />}</Field>
        <Field label="Auto no-show after (min)" hint="0 disables auto no-show">{(x) => <Input {...x} type="number" {...n("noShowAfterMinutes")} />}</Field>
        <Field label="No-show refund (%)">{(x) => <Input {...x} type="number" {...n("noShowRefundPercent")} />}</Field>
        <Field label="Late-arrival message" optional className="sm:col-span-3">{(x) => <Textarea {...x} className="min-h-[60px]" value={p.lateArrivalMessage ?? ""} onChange={(e) => setP({ ...p, lateArrivalMessage: e.target.value || null })} placeholder="You have arrived late. Your booking remains active, but service will begin when the required resource/staff becomes available." />}</Field>
      </CardBody></Card>
      <Card><CardHeader title="Cancellation & refunds" /><CardBody className="space-y-4">
        <Field label="Payment refund type">{(x) => <Select {...x} value={p.refundType} onChange={(e) => setP({ ...p, refundType: e.target.value })}><option value="REFUNDABLE">Fully refundable before start</option><option value="PARTIAL">Partially refundable (tiers)</option><option value="NON_REFUNDABLE">Non-refundable</option><option value="TRANSFERABLE">Non-refundable, transferable to another slot</option></Select>}</Field>
        {p.refundType === "PARTIAL" && (
          <div className="space-y-2">
            {p.cancellationTiers.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                Cancel at least <Input type="number" className="h-9 w-20" value={t.hoursBefore} onChange={(e) => setP({ ...p, cancellationTiers: p.cancellationTiers.map((x, j) => (j === i ? { ...x, hoursBefore: Number(e.target.value) } : x)) })} aria-label="Hours before" /> hours before →
                <Input type="number" className="h-9 w-20" value={t.refundPercent} onChange={(e) => setP({ ...p, cancellationTiers: p.cancellationTiers.map((x, j) => (j === i ? { ...x, refundPercent: Number(e.target.value) } : x)) })} aria-label="Refund percent" /> % refund
                <Button variant="ghost" size="iconSm" onClick={() => setP({ ...p, cancellationTiers: p.cancellationTiers.filter((_, j) => j !== i) })} aria-label="Remove tier"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {p.cancellationTiers.length < 5 && <Button size="sm" variant="ghost" onClick={() => setP({ ...p, cancellationTiers: [...p.cancellationTiers, { hoursBefore: 2, refundPercent: 25 }] })}><Plus className="h-4 w-4" /> Add tier</Button>}
            <p className="text-xs text-muted">Cancellations closer than the smallest tier get no refund.</p>
          </div>
        )}
        <Switch checked={p.allowReschedule} onChange={(v) => setP({ ...p, allowReschedule: v })} label="Allow customers to reschedule" />
        {p.allowReschedule && <div className="grid gap-4 sm:grid-cols-2"><Field label="Reschedule up to (hours before)">{(x) => <Input {...x} type="number" {...n("rescheduleMinHours")} />}</Field><Field label="Max reschedules per booking">{(x) => <Input {...x} type="number" {...n("maxReschedules")} />}</Field></div>}
        <Field label="Waitlist notifications">{(x) => <Select {...x} value={p.waitlistNotifyStrategy} onChange={(e) => setP({ ...p, waitlistNotifyStrategy: e.target.value })}><option value="FIFO">Notify the earliest waitlister first</option><option value="BROADCAST">Notify everyone on the waitlist</option></Select>}</Field>
        <Field label="Policy text shown to customers" optional>{(x) => <Textarea {...x} value={p.policyText ?? ""} onChange={(e) => setP({ ...p, policyText: e.target.value || null })} />}</Field>
      </CardBody></Card>
      <Card><CardHeader title="Notification preferences" /><CardBody className="space-y-3">
        <Switch checked={p.notificationPrefs.newBooking} onChange={(v) => setP({ ...p, notificationPrefs: { ...p.notificationPrefs, newBooking: v } })} label="New online bookings" />
        <Switch checked={p.notificationPrefs.cancellations} onChange={(v) => setP({ ...p, notificationPrefs: { ...p.notificationPrefs, cancellations: v } })} label="Cancellations" />
        <Switch checked={p.notificationPrefs.reviews} onChange={(v) => setP({ ...p, notificationPrefs: { ...p.notificationPrefs, reviews: v } })} label="New reviews" />
        <Switch checked={p.notificationPrefs.dailySummary} onChange={(v) => setP({ ...p, notificationPrefs: { ...p.notificationPrefs, dailySummary: v } })} label="Daily summary" />
      </CardBody></Card>
      <Button size="lg" onClick={() => m.mutate()} loading={m.isPending}>Save policies</Button>
    </div>
  );
}

export function PayoutSection({ onSaved }: { onSaved?: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["biz", "salon", biz.salonId], queryFn: () => api.get<{ payoutDetails: Record<string, string>; plan: string; commissionPercent: number | null }>(biz.api("")) });
  const [f, setF] = useState({ accountName: "", accountNumber: "", ifsc: "", upiId: "", gstin: "", pan: "" });
  const m = useMutation({
    mutationFn: () => { const p = payoutSchema.safeParse(f); if (!p.success) throw new Error(firstError(p.error.issues)); return api.put(biz.api("/payout"), p.data); },
    onSuccess: () => { toast.success("Payout details saved"); setF({ ...f, accountNumber: "" }); qc.invalidateQueries({ queryKey: ["biz"] }); onSaved?.(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cur = data?.payoutDetails;
  return (
    <Card><CardHeader title="Payment & payout details" description="Where your online booking revenue is settled (minus platform commission)." /><CardBody className="space-y-4">
      {cur?.ifsc && <p className="rounded-xl bg-success-soft p-3 text-sm text-success">Current: {cur.accountName} · A/C ••••{cur.accountNumberLast4} · {cur.ifsc}{cur.upiId ? ` · ${cur.upiId}` : ""}</p>}
      {data && <p className="text-sm text-muted">Plan: <strong className="text-ink">{data.plan}</strong>{data.commissionPercent != null ? ` · commission ${data.commissionPercent}%` : ""}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account holder name">{(p) => <Input {...p} value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} />}</Field>
        <Field label="Account number" hint="Only the last 4 digits are stored by us.">{(p) => <Input {...p} inputMode="numeric" autoComplete="off" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} />}</Field>
        <Field label="IFSC">{(p) => <Input {...p} className="uppercase" value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} />}</Field>
        <Field label="UPI ID" optional>{(p) => <Input {...p} value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value })} placeholder="salon@okhdfc" />}</Field>
        <Field label="GSTIN" optional>{(p) => <Input {...p} className="uppercase" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} />}</Field>
        <Field label="PAN" optional>{(p) => <Input {...p} className="uppercase" value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} />}</Field>
      </div>
      <Button onClick={() => m.mutate()} loading={m.isPending}>Save payout details</Button>
    </CardBody></Card>
  );
}

export function AuditSection() {
  const biz = useBiz();
  const { data, isLoading } = useQuery({ queryKey: ["biz", "audit", biz.salonId], queryFn: () => api.get<{ id: string; action: string; entity: string; createdAt: string; actorName: string | null; actorRole: string | null; newValue: unknown }[]>(biz.api("/audit")) });
  return (
    <Card><CardHeader title="Audit log" description="Who changed what — bookings, walk-ins, overrides, services, schedules and more." /><CardBody>
      {isLoading ? <Skeleton className="h-64" /> : (
        <ul className="divide-y divide-line text-sm">
          {data?.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-mono text-xs font-semibold text-brand">{a.action}</span> <span className="text-ink-2">by {a.actorName ?? "System"}{a.actorRole ? ` (${a.actorRole.toLowerCase()})` : ""}</span></span>
              <span className="text-xs text-muted">{formatDate(a.createdAt, biz.timezone)} {formatTime(a.createdAt, biz.timezone)}</span>
            </li>
          ))}
          {!data?.length && <li className="py-4 text-muted">No activity yet.</li>}
        </ul>
      )}
    </CardBody></Card>
  );
}
