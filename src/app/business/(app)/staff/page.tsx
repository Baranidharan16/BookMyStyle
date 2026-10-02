"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, KeyRound, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { staffSchema } from "@/lib/validation";
import { formatDate, formatMinutes, toDateKey, WEEKDAY_SHORT, zonedToUtc } from "@/lib/time";
import { useBiz } from "@/components/business/business-context";
import { ScheduleEditor, type Week } from "@/components/business/schedule-editor";
import { Avatar, RatingPill } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/states";

type StaffRow = { id: string; name: string; title: string; phone: string | null; specialization: string | null; experienceYears: number; bio: string | null; avatarUrl: string | null; ratingAvg: number; ratingCount: number; permissions: string[]; availability: string; active: boolean; loginEmail: string | null; serviceIds: string[]; schedule: Week; breaks: { weekday: number; start: number; end: number }[]; leaves: { id: string; startsAt: string; endsAt: string; reason: string | null }[] };
type Svc = { id: string; name: string; active: boolean };
const PERMS = [["CHECK_IN", "Check-in & run services"], ["WALK_IN", "Add walk-ins"], ["MANAGE_BOOKINGS", "Manage bookings (cancel, move, no-show, payments)"], ["VIEW_CUSTOMERS", "View customer contact details"]] as const;

