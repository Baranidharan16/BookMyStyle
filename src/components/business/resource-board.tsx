"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Clock, Hourglass, Lock, Sparkles, UserPlus, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatTime, minutesOfDay, zonedToUtc } from "@/lib/time";
import { useSalonLive } from "@/hooks/use-salon-live";
import { useBiz } from "./business-context";
import { BookingActions } from "./booking-actions";
import { BookingDialog } from "./booking-dialog";
import { WalkInForm } from "./walk-in-form";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Input, Select } from "../ui/form";
import { LiveDot, Skeleton, ErrorState } from "../ui/states";

type BoardBooking = { bookingId: string; code: string; status: string; source: string; customerName: string; startsAt: string; endsAt: string; occupiedUntil: string; paymentStatus: string; serviceName: string; staffNames: string | null; lateMinutes: number | null; estimatedStartAt: string | null; overrideConflict: boolean };
type BoardResource = { id: string; name: string; active: boolean; state: string; current: BoardBooking | null; next: BoardBooking[]; timeline: BoardBooking[]; block: { reason: string | null; endsAt: string } | null; upcomingBlocks: { id: string; startsAt: string; endsAt: string; reason: string | null }[] };
type Board = {
  timezone: string; date: string; now: string;
  board: { typeId: string; typeName: string; area: string; resources: BoardResource[] }[];
  summary: { total: number; occupied: number; blocked: number; available: number };
  staff: { id: string; name: string; title: string; availability: string }[];
  queue: { bookingId: string; status: string; estimatedStartAt: string | null; customerName: string; serviceName: string; startsAt: string; lateMinutes: number | null; bookingStatus: string; code: string }[];
};

const STATE_STYLE: Record<string, { label: string; cls: string; tone: "success" | "brand" | "info" | "danger" | "neutral" | "warning" }> = {
  AVAILABLE: { label: "Available", cls: "border-success/30 bg-success-soft/40", tone: "success" },
  IN_SERVICE: { label: "In service", cls: "border-brand/40 bg-brand-soft/50", tone: "brand" },
  BOOKED: { label: "Booked", cls: "border-info/30 bg-info-soft/50", tone: "info" },
  BLOCKED: { label: "Blocked", cls: "border-danger/30 bg-danger-soft/40", tone: "danger" },
  CLEANING: { label: "Cleaning", cls: "border-warning/30 bg-warning-soft/50", tone: "warning" },
  INACTIVE: { label: "Inactive", cls: "border-line bg-surface-2 opacity-60", tone: "neutral" },
};

