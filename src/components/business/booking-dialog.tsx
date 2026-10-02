"use client";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatDuration, formatINR } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/time";
import type { BookingDetail } from "@/server/domain/bookings";
import { Dialog } from "../ui/dialog";
import { Skeleton } from "../ui/states";
import { Badge } from "../ui/badge";
import { BookingStatusBadge, PaymentStatusBadge } from "../booking/status";
import { BookingActions } from "./booking-actions";

export function BookingDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { data: d, isLoading } = useQuery({ queryKey: ["booking", bookingId], queryFn: () => api.get<BookingDetail>(`/api/bookings/${bookingId}`), enabled: !!bookingId });
  const tz = d?.salon.timezone;
  return (
    <Dialog open={!!bookingId} onClose={onClose} size="lg" title={d ? `${d.booking.customerName} · ${d.booking.code}` : "Booking"}>
      {isLoading || !d ? (
        <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24" /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={d.booking.status} />
            <PaymentStatusBadge status={d.booking.paymentStatus} />
            <Badge>{d.booking.source === "ONLINE" ? "Online" : d.booking.source === "WALK_IN" ? "Walk-in" : "Salon booking"}</Badge>
            {d.booking.overrideConflict && <Badge tone="warning">Owner override</Badge>}
            {d.booking.lateMinutes ? <Badge tone="warning">{d.booking.lateMinutes} min late</Badge> : null}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p><span className="text-muted">Service: </span><strong>{d.items.map((i) => i.name).join(" · ")}</strong></p>
            <p><span className="text-muted">When: </span><strong>{formatDate(d.booking.startsAt, tz)} {formatTime(d.booking.startsAt, tz)}–{formatTime(d.booking.endsAt, tz)}</strong> ({formatDuration(d.booking.durationMinutes)})</p>
            <p><span className="text-muted">Stylist: </span><strong>{d.staff.map((s) => s.name).join(", ") || "—"}</strong></p>
            <p><span className="text-muted">Seat: </span><strong>{d.resources.map((r) => r.name).join(", ") || "—"}</strong></p>
            <p><span className="text-muted">Amount: </span><strong>{formatINR(d.booking.total, { decimals: true })}</strong>{d.booking.discount ? ` (−${formatINR(d.booking.discount)} coupon)` : ""}</p>
            {d.booking.customerPhone && <p className="flex items-center gap-1"><Phone className="h-4 w-4 text-muted" /><a className="font-semibold text-brand" href={`tel:${d.booking.customerPhone}`}>{d.booking.customerPhone}</a></p>}
          </div>
          {(d.booking.requirements || d.booking.customerNotes) && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              {d.booking.requirements && <p><strong>Requirements: </strong>{d.booking.requirements}</p>}
              {d.booking.customerNotes && <p><strong>Notes: </strong>{d.booking.customerNotes}</p>}
            </div>
          )}
          <BookingActions b={{ ...d.booking, startsAt: d.booking.startsAt }} size="md" />
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">History</p>
            <ul className="space-y-1.5 text-[13px]">
              {d.history.map((h) => <li key={h.id} className="flex justify-between gap-3"><span>{h.note ?? h.toStatus}</span><span className="shrink-0 text-muted">{formatDate(h.createdAt, tz)} {formatTime(h.createdAt, tz)}</span></li>)}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}
