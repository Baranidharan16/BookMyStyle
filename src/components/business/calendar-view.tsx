"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { addDaysKey, formatDateKey, formatMinutes, minutesOfDay, toDateKey, weekdayOf, WEEKDAY_SHORT, zonedToUtc } from "@/lib/time";
import { useSalonLive } from "@/hooks/use-salon-live";
import { useBiz } from "./business-context";
import { BookingDialog } from "./booking-dialog";
import { Button } from "../ui/button";
import { Segmented } from "../ui/form";
import { Skeleton } from "../ui/states";

type Cal = {
  timezone: string; from: string; days: number;
  dates: { date: string; closed: boolean; closedReason: string | null; hours: { open: number; close: number }[] }[];
  bookings: { id: string; code: string; status: string; source: string; customerName: string; startsAt: string; endsAt: string; occupiedFrom: string; occupiedUntil: string; serviceName: string; total: number; resourceIds: string[]; staffIds: string[] }[];
  resources: { id: string; name: string; typeName: string }[];
  staff: { id: string; name: string; title: string; schedules: { weekday: number; startMinute: number; endMinute: number }[]; breaks: { weekday: number; startMinute: number; endMinute: number }[]; leaves: { startsAt: string; endsAt: string; reason: string | null }[] }[];
  blocks: { id: string; resourceId: string; startsAt: string; endsAt: string; reason: string | null }[];
};

const PX = 1.3; // px per minute
const SNAP = 15;
const COLOR: Record<string, string> = {
  CONFIRMED: "bg-info-soft border-info/40 text-ink",
  PAYMENT_PENDING: "bg-surface-2 border-dashed border-line-strong text-muted",
  CHECKED_IN: "bg-accent-soft border-accent/50 text-ink",
  WAITING: "bg-warning-soft border-warning/50 text-ink",
  IN_SERVICE: "bg-brand text-white border-brand",
  COMPLETED: "bg-surface-3 border-line text-ink-2",
};

