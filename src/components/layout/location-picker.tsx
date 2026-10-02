"use client";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Crosshair, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useUserLocation } from "../location-context";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/form";
import { Button } from "../ui/button";

type Area = { id: string; name: string; city: string; lat: number; lng: number };

export function LocationPicker({ className, variant = "chip" }: { className?: string; variant?: "chip" | "field" }) {
  const { location, setLocation, requestGps, gpsState } = useUserLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => api.get<Area[]>("/api/areas"), enabled: open, staleTime: 3_600_000 });
  const filtered = useMemo(() => areas.filter((a) => `${a.name} ${a.city}`.toLowerCase().includes(q.toLowerCase())), [areas, q]);
  const grouped = useMemo(() => {
    const m = new Map<string, Area[]>();
    filtered.forEach((a) => m.set(a.city, [...(m.get(a.city) ?? []), a]));
    return [...m.entries()];
  }, [filtered]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          variant === "chip"
            ? "inline-flex max-w-[220px] items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-ink hover:bg-surface-2"
            : "flex h-full w-full items-center gap-2 text-left",
          className,
        )}
        aria-label={`Location: ${location.label}. Change location`}
      >
        <MapPin className="h-4 w-4 shrink-0 text-brand" />
        <span className="truncate">{location.label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Choose your location" description="We use it to show nearby salons and distances. We never track you in the background.">
        <Button
          variant="soft"
          block
          loading={gpsState === "locating"}
          onClick={async () => {
            const l = await requestGps();
            if (l) setOpen(false);
          }}
        >
          <Crosshair className="h-4 w-4" /> Use my current location
        </Button>
        {gpsState === "denied" && <p className="mt-2 text-[13px] text-warning">Location permission is blocked. You can pick your area below instead.</p>}
        {gpsState === "unavailable" && <p className="mt-2 text-[13px] text-warning">We couldn&apos;t get your location. Please choose an area below.</p>}
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search area, e.g. T. Nagar" className="pl-10" aria-label="Search area" autoFocus />
        </div>
        <div className="mt-4 space-y-4">
          {grouped.map(([city, list]) => (
            <div key={city}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{city}</p>
              <div className="flex flex-wrap gap-2">
                {list.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setLocation({ label: `${a.name}, ${a.city}`, lat: a.lat, lng: a.lng, city: a.city, source: "manual" });
                      setOpen(false);
                    }}
                    className={cn("rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand", location.label.startsWith(a.name) && "border-brand bg-brand-soft text-brand")}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!grouped.length && areas.length > 0 && <p className="text-sm text-muted">No matching areas.</p>}
        </div>
      </Dialog>
    </>
  );
}
