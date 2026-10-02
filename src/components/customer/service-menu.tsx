"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, Search, Settings2, Users } from "lucide-react";
import { cn, formatDuration, formatINR } from "@/lib/utils";
import { Input } from "../ui/form";
import { buttonClass } from "../ui/button";
import { CategoryIcon } from "./category-icon";

type Svc = { id: string; name: string; description: string | null; price: number; durationMinutes: number; bufferMinutes: number; category: string; categoryIcon: string; options: number; staffRequired: number };

export function ServiceMenu({ services, bookBase }: { services: Svc[]; bookBase: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const cats = useMemo(() => [...new Map(services.map((s) => [s.category, s.categoryIcon])).entries()], [services]);
  const list = services.filter((s) => (!cat || s.category === cat) && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase())));
  const sep = bookBase.includes("?") ? "&" : "?";
  if (!services.length) return <p className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-muted">This salon hasn&apos;t listed services yet.</p>;
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" className="h-10 pl-9" aria-label="Search services" />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          <button onClick={() => setCat(null)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold", !cat ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink-2")}>All</button>
          {cats.map(([c, icon]) => (
            <button key={c} onClick={() => setCat(c === cat ? null : c)} className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold", cat === c ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink-2")}>
              <CategoryIcon name={icon} className="h-3.5 w-3.5" /> {c}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-4 p-4 transition hover:bg-surface-2/50">
            <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand sm:grid">
              <CategoryIcon name={s.categoryIcon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{s.name}</p>
              {s.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{s.description}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                <span className="text-[15px] font-bold text-ink">{formatINR(s.price)}{s.options > 0 && <span className="text-xs font-normal text-muted"> onwards</span>}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDuration(s.durationMinutes)}</span>
                {s.options > 0 && <span className="inline-flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" /> Customisable</span>}
                {s.staffRequired > 1 && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {s.staffRequired} specialists</span>}
              </div>
            </div>
            <Link href={`${bookBase}${sep}service=${s.id}`} className={buttonClass("soft", "sm", "shrink-0")} aria-label={`Book ${s.name}`}>
              Book
            </Link>
          </li>
        ))}
        {!list.length && <li className="p-6 text-center text-sm text-muted">No services match your search.</li>}
      </ul>
    </div>
  );
}