export function CalendarView() {
  const biz = useBiz();
  useSalonLive();
  const qc = useQueryClient();
  const today = toDateKey(new Date(), biz.timezone);
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [axis, setAxis] = useState<"resources" | "staff">("resources");
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "day") return { from: date, days: 1 };
    if (view === "week") return { from: addDaysKey(date, -((weekdayOf(date) + 6) % 7)), days: 7 };
    const first = `${date.slice(0, 8)}01`;
    const start = addDaysKey(first, -((weekdayOf(first) + 6) % 7));
    return { from: start, days: 42 };
  }, [view, date]);

  const { data, isLoading } = useQuery({ queryKey: ["biz", "calendar", biz.salonId, range.from, range.days], queryFn: () => api.get<Cal>(biz.api(`/calendar?from=${range.from}&days=${range.days}`)) });
  const move = useMutation({
    mutationFn: (v: { id: string; startsAt: string; resourceId?: string | null; staffId?: string | null }) => api.post(biz.api(`/bookings/${v.id}/move`), { startsAt: v.startsAt, resourceId: v.resourceId, staffId: v.staffId }),
    onSuccess: () => { toast.success("Booking moved"); qc.invalidateQueries({ queryKey: ["biz"] }); },
    onError: (e) => { toast.error(errorMessage(e)); qc.invalidateQueries({ queryKey: ["biz", "calendar"] }); },
  });

  const step = (dir: number) => setDate(view === "day" ? addDaysKey(date, dir) : view === "week" ? addDaysKey(date, dir * 7) : (() => { const [y, m] = date.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + dir, 1)); return d.toISOString().slice(0, 10); })());
  const title = view === "month" ? formatDateKey(`${date.slice(0, 8)}15`, { month: "long", year: "numeric", weekday: undefined, day: undefined }) : view === "week" ? `${formatDateKey(range.from)} – ${formatDateKey(addDaysKey(range.from, 6))}` : formatDateKey(date, { weekday: "long", month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="iconSm" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(today)}>Today</Button>
          <Button variant="secondary" size="iconSm" onClick={() => step(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          {view === "day" && <Segmented size="sm" value={axis} onChange={setAxis} options={[{ value: "resources", label: "Seats" }, { value: "staff", label: "Staff" }]} />}
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        </div>
      </div>

      {isLoading || !data ? <Skeleton className="h-[600px]" /> : view === "day" ? (
        <DayGrid data={data} date={date} axis={axis} dragId={dragId} setDragId={setDragId} onOpen={setOpen} onMove={(v) => move.mutate(v)} canMove={biz.can("MANAGE_BOOKINGS")} />
      ) : view === "week" ? (
        <div className="grid gap-2 overflow-x-auto md:grid-cols-7">
          {data.dates.map((d) => {
            const list = data.bookings.filter((b) => toDateKey(new Date(b.startsAt), data.timezone) === d.date);
            return (
              <div key={d.date} className={cn("min-h-40 rounded-2xl border border-line bg-surface p-2", d.closed && "bg-surface-2", d.date === today && "ring-2 ring-brand/30")}>
                <button onClick={() => { setDate(d.date); setView("day"); }} className="mb-2 flex w-full items-baseline justify-between px-1 text-left">
                  <span className="text-xs font-bold uppercase text-muted">{WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
                  <span className="text-lg font-bold">{Number(d.date.slice(8))}</span>
                </button>
                {d.closed ? <p className="px-1 text-xs text-muted">Closed{d.closedReason ? ` · ${d.closedReason}` : ""}</p> : (
                  <ul className="space-y-1">
                    {list.slice(0, 12).map((b) => (
                      <li key={b.id}><button onClick={() => setOpen(b.id)} className={cn("w-full truncate rounded-lg border px-2 py-1 text-left text-[11px]", COLOR[b.status] ?? COLOR.CONFIRMED)}>{formatMinutes(minutesOfDay(new Date(b.startsAt), data.timezone))} {b.customerName}</button></li>
                    ))}
                    {list.length > 12 && <li className="px-1 text-[11px] font-semibold text-brand">+{list.length - 12} more</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold uppercase text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {data.dates.map((d) => {
              const n = data.bookings.filter((b) => toDateKey(new Date(b.startsAt), data.timezone) === d.date && b.status !== "PAYMENT_PENDING").length;
              const inMonth = d.date.slice(0, 7) === date.slice(0, 7);
              return (
                <button key={d.date} onClick={() => { setDate(d.date); setView("day"); }} className={cn("aspect-square rounded-xl border border-line p-1.5 text-left sm:aspect-[4/3]", inMonth ? "bg-surface" : "bg-surface-2/50 text-muted", d.date === today && "ring-2 ring-brand", d.closed && "bg-[repeating-linear-gradient(45deg,transparent_0,transparent_6px,var(--surface-3)_6px,var(--surface-3)_7px)]")}>
                  <span className="text-sm font-bold">{Number(d.date.slice(8))}</span>
                  {d.closed ? <span className="block text-[10px] text-muted">Closed</span> : n > 0 && <span className="mt-1 block rounded-md bg-brand-soft px-1 text-[10px] font-bold text-brand sm:text-xs">{n} booking{n > 1 ? "s" : ""}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <BookingDialog bookingId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function DayGrid({ data, date, axis, dragId, setDragId, onOpen, onMove, canMove }: { data: Cal; date: string; axis: "resources" | "staff"; dragId: string | null; setDragId: (s: string | null) => void; onOpen: (id: string) => void; onMove: (v: { id: string; startsAt: string; resourceId?: string | null; staffId?: string | null }) => void; canMove: boolean }) {
  const tz = data.timezone;
  const day = data.dates[0]!;
  const wd = weekdayOf(date);
  const open = day.hours.length ? Math.min(...day.hours.map((h) => h.open)) : 9 * 60;
  const close = day.hours.length ? Math.max(...day.hours.map((h) => h.close)) : 21 * 60;
  const start = Math.floor(Math.min(open, ...data.bookings.map((b) => minutesOfDay(new Date(b.occupiedFrom), tz))) / 60) * 60;
  const end = Math.ceil(Math.max(close, ...data.bookings.map((b) => minutesOfDay(new Date(b.occupiedUntil), tz) || 1440)) / 60) * 60;
  const height = (end - start) * PX;
  const cols = axis === "resources" ? data.resources.map((r) => ({ id: r.id, title: r.name, sub: r.typeName })) : data.staff.map((s) => ({ id: s.id, title: s.name, sub: s.title }));
  const nowMin = date === toDateKey(new Date(), tz) ? minutesOfDay(new Date(), tz) : null;
  const y = (m: number) => (m - start) * PX;

  if (day.closed) return <p className="rounded-2xl border border-line bg-surface p-10 text-center text-muted">Closed on this day{day.closedReason ? ` — ${day.closedReason}` : ""}.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-surface">
          <div className="h-12 border-b border-line" />
          <div className="relative" style={{ height }}>
            {Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60).map((m) => (
              <span key={m} className="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold text-muted" style={{ top: y(m) }}>{formatMinutes(m).replace(":00", "")}</span>
            ))}
          </div>
        </div>
        {cols.map((c) => {
          const list = data.bookings.filter((b) => (axis === "resources" ? b.resourceIds : b.staffIds).includes(c.id));
          const st = axis === "staff" ? data.staff.find((s) => s.id === c.id) : null;
          const shifts = st?.schedules.filter((s) => s.weekday === wd) ?? [];
          const breaks = st?.breaks.filter((s) => s.weekday === wd) ?? [];
          return (
            <div key={c.id} className="w-44 shrink-0 border-r border-line last:border-r-0">
              <div className="sticky top-0 z-10 flex h-12 flex-col justify-center border-b border-line bg-surface px-2">
                <p className="truncate text-sm font-bold">{c.title}</p>
                <p className="truncate text-[11px] text-muted">{c.sub}</p>
              </div>
              <div
                className="relative"
                style={{ height }}
                onDragOver={(e) => canMove && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragId) return;
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const offset = Number(e.dataTransfer.getData("offset") || 0);
                  const m = Math.round((start + (e.clientY - rect.top - offset) / PX) / SNAP) * SNAP;
                  onMove({ id: dragId, startsAt: zonedToUtc(date, m, tz).toISOString(), ...(axis === "resources" ? { resourceId: c.id } : { staffId: c.id }) });
                  setDragId(null);
                }}
              >
                {Array.from({ length: (end - start) / 60 }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * 60 * PX }} />)}
                {/* closed time */}
                {[{ s: start, e: open }, { s: close, e: end }, ...day.hours.slice(1).map((h, i) => ({ s: day.hours[i]!.close, e: h.open }))].filter((x) => x.e > x.s).map((x, i) => (
                  <div key={`c${i}`} className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,transparent_0,transparent_5px,var(--surface-3)_5px,var(--surface-3)_6px)]" style={{ top: y(x.s), height: (x.e - x.s) * PX }} />
                ))}
                {axis === "staff" && (
                  <>
                    {shifts.length === 0 && <div className="absolute inset-0 grid place-items-center bg-surface-2/70 text-xs font-semibold text-muted">Off today</div>}
                    {breaks.map((b, i) => <div key={i} className="absolute inset-x-1 grid place-items-center rounded-md bg-warning-soft text-[10px] font-semibold text-warning" style={{ top: y(b.startMinute), height: (b.endMinute - b.startMinute) * PX }}>Break</div>)}
                    {st?.leaves.map((l, i) => <div key={`l${i}`} className="absolute inset-x-0 grid place-items-center bg-danger-soft/70 text-xs font-semibold text-danger" style={{ top: 0, height }}>On leave{l.reason ? ` · ${l.reason}` : ""}</div>)}
                  </>
                )}
                {axis === "resources" && data.blocks.filter((b) => b.resourceId === c.id).map((b) => {
                  const s = Math.max(start, minutesOfDay(new Date(b.startsAt), tz)), e = Math.min(end, minutesOfDay(new Date(b.endsAt), tz) || 1440);
                  return <div key={b.id} className="absolute inset-x-1 grid place-items-center rounded-md bg-danger-soft text-[10px] font-semibold text-danger" style={{ top: y(s), height: Math.max(12, (e - s) * PX) }}>Blocked · {b.reason}</div>;
                })}
                {list.map((b) => {
                  const s = minutesOfDay(new Date(b.startsAt), tz), e = minutesOfDay(new Date(b.endsAt), tz) || 1440;
                  const ou = minutesOfDay(new Date(b.occupiedUntil), tz) || 1440;
                  const movable = canMove && ["CONFIRMED", "CHECKED_IN", "WAITING"].includes(b.status);
                  return (
                    <div key={b.id}>
                      {ou > e && <div className="absolute inset-x-1.5 rounded-b-md bg-surface-3/70" style={{ top: y(e), height: (ou - e) * PX }} title="Cleanup buffer" />}
                      <button
                        draggable={movable}
                        onDragStart={(ev) => { setDragId(b.id); ev.dataTransfer.setData("offset", String(ev.clientY - (ev.currentTarget as HTMLElement).getBoundingClientRect().top)); }}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => onOpen(b.id)}
                        className={cn("absolute inset-x-1 flex flex-col items-start justify-start overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md", COLOR[b.status] ?? COLOR.CONFIRMED, dragId === b.id && "opacity-50", movable && "cursor-grab active:cursor-grabbing")}
                        style={{ top: y(s), height: Math.max(22, (e - s) * PX - 2) }}
                        title={`${b.customerName} · ${b.serviceName}`}
                      >
                        <span className="flex items-center gap-0.5 font-bold">{movable && <GripVertical className="h-3 w-3 shrink-0 opacity-50" />}<span className="truncate">{b.customerName}</span></span>
                        <span className="block truncate opacity-80">{formatMinutes(s)} · {b.serviceName}</span>
                        {b.source !== "ONLINE" && <span className="block text-[10px] font-semibold opacity-70">Walk-in</span>}
                      </button>
                    </div>
                  );
                })}
                {nowMin != null && nowMin >= start && nowMin <= end && <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: y(nowMin) }} />}
              </div>
            </div>
          );
        })}
        {cols.length === 0 && <p className="p-10 text-sm text-muted">Nothing to show — add {axis === "resources" ? "seats/resources" : "staff"} first.</p>}
      </div>
    </div>
  );
}
