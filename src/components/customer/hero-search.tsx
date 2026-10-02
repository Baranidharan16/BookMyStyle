"use client";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, MapPin, Scissors, Search, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { useDebounce } from "@/hooks/use-debounce";
import { addDaysKey, formatDateKey, formatMinutes, toDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useUserLocation } from "../location-context";
import { LocationPicker } from "../layout/location-picker";
import { Button } from "../ui/button";

type Suggest = { salons: { id: string; name: string; slug: string; citySlug: string; area: string }[]; services: string[]; areas: { name: string; city: string; lat: number; lng: number }[]; categories: { slug: string; name: string }[] };

export function HeroSearch({ compact = false, initial }: { compact?: boolean; initial?: { q?: string; date?: string; time?: string } }) {
  const router = useRouter();
  const { location, setLocation } = useUserLocation();
  const [q, setQ] = useState(initial?.q ?? "");
  const [category, setCategory] = useState<string | null>(null);
  const today = toDateKey(new Date());
  const [date, setDate] = useState(initial?.date ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const dq = useDebounce(q, 250);
  const { data } = useQuery({ queryKey: ["suggest", dq], queryFn: () => api.get<Suggest>(`/api/salons/suggest?q=${encodeURIComponent(dq)}`), enabled: dq.trim().length >= 2 });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  type Item = { key: string; label: string; sub?: string; icon: "salon" | "service" | "area" | "category"; go: () => void };
  const items: Item[] = data
    ? [
        ...data.categories.map((c) => ({ key: `c${c.slug}`, label: c.name, sub: "Category", icon: "category" as const, go: () => { setCategory(c.slug); setQ(c.name); setOpen(false); } })),
        ...data.services.map((s) => ({ key: `s${s}`, label: s, sub: "Service", icon: "service" as const, go: () => { setCategory(null); setQ(s); setOpen(false); } })),
        ...data.salons.map((s) => ({ key: `n${s.id}`, label: s.name, sub: s.area, icon: "salon" as const, go: () => router.push(`/salons/${s.citySlug}/${s.slug}`) })),
        ...data.areas.map((a) => ({ key: `a${a.name}`, label: a.name, sub: a.city, icon: "area" as const, go: () => { setLocation({ label: `${a.name}, ${a.city}`, lat: a.lat, lng: a.lng, city: a.city, source: "manual" }); setQ(""); setOpen(false); } })),
      ]
    : [];

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    router.push(`/search${qs({ q: category ? undefined : q.trim() || undefined, category: category ?? undefined, date: date || undefined, time: date && time ? time : undefined, lat: location.lat.toFixed(4), lng: location.lng.toFixed(4), loc: location.label })}`);
  };

  const times: string[] = [];
  for (let m = 8 * 60; m <= 21 * 60; m += 30) times.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  const IconFor = { salon: Store, service: Scissors, area: MapPin, category: Scissors };

  return (
    <form onSubmit={submit} role="search" className={cn("relative rounded-2xl border border-line bg-surface p-2 shadow-pop", compact ? "" : "sm:rounded-3xl")}>
      <div className="grid gap-1.5 md:grid-cols-[1.6fr_1fr_1fr_auto] md:gap-0">
        <div ref={boxRef} className="relative">
          <label className="flex h-14 items-center gap-3 rounded-xl px-3.5 hover:bg-surface-2 md:border-r md:border-line md:rounded-r-none">
            <Search className="h-5 w-5 shrink-0 text-brand" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">What</span>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCategory(null);
                  setOpen(true);
                  setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (!open || !items.length) return;
                  if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(items.length - 1, a + 1)));
                  if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(-1, a - 1)));
                  if (e.key === "Enter" && active >= 0) (e.preventDefault(), items[active]!.go());
                }}
                placeholder="Haircut, facial, salon name…"
                className="w-full bg-transparent text-[15px] font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:outline-none"
                aria-label="Service or salon"
                role="combobox"
                aria-expanded={open && items.length > 0}
                aria-controls="hero-suggest"
                aria-autocomplete="list"
                autoComplete="off"
              />
            </span>
          </label>
          {open && items.length > 0 && (
            <ul id="hero-suggest" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
              {items.map((it, i) => {
                const Icon = IconFor[it.icon];
                return (
                  <li key={it.key} role="option" aria-selected={i === active}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={it.go} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2", i === active && "bg-surface-2")}>
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{it.label}</span>
                        <span className="block text-xs text-muted">{it.sub}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex h-14 items-center gap-3 rounded-xl px-3.5 hover:bg-surface-2 md:rounded-none md:border-r md:border-line">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="pl-6 text-[11px] font-bold uppercase tracking-wider text-muted">Where</span>
            <LocationPicker variant="field" className="text-[15px] font-semibold" />
          </span>
        </div>
        <div className="grid h-14 grid-cols-2 items-center gap-2 rounded-xl px-3.5 hover:bg-surface-2 md:rounded-none">
          <label className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-5 w-5 shrink-0 text-brand" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">When</span>
              <select value={date} onChange={(e) => setDate(e.target.value)} className="min-w-0 bg-transparent text-[15px] font-semibold text-ink focus:outline-none" aria-label="Date">
                <option value="">Any day</option>
                {Array.from({ length: 14 }, (_, i) => addDaysKey(today, i)).map((d, i) => (
                  <option key={d} value={d}>
                    {i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDateKey(d)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className={cn("flex min-w-0 items-center gap-2", !date && "opacity-50")}>
            <Clock className="h-5 w-5 shrink-0 text-brand" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Time</span>
              <select value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} className="min-w-0 bg-transparent text-[15px] font-semibold text-ink focus:outline-none" aria-label="Time">
                <option value="">Any time</option>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {formatMinutes(Number(t.slice(0, 2)) * 60 + Number(t.slice(3)))}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
        <Button type="submit" size="lg" className="h-14 md:ml-2 md:px-7">
          <Search className="h-5 w-5" /> Search
        </Button>
      </div>
    </form>
  );
}
