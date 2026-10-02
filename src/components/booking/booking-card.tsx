import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, MapPin, User } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/time";
import { BookingStatusBadge, PaymentStatusBadge } from "./status";
import { SalonCover } from "../customer/salon-cover";

export type BookingCardData = {
  id: string; code: string; status: string; startsAt: string | Date; endsAt: string | Date; total: number; paymentStatus: string;
  serviceName: string; salonId: string; salonName: string; timezone: string; brandColor: string; staffNames: string | null; resourceNames: string | null; hasReview?: boolean;
};

export function BookingCard({ b }: { b: BookingCardData }) {
  const tz = b.timezone;
  return (
    <Link href={`/customer/bookings/${b.id}`} className="group flex gap-4 rounded-2xl border border-line bg-surface p-3 shadow-card transition hover:shadow-pop sm:p-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24">
        <SalonCover seed={b.salonId} color={b.brandColor} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold group-hover:text-brand">{b.salonName}</p>
            <p className="truncate text-sm text-ink-2">{b.serviceName}</p>
          </div>
          <BookingStatusBadge status={b.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(b.startsAt, tz)}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(b.startsAt, tz)}</span>
          {b.staffNames && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{b.staffNames}</span>}
          {b.resourceNames && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{b.resourceNames}</span>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm"><span className="font-bold">{formatINR(b.total)}</span><PaymentStatusBadge status={b.paymentStatus} /></span>
          <span className="hidden items-center gap-0.5 text-xs font-mono text-muted sm:inline-flex">{b.code}<ChevronRight className="h-4 w-4" /></span>
        </div>
        {b.status === "COMPLETED" && b.hasReview === false && <p className="mt-2 text-xs font-semibold text-brand">★ Rate your visit</p>}
      </div>
    </Link>
  );
}
