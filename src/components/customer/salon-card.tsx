import Link from "next/link";
import { Clock, MapPin, Tag } from "lucide-react";
import { cn, formatDuration, formatINR, formatKm } from "@/lib/utils";
import { formatMinutes } from "@/lib/time";
import type { SalonCard as SalonCardT } from "@/server/domain/salons";
import { RatingPill } from "../ui/misc";
import { Badge } from "../ui/badge";
import { SalonCover } from "./salon-cover";
import { FavoriteButton } from "./favorite-button";

export function SalonCard({ salon, signedIn, layout = "grid", query = "" }: { salon: SalonCardT; signedIn: boolean; layout?: "grid" | "row"; query?: string }) {
  const href = `/salons/${salon.citySlug}/${salon.slug}${query}`;
  const av = salon.availability;
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-pop focus-visible:-translate-y-0.5",
        layout === "grid" ? "flex-col" : "flex-row",
      )}
    >
      <div className={cn("relative shrink-0 overflow-hidden", layout === "grid" ? "aspect-[16/10] w-full" : "w-32 sm:w-48")}>
        <SalonCover seed={salon.id} color={salon.brandColor} src={salon.coverUrl} className="transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        {salon.offer && (
          <span className="absolute bottom-2 left-2 inline-flex max-w-[85%] items-center gap-1 truncate rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold text-white shadow">
            <Tag className="h-3 w-3 shrink-0" /> <span className="truncate">{salon.offer}</span>
          </span>
        )}
        <FavoriteButton salonId={salon.id} signedIn={signedIn} className="absolute right-2 top-2" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[15px] font-bold text-ink group-hover:text-brand">{salon.name}</h3>
          <RatingPill value={salon.ratingAvg} />
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {salon.area}, {salon.city}
          </span>
          {salon.distanceKm != null && <span className="shrink-0">· {formatKm(salon.distanceKm)}</span>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={salon.openNow ? "success" : "neutral"} dot>
            {salon.openNow ? "Open now" : "Closed now"}
          </Badge>
          {salon.genderType !== "UNISEX" && <Badge>{salon.genderType === "MEN" ? "Men" : salon.genderType === "WOMEN" ? "Women" : "Kids"}</Badge>}
          {salon.travelMinutes != null && <span className="text-xs text-muted">~{salon.travelMinutes} min away</span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            {salon.matchedService ? (
              <p className="truncate text-[13px] text-ink-2">
                {salon.matchedService.name} · <span className="font-bold text-ink">{formatINR(salon.matchedService.price)}</span>
                <span className="text-muted"> · {formatDuration(salon.matchedService.durationMinutes)}</span>
              </p>
            ) : salon.startingPrice != null ? (
              <p className="text-[13px] text-muted">
                Starts at <span className="font-bold text-ink">{formatINR(salon.startingPrice)}</span>
              </p>
            ) : null}
          </div>
          {av && (
            <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold", av.requestedAvailable ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              <Clock className="h-3 w-3" />
              {av.requestedAvailable ? "Available" : av.nearestMinute != null ? `Next ${formatMinutes(av.nearestMinute)}` : "Full"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function SalonCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="aspect-[16/10] animate-pulse-soft bg-surface-3" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse-soft rounded bg-surface-3" />
        <div className="h-3 w-1/2 animate-pulse-soft rounded bg-surface-3" />
        <div className="h-3 w-1/3 animate-pulse-soft rounded bg-surface-3" />
      </div>
    </div>
  );
}
