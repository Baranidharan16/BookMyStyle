"use client";
import { Plus, X } from "lucide-react";
import { toHHMM, WEEKDAY_SHORT } from "@/lib/time";
import { cn } from "@/lib/utils";

export type Shift = { start: number; end: number };
export type Week = { weekday: number; shifts: Shift[] }[];

const parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Weekly multi-shift editor (business hours & staff rosters). */
export function ScheduleEditor({ value, onChange, defaultShift = { start: 600, end: 1200 } }: { value: Week; onChange: (w: Week) => void; defaultShift?: Shift }) {
  const get = (d: number) => value.find((x) => x.weekday === d)?.shifts ?? [];
  const set = (d: number, shifts: Shift[]) => onChange([...value.filter((x) => x.weekday !== d), ...(shifts.length ? [{ weekday: d, shifts }] : [])].sort((a, b) => a.weekday - b.weekday));
  return (
    <div className="space-y-2">
      {ORDER.map((d) => {
        const shifts = get(d);
        const on = shifts.length > 0;
        return (
          <div key={d} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
            <label className="flex w-24 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={on} onChange={(e) => set(d, e.target.checked ? [defaultShift] : [])} className="h-4 w-4 accent-[var(--brand)]" />
              {WEEKDAY_SHORT[d]}
            </label>
            {on ? (
              <>
                {shifts.map((s, i) => (
                  <span key={i} className={cn("flex items-center gap-1 rounded-lg bg-surface-2 px-1.5 py-1", s.start >= s.end && "ring-1 ring-danger")}>
                    <input type="time" step={900} value={toHHMM(s.start)} onChange={(e) => set(d, shifts.map((x, j) => (j === i ? { ...x, start: parse(e.target.value) } : x)))} className="bg-transparent text-sm" aria-label={`${WEEKDAY_SHORT[d]} start`} />
                    –
                    <input type="time" step={900} value={toHHMM(s.end === 1440 ? 1439 : s.end)} onChange={(e) => set(d, shifts.map((x, j) => (j === i ? { ...x, end: parse(e.target.value) } : x)))} className="bg-transparent text-sm" aria-label={`${WEEKDAY_SHORT[d]} end`} />
                    {shifts.length > 1 && <button type="button" onClick={() => set(d, shifts.filter((_, j) => j !== i))} aria-label="Remove shift" className="text-muted hover:text-danger"><X className="h-3.5 w-3.5" /></button>}
                  </span>
                ))}
                {shifts.length < 3 && <button type="button" onClick={() => set(d, [...shifts, { start: Math.min(1380, (shifts.at(-1)?.end ?? 600) + 60), end: Math.min(1440, (shifts.at(-1)?.end ?? 600) + 240) }])} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"><Plus className="h-3.5 w-3.5" /> Shift</button>}
                <button type="button" onClick={() => onChange(ORDER.map((wd) => ({ weekday: wd, shifts: wd === d || get(wd).length ? [...shifts] : [] })).filter((x) => x.shifts.length))} className="ml-auto text-xs font-semibold text-muted hover:text-ink">Copy to open days</button>
              </>
            ) : <span className="text-sm text-muted">Closed / off</span>}
          </div>
        );
      })}
    </div>
  );
}