export default function StaffPage() {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["biz", "staff", biz.salonId], queryFn: () => api.get<StaffRow[]>(biz.api("/staff")) });
  const { data: services = [] } = useQuery({ queryKey: ["biz", "services", biz.salonId], queryFn: () => api.get<Svc[]>(biz.api("/services")) });
  const [edit, setEdit] = useState<StaffRow | "new" | null>(null);
  const [leaveFor, setLeaveFor] = useState<StaffRow | null>(null);
  const deactivate = useMutation({ mutationFn: (id: string) => api.del(biz.api(`/staff/${id}`)), onSuccess: () => { toast.success("Staff member deactivated"); qc.invalidateQueries({ queryKey: ["biz"] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="Staff" description="Working hours, breaks, leave and skills drive which stylists can be booked for which services and when." actions={<Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Add staff</Button>} />
      {isLoading ? <Skeleton className="h-64" /> : !data?.length ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No staff yet" action={<Button onClick={() => setEdit("new")}>Add your first stylist</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <Card key={s.id} className={`p-5 ${s.active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <Avatar name={s.name} src={s.avatarUrl} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{s.name}</p>
                  <p className="truncate text-sm text-muted">{s.title} · {s.experienceYears} yrs</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5"><RatingPill value={s.ratingAvg} count={s.ratingCount} />{!s.active && <Badge>Inactive</Badge>}{s.loginEmail && <Badge tone="info"><KeyRound className="h-3 w-3" /> Login</Badge>}</div>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-xs text-ink-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const day = s.schedule.find((x) => x.weekday === d);
                  const brk = s.breaks.filter((b) => b.weekday === d);
                  return <p key={d} className="flex justify-between gap-2"><span className="w-8 font-semibold">{WEEKDAY_SHORT[d]}</span><span className="flex-1 text-right">{day ? day.shifts.map((x) => `${formatMinutes(x.start)}–${formatMinutes(x.end)}`).join(", ") : <span className="text-muted">Off</span>}{brk.length > 0 && <span className="text-muted"> · break {brk.map((b) => formatMinutes(b.start)).join(", ")}</span>}</span></p>;
                })}
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-muted">{services.filter((x) => s.serviceIds.includes(x.id)).map((x) => x.name).join(", ") || "No services assigned"}</p>
              {s.leaves.length > 0 && <p className="mt-2 text-xs font-semibold text-warning">On leave: {s.leaves.map((l) => `${formatDate(l.startsAt, biz.timezone)}${l.reason ? ` (${l.reason})` : ""}`).join(", ")}</p>}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => setEdit(s)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setLeaveFor(s)}><CalendarOff className="h-3.5 w-3.5" /> Leave</Button>
                {s.active && <Button size="sm" variant="ghost" onClick={() => confirm(`Deactivate ${s.name}?`) && deactivate.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <StaffDialog staff={edit === "new" ? null : edit} services={services} onClose={() => setEdit(null)} />}
      {leaveFor && <LeaveDialog staff={leaveFor} onClose={() => setLeaveFor(null)} />}
    </>
  );
}

function StaffDialog({ staff, services, onClose }: { staff: StaffRow | null; services: Svc[]; onClose: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: staff?.name ?? "", title: staff?.title ?? "Stylist", phone: staff?.phone ?? "", specialization: staff?.specialization ?? "", experienceYears: String(staff?.experienceYears ?? 1), bio: staff?.bio ?? "",
    serviceIds: staff?.serviceIds ?? [], schedule: staff?.schedule ?? [1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, shifts: [{ start: 600, end: 1200 }] })),
    breaks: staff?.breaks ?? [1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, start: 780, end: 840 })), permissions: staff?.permissions ?? ["CHECK_IN", "WALK_IN"], loginEmail: staff?.loginEmail ?? "", active: staff?.active ?? true,
  });
  const [err, setErr] = useState<string | null>(null);
  const breakStart = f.breaks[0]?.start ?? 780, breakEnd = f.breaks[0]?.end ?? 840;
  const [hasBreak, setHasBreak] = useState(f.breaks.length > 0);
  const m = useMutation({
    mutationFn: () => {
      const breaks = hasBreak ? f.schedule.filter((d) => d.shifts.some((s) => s.start <= breakStart && s.end >= breakEnd)).map((d) => ({ weekday: d.weekday, start: breakStart, end: breakEnd })) : [];
      const p = staffSchema.safeParse({ ...f, breaks });
      if (!p.success) {
        const i = p.error.issues[0]!;
        setErr(`${i.path.join(".")}: ${i.message}`);
        throw new Error("Please fix the form");
      }
      setErr(null);
      return staff ? api.put<{ tempPassword: string | null }>(biz.api(`/staff/${staff.id}`), p.data) : api.post<{ tempPassword: string | null }>(biz.api("/staff"), p.data);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["biz"] });
      if (r.tempPassword) toast.success(`Login created. Temporary password: ${r.tempPassword}`, { duration: 30000, description: "Share it with the staff member securely." });
      else toast.success("Saved");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return (
    <Dialog open onClose={onClose} size="xl" title={staff ? `Edit ${staff.name}` : "Add staff member"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} loading={m.isPending}>Save</Button></>}>
      {err && <p role="alert" className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{err}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
            <Field label="Role / title">{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Senior Barber" />}</Field>
            <Field label="Phone" optional>{(p) => <Input {...p} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
            <Field label="Experience (years)">{(p) => <Input {...p} type="number" min={0} value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: e.target.value })} />}</Field>
          </div>
          <Field label="Specialization" optional>{(p) => <Input {...p} value={f.specialization} onChange={(e) => setF({ ...f, specialization: e.target.value })} placeholder="Fades, beard styling" />}</Field>
          <Field label="Bio" optional>{(p) => <Textarea {...p} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />}</Field>
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-2">Services they perform</p>
            <div className="flex flex-wrap gap-1.5">
              {services.filter((s) => s.active).map((s) => {
                const on = f.serviceIds.includes(s.id);
                return <button key={s.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, serviceIds: on ? f.serviceIds.filter((x) => x !== s.id) : [...f.serviceIds, s.id] })} className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-brand bg-brand text-white" : "border-line"}`}>{s.name}</button>;
              })}
            </div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-[13px] font-semibold text-ink-2">Staff login & permissions</p>
            <Field label="Login email" optional hint="Creates a staff account with a temporary password.">{(p) => <Input {...p} type="email" value={f.loginEmail} onChange={(e) => setF({ ...f, loginEmail: e.target.value })} />}</Field>
            <div className="mt-3 space-y-2">{PERMS.map(([k, l]) => <Checkbox key={k} checked={f.permissions.includes(k)} onChange={(v) => setF({ ...f, permissions: v ? [...f.permissions, k] : f.permissions.filter((x) => x !== k) })} label={l} />)}</div>
          </div>
          <Checkbox checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active (bookable)" />
        </div>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-2">Working days & hours</p>
            <ScheduleEditor value={f.schedule} onChange={(schedule) => setF({ ...f, schedule })} />
          </div>
          <div className="rounded-xl border border-line p-3">
            <Checkbox checked={hasBreak} onChange={setHasBreak} label="Daily break" />
            {hasBreak && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <input type="time" step={900} value={hhmm(breakStart)} onChange={(e) => setF({ ...f, breaks: [{ weekday: 1, start: parse(e.target.value), end: breakEnd }] })} className="rounded-lg border border-line bg-surface px-2 py-1" aria-label="Break start" /> –
                <input type="time" step={900} value={hhmm(breakEnd)} onChange={(e) => setF({ ...f, breaks: [{ weekday: 1, start: breakStart, end: parse(e.target.value) }] })} className="rounded-lg border border-line bg-surface px-2 py-1" aria-label="Break end" />
                <span className="text-xs text-muted">on every working day</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function LeaveDialog({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const today = toDateKey(new Date(), biz.timezone);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const add = useMutation({
    mutationFn: () => api.post(biz.api(`/staff/${staff.id}/leave`), { startsAt: zonedToUtc(from, 0, biz.timezone).toISOString(), endsAt: zonedToUtc(to, 1439, biz.timezone).toISOString(), reason: reason || undefined }),
    onSuccess: () => { toast.success("Leave added"); qc.invalidateQueries({ queryKey: ["biz"] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(biz.api(`/staff/${staff.id}/leave?leaveId=${id}`)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["biz"] }); onClose(); } });
  return (
    <Dialog open onClose={onClose} title={`Leave for ${staff.name}`} description="Bookings can't be made with this stylist during leave. Existing bookings must be reassigned first." footer={<Button onClick={() => add.mutate()} loading={add.isPending}>Add leave</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></label>
        <label className="text-sm font-semibold">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></label>
      </div>
      <Select className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason"><option value="">Reason (optional)</option><option>Sick leave</option><option>Vacation</option><option>Family function</option><option>Training</option></Select>
      {staff.leaves.length > 0 && <ul className="mt-4 space-y-1">{staff.leaves.map((l) => <li key={l.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-sm"><span>{formatDate(l.startsAt, biz.timezone)} → {formatDate(l.endsAt, biz.timezone)} {l.reason}</span><Button size="sm" variant="ghost" onClick={() => del.mutate(l.id)}>Remove</Button></li>)}</ul>}
    </Dialog>
  );
}
