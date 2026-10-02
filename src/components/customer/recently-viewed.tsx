"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { SalonCover } from "./salon-cover";

type Recent = { id: string; name: string; slug: string; citySlug: string; brandColor: string; area: string };
const KEY = "bms-recent";

export function trackRecentlyViewed(s: Recent) {
  try {
    const list: Recent[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    localStorage.setItem(KEY, JSON.stringify([s, ...list.filter((x) => x.id !== s.id)].slice(0, 8)));
  } catch {}
}

export function TrackView(props: Recent) {
  useEffect(() => trackRecentlyViewed(props), [props]);
  return null;
}

export function RecentlyViewed() {
  const [list, setList] = useState<Recent[]>([]);
  useEffect(() => {
    try {
      setList(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {}
  }, []);
  if (!list.length) return null;
  return (
    <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6" aria-labelledby="recent">
      <h2 id="recent" className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold">
        <History className="h-5 w-5 text-brand" /> Recently viewed
      </h2>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        {list.map((s) => (
          <Link key={s.id} href={`/salons/${s.citySlug}/${s.slug}`} className="group flex w-64 shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface p-2 pr-4 hover:shadow-card">
            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
              <SalonCover seed={s.id} color={s.brandColor} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold group-hover:text-brand">{s.name}</span>
              <span className="block truncate text-xs text-muted">{s.area}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
