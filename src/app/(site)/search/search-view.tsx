"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { List, Map as MapIcon, SearchX, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage, qs } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDateKey, formatMinutes } from "@/lib/time";
import type { SalonCard as SalonCardT } from "@/server/domain/salons";
import { useUserLocation } from "@/components/location-context";
import { HeroSearch } from "@/components/customer/hero-search";
import { SalonCard, SalonCardSkeleton } from "@/components/customer/salon-card";
import { SalonMapLazy } from "@/components/map/salon-map-lazy";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { CategoryIcon } from "@/components/customer/category-icon";

type Cat = { slug: string; name: string; icon: string };
type Result = { items: SalonCardT[]; total: number; page: number; pageSize: number };

const FILTER_KEYS = ["category", "priceMax", "ratingMin", "maxDistanceKm", "offers", "openNow", "gender", "maxDuration"] as const;

export function SearchView({ signedIn, categories }: { signedIn: boolean; categories: Cat[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { location, setLocation } = useUserLocation();
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // URL → location sync (a shared search link keeps its location)
  useEffect(() => {
    const lat = sp.get("lat"), lng = sp.get("lng");
    if (lat && lng && (Math.abs(+lat - location.lat) > 0.0005 || Math.abs(+lng - location.lng) > 0.0005)) {
      setLocation({ label: sp.get("loc") ?? "Selected location", lat: +lat, lng: +lng, source: "manual" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    sp.forEach((v, k) => (p[k] = v));
    p.lat = location.lat.toFixed(4);
    p.lng = location.lng.toFixed(4);
    delete p.loc;
    return p;
  }, [sp, location]);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v == null || v === "" ? next.delete(k) : next.set(k, v)));
    if (!("page" in patch)) next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["search", params],
    queryFn: () => api.get<Result>(`/api/salons${qs({ ...params, pageSize: 12 })}`),
    placeholderData: keepPreviousData,
  });

  const activeFilters = FILTER_KEYS.filter((k) => sp.get(k));
  const cat = categories.find((c) => c.slug === sp.get("category"));
  const heading = cat ? cat.name : sp.get("q") ? `“${sp.get("q")}”` : "Salons";
  const page = Number(sp.get("page") ?? 1);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const dateLabel = sp.get("date") ? `${formatDateKey(sp.get("date")!)}${sp.get("time") ? `, ${formatMinutes(Number(sp.get("time")!.slice(0, 2)) * 60 + Number(sp.get("time")!.slice(3)))}` : ""}` : null;
  const qSuffix = sp.get("date") ? `?date=${sp.get("date")}` : "";

  const Filters = (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-bold">Service</p>
        <Select value={sp.get("category") ?? ""} onChange={(e) => set({ category: e.target.value || null })} aria-label="Service category">
          <option value="">All services</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Distance</p>
        <Segmented size="sm" value={sp.get("maxDistanceKm") ?? ""} onChange={(v) => set({ maxDistanceKm: v || null })} options={[{ value: "", label: "Any" }, { value: "2", label: "2 km" }, { value: "5", label: "5 km" }, { value: "10", label: "10 km" }]} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Rating</p>
        <Segmented size="sm" value={sp.get("ratingMin") ?? ""} onChange={(v) => set({ ratingMin: v || null })} options={[{ value: "", label: "Any" }, { value: "3.5", label: "3.5+" }, { value: "4", label: "4.0+" }, { value: "4.5", label: "4.5+" }]} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Max price</p>
        <Segmented size="sm" value={sp.get("priceMax") ?? ""} onChange={(v) => set({ priceMax: v || null })} options={[{ value: "", label: "Any" }, { value: "300", label: "₹300" }, { value: "800", label: "₹800" }, { value: "2000", label: "₹2k" }]} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Service duration</p>
        <Segmented size="sm" value={sp.get("maxDuration") ?? ""} onChange={(v) => set({ maxDuration: v || null })} options={[{ value: "", label: "Any" }, { value: "30", label: "≤30m" }, { value: "60", label: "≤1h" }, { value: "120", label: "≤2h" }]} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">For</p>
        <Segmented size="sm" value={sp.get("gender") ?? ""} onChange={(v) => set({ gender: v || null })} options={[{ value: "", label: "All" }, { value: "MEN", label: "Men" }, { value: "WOMEN", label: "Women" }, { value: "KIDS", label: "Kids" }]} />
      </div>
      <div className="space-y-3">
        <Checkbox checked={sp.get("openNow") === "1"} onChange={(v) => set({ openNow: v ? "1" : null })} label="Open now" />
        <Checkbox checked={sp.get("offers") === "1"} onChange={(v) => set({ offers: v ? "1" : null })} label="Has offers" />
      </div>
      {activeFilters.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>
          <X className="h-4 w-4" /> Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 hidden md:block">
        <HeroSearch compact initial={{ q: sp.get("q") ?? "", date: sp.get("date") ?? "", time: sp.get("time") ?? "" }} />
      </div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:hidden">
        {categories.slice(0, 12).map((c) => (
          <button key={c.slug} onClick={() => set({ category: sp.get("category") === c.slug ? null : c.slug })} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold", sp.get("category") === c.slug ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2")}>
            <CategoryIcon name={c.icon} className="h-3.5 w-3.5" /> {c.name}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-line bg-surface p-5">
            <p className="mb-4 flex items-center gap-2 font-bold">
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </p>
            {Filters}
          </div>
        </aside>
        <section aria-live="polite" aria-busy={isFetching}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold sm:text-3xl">{heading} near {location.label.split(",")[0]}</h1>
              <p className="text-sm text-muted">
                {data ? `${data.total} salon${data.total === 1 ? "" : "s"}` : "Searching…"}
                {dateLabel && <> · that can serve you around <strong className="text-ink">{dateLabel}</strong></>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}
              </Button>
              <Select value={sp.get("sort") ?? "relevance"} onChange={(e) => set({ sort: e.target.value === "relevance" ? null : e.target.value })} className="h-9 w-auto py-0 text-sm" aria-label="Sort by">
                <option value="relevance">Relevance</option>
                <option value="distance">Distance</option>
                <option value="rating">Rating</option>
                <option value="price">Price: low to high</option>
                {sp.get("date") && <option value="availability">Availability</option>}
              </Select>
              <Segmented size="sm" value={view} onChange={setView} options={[{ value: "list", label: <List className="h-4 w-4" aria-label="List view" /> }, { value: "map", label: <MapIcon className="h-4 w-4" aria-label="Map view" /> }]} />
            </div>
          </div>

          {isError ? (
            <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <SalonCardSkeleton key={i} />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title={dateLabel ? "No availability for this time" : "No salons found near your location"}
              description={dateLabel ? "Every matching salon is fully booked around then. Try another time, a nearby date, or widen the distance." : "Try a different service, remove some filters, or change your location."}
              action={
                <Button variant="secondary" onClick={() => set({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), time: null })}>
                  Clear filters & time
                </Button>
              }
            />
          ) : view === "map" ? (
            <SalonMapLazy
              center={[location.lat, location.lng]}
              you={location.source !== "default" ? [location.lat, location.lng] : null}
              height={560}
              salons={data.items.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, ratingAvg: s.ratingAvg, distanceKm: s.distanceKm, startingPrice: s.matchedService?.price ?? s.startingPrice, service: s.matchedService?.name, href: `/salons/${s.citySlug}/${s.slug}${qSuffix}` }))}
            />
          ) : (
            <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3 transition-opacity", isFetching && "opacity-60")}>
              {data.items.map((s) => (
                <SalonCard key={s.id} salon={s} signedIn={signedIn} query={qSuffix} />
              ))}
            </div>
          )}

          {data && totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
                Previous
              </Button>
              <span className="px-3 text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => set({ page: String(page + 1) })}>
                Next
              </Button>
            </nav>
          )}
        </section>
      </div>
      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" footer={<Button onClick={() => setFiltersOpen(false)}>Show {data?.total ?? ""} results</Button>}>
        {Filters}
      </Dialog>
    </div>
  );
}
