"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { api, qs } from "@/lib/api-client";
import type { SalonCard as SalonCardT } from "@/server/domain/salons";
import { useUserLocation } from "../location-context";
import { SalonCard, SalonCardSkeleton } from "./salon-card";
import { toDateKey } from "@/lib/time";

/** Horizontal rail of salons fetched for the viewer's location (client-side, live). */
export function SalonRail({ title, subtitle, mode, signedIn }: { title: string; subtitle?: string; mode: "nearby" | "available-now"; signedIn: boolean }) {
  const { location } = useUserLocation();
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  let minute = Math.ceil((ist.getHours() * 60 + ist.getMinutes() + 45) / 15) * 15;
  if (minute > 20 * 60 + 30) minute = 20 * 60 + 30;
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const params = mode === "nearby" ? { lat: location.lat, lng: location.lng, sort: "distance", maxDistanceKm: 25, pageSize: 10 } : { lat: location.lat, lng: location.lng, date: toDateKey(now), time, maxDistanceKm: 25, pageSize: 10 };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rail", mode, location.lat, location.lng, time],
    queryFn: () => api.get<{ items: SalonCardT[] }>(`/api/salons${qs(params)}`),
  });
  const more = `/search${qs({ lat: location.lat.toFixed(4), lng: location.lng.toFixed(4), loc: location.label, ...(mode === "available-now" ? { date: toDateKey(now), time } : { sort: "distance" }) })}`;
  if (isError || (!isLoading && !data?.items.length)) {
    return mode === "available-now" ? null : (
      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-2 rounded-2xl border border-dashed border-line-strong p-6 text-sm text-muted">No salons found near {location.label} yet. Try another area from the location menu.</p>
      </section>
    );
  }
  return (
    <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6" aria-labelledby={`rail-${mode}`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id={`rail-${mode}`} className="font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted">{subtitle.replace("{loc}", location.label)}</p>}
        </div>
        <Link href={more} className="inline-flex shrink-0 items-center text-sm font-semibold text-brand hover:underline">
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="w-[78%] shrink-0 sm:w-[300px]">
                <SalonCardSkeleton />
              </div>
            ))
          : data!.items.map((s) => (
              <div key={s.id} className="w-[78%] shrink-0 snap-start sm:w-[300px]">
                <SalonCard salon={s} signedIn={signedIn} query={mode === "available-now" ? `?date=${toDateKey(now)}` : ""} />
              </div>
            ))}
      </div>
    </section>
  );
}