export function ResourceBoard() {
  const biz = useBiz();
  const { connected } = useSalonLive();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["biz", "board", biz.salonId], queryFn: () => api.get<Board>(biz.api("/board")), refetchInterval: 120_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [blockFor, setBlockFor] = useState<BoardResource | null>(null);
  void tick;

  if (isError) return <ErrorState message="Couldn't load the board." onRetry={() => refetch()} />;
  if (isLoading || !data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44" />)}</div>;

  const tz = data.timezone;
  const nowMin = minutesOfDay(new Date(), tz);
  const allTimeline = data.board.flatMap((g) => g.resources.flatMap((r) => r.timeline));
  const dayStart = Math.min(9 * 60, ...allTimeline.map((b) => minutesOfDay(new Date(b.startsAt), tz)));
  const dayEnd = Math.max(21 * 60, ...allTimeline.map((b) => minutesOfDay(new Date(b.occupiedUntil), tz)));
  const pct = (m: number) => `${((m - dayStart) / (dayEnd - dayStart)) * 100}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success" dot>{data.summary.available} available</Badge>
          <Badge tone="brand" dot>{data.summary.occupied} occupied</Badge>
          {data.summary.blocked > 0 && <Badge tone="danger" dot>{data.summary.blocked} blocked</Badge>}
          <Badge tone="warning" dot>{data.queue.length} waiting</Badge>
        </div>
        {connected ? <LiveDot label="Live" /> : <span className="text-xs text-muted">Reconnecting…</span>}
        <div className="ml-auto flex gap-2">
          {biz.can("WALK_IN") && <Button onClick={() => setWalkIn(true)}><UserPlus className="h-4 w-4" /> Add walk-in</Button>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {data.board.map((g) => (
            <section key={g.typeId} aria-labelledby={`area-${g.typeId}`}>
              <h2 id={`area-${g.typeId}`} className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                {g.area} <span className="font-semibold normal-case tracking-normal">· {g.typeName}s</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {g.resources.map((r) => {
                  const st = STATE_STYLE[r.state] ?? STATE_STYLE.AVAILABLE!;
                  const c = r.current;
                  const progress = c ? Math.min(100, Math.max(0, ((Date.now() - new Date(c.startsAt).getTime()) / (new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime())) * 100)) : 0;
                  return (
                    <Card key={r.id} className={cn("overflow-hidden border-2 p-0 shadow-none", st.cls)}>
                      <div className="flex items-center justify-between gap-2 px-4 pt-3">
                        <p className="text-base font-bold">{r.name}</p>
                        <div className="flex items-center gap-1">
                          <Badge tone={st.tone} dot>{st.label}</Badge>
                          {biz.can("MANAGE_BOOKINGS") && r.active && <button onClick={() => setBlockFor(r)} className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink" aria-label={`Block ${r.name}`} title="Block seat"><Lock className="h-4 w-4" /></button>}
                        </div>
                      </div>
                      <div className="px-4 pb-3 pt-2">
                        {c ? (
                          <button onClick={() => setOpen(c.bookingId)} className="w-full text-left">
                            <p className="truncate font-semibold">{c.customerName} {c.source !== "ONLINE" && <span className="text-xs font-normal text-muted">(walk-in)</span>}</p>
                            <p className="truncate text-[13px] text-ink-2">{c.serviceName}{c.staffNames ? ` · ${c.staffNames}` : ""}</p>
                            <p className="mt-1 text-xs font-semibold tabular-nums text-muted">{formatTime(c.startsAt, tz)}–{formatTime(c.endsAt, tz)} · {c.status.replace("_", " ")}</p>
                            {c.status === "IN_SERVICE" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div>}
                            {c.overrideConflict && <p className="mt-1 text-[11px] font-semibold text-warning">Owner override</p>}
                          </button>
                        ) : r.block ? (
                          <p className="flex items-center gap-1.5 text-sm text-danger"><Wrench className="h-4 w-4" /> {r.block.reason ?? "Blocked"} until {formatTime(r.block.endsAt, tz)}</p>
                        ) : r.state === "CLEANING" ? (
                          <p className="flex items-center gap-1.5 text-sm text-warning"><Sparkles className="h-4 w-4" /> Cleaning / setup</p>
                        ) : (
                          <p className="text-sm text-success">Free now{r.next[0] ? ` · next at ${formatTime(r.next[0].startsAt, tz)}` : " for the rest of the day"}</p>
                        )}
                        {c && <div className="mt-2" onClick={(e) => e.stopPropagation()}><BookingActions b={{ id: c.bookingId, status: c.status, paymentStatus: c.paymentStatus, startsAt: c.startsAt, source: c.source, customerName: c.customerName }} /></div>}
                        {/* day timeline */}
                        <div className="relative mt-3 h-5 overflow-hidden rounded-md bg-surface" aria-hidden>
                          {r.timeline.map((b) => {
                            const s = minutesOfDay(new Date(b.startsAt), tz), e = minutesOfDay(new Date(b.occupiedUntil), tz) || 1440;
                            return <span key={b.bookingId} title={`${b.customerName} ${formatTime(b.startsAt, tz)}`} className={cn("absolute inset-y-0 rounded-sm", b.status === "COMPLETED" ? "bg-ink-2/25" : b.status === "IN_SERVICE" ? "bg-brand" : b.source === "ONLINE" ? "bg-info/70" : "bg-accent/80")} style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} />;
                          })}
                          {r.upcomingBlocks.map((b) => {
                            const s = Math.max(dayStart, minutesOfDay(new Date(b.startsAt), tz)), e = Math.min(dayEnd, minutesOfDay(new Date(b.endsAt), tz) || 1440);
                            return <span key={b.id} className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,var(--danger)_0,var(--danger)_3px,transparent_3px,transparent_6px)] opacity-60" style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} />;
                          })}
                          {nowMin >= dayStart && nowMin <= dayEnd && <span className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: pct(nowMin) }} />}
                        </div>
                        {r.next.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {r.next.slice(0, 2).map((n) => (
                              <button key={n.bookingId} onClick={() => setOpen(n.bookingId)} className="flex w-full justify-between gap-2 text-left text-xs text-ink-2 hover:text-ink">
                                <span className="truncate">{formatTime(n.startsAt, tz)} · {n.customerName}</span>
                                <span className="shrink-0 text-muted">{n.status === "CONFIRMED" ? "booked" : n.status.toLowerCase().replace("_", " ")}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
          {data.board.length === 0 && <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">No seats/resources configured yet. Add them under Seats & resources.</p>}
          <div className="flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-info/70" /> Online</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-accent/80" /> Walk-in</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-brand" /> In service</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-ink-2/25" /> Done</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-danger" /> Now</span>
          </div>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 font-bold"><Hourglass className="h-4 w-4 text-warning" /> Waiting queue</h2>
            {data.queue.length === 0 ? <p className="mt-2 text-sm text-muted">No one waiting.</p> : (
              <ol className="mt-3 space-y-2">
                {data.queue.map((q, i) => (
                  <li key={q.bookingId}>
                    <button onClick={() => setOpen(q.bookingId)} className="flex w-full items-start gap-3 rounded-xl bg-surface-2 p-2.5 text-left hover:bg-surface-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-canvas">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{q.customerName}</span>
                        <span className="block truncate text-xs text-muted">{q.serviceName} · booked {formatTime(q.startsAt, tz)}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {q.status === "READY" && <Badge tone="success">Ready</Badge>}
                          {q.estimatedStartAt && q.status !== "READY" && <Badge tone="warning"><Clock className="h-3 w-3" /> ~{formatTime(q.estimatedStartAt, tz)}</Badge>}
                          {q.lateMinutes ? <Badge tone="danger">{q.lateMinutes}m late</Badge> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <StaffPanel staff={data.staff} />
        </aside>
      </div>

      <BookingDialog bookingId={open} onClose={() => setOpen(null)} />
      <Dialog open={walkIn} onClose={() => setWalkIn(false)} title="Add walk-in" size="lg"><WalkInForm onCreated={() => setWalkIn(false)} /></Dialog>
      {blockFor && <BlockDialog resource={blockFor} tz={tz} date={data.date} onClose={() => setBlockFor(null)} />}
    </div>
  );
}

function StaffPanel({ staff }: { staff: Board["staff"] }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ id, availability }: { id: string; availability: string }) => api.patch(biz.api(`/staff/${id}`), { availability }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["biz"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const tone: Record<string, "success" | "warning" | "neutral" | "brand"> = { AVAILABLE: "success", BUSY: "brand", ON_BREAK: "warning", OFF_DUTY: "neutral" };
  return (
    <Card className="p-4">
      <h2 className="font-bold">Staff status</h2>
      <ul className="mt-3 space-y-2">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.name}</span><span className="block text-xs text-muted">{s.title}</span></span>
            {biz.level !== "STAFF" || biz.staffId === s.id ? (
              <select value={s.availability} onChange={(e) => m.mutate({ id: s.id, availability: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold" aria-label={`${s.name} status`}>
                <option value="AVAILABLE">Available</option><option value="BUSY">Busy</option><option value="ON_BREAK">On break</option><option value="OFF_DUTY">Off duty</option>
              </select>
            ) : <Badge tone={tone[s.availability]}>{s.availability.replace("_", " ").toLowerCase()}</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BlockDialog({ resource, tz, date, onClose }: { resource: BoardResource; tz: string; date: string; onClose: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const now = minutesOfDay(new Date(), tz);
  const toHH = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const [from, setFrom] = useState(toHH(Math.ceil(now / 15) * 15));
  const [to, setTo] = useState(toHH(Math.min(1439, Math.ceil(now / 15) * 15 + 60)));
  const [reason, setReason] = useState("Maintenance");
  const parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const create = useMutation({
    mutationFn: () => api.post(biz.api("/blocks"), { resourceId: resource.id, startsAt: zonedToUtc(date, parse(from), tz).toISOString(), endsAt: zonedToUtc(date, parse(to), tz).toISOString(), reason }),
    onSuccess: () => { toast.success(`${resource.name} blocked`); qc.invalidateQueries({ queryKey: ["biz"] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(biz.api(`/blocks/${id}`)),
    onSuccess: () => { toast.success("Block removed"); qc.invalidateQueries({ queryKey: ["biz"] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onClose={onClose} title={`Block ${resource.name}`} description="Blocked time is removed from online availability immediately." footer={<Button onClick={() => create.mutate()} loading={create.isPending}><Ban className="h-4 w-4" /> Block seat</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">From<Input type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></label>
        <label className="text-sm font-semibold">To<Input type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></label>
      </div>
      <label className="mt-3 block text-sm font-semibold">Reason
        <Select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1"><option>Maintenance</option><option>Cleaning</option><option>Private use</option><option>Staff training</option></Select>
      </label>
      {resource.upcomingBlocks.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Existing blocks</p>
          {resource.upcomingBlocks.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span>{formatTime(b.startsAt, tz)}–{formatTime(b.endsAt, tz)} · {b.reason}</span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(b.id)}>Remove</Button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
