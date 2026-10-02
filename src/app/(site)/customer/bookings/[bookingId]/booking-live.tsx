"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CalendarClock, CheckCircle2, Download, Flag, Navigation, Phone, PartyPopper, Scissors, Star, Timer, User, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api-client";
import { cn, formatDuration, formatINR } from "@/lib/utils";
import { addDaysKey, formatDate, formatDateKey, formatMinutes, formatTime, toDateKey } from "@/lib/time";
import { useRealtime } from "@/hooks/use-realtime";
import type { BookingDetail } from "@/server/domain/bookings";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/booking/status";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { LiveDot, Skeleton } from "@/components/ui/states";
import { Stars } from "@/components/ui/misc";

type D = BookingDetail & { viewer?: string };

const STEPS = [
  { key: "CONFIRMED", label: "Booking confirmed" },
  { key: "ARRIVED", label: "Arrived" },
  { key: "CHECKED_IN", label: "Checked in" },
  { key: "WAITING", label: "Waiting" },
  { key: "READY", label: "Your service is ready" },
  { key: "IN_SERVICE", label: "In service" },
  { key: "COMPLETED", label: "Completed" },
];

function progressIndex(d: D) {
  const s = d.booking.status;
  if (s === "COMPLETED") return 6;
  if (s === "IN_SERVICE") return 5;
  if (d.queue?.status === "READY") return 4;
  if (s === "WAITING") return 3;
  if (s === "CHECKED_IN") return 2;
  if (s === "CONFIRMED") return 0;
  return -1;
}

export function BookingLive({ bookingId, initial, qrSvg, justConfirmed, customerName }: { bookingId: string; initial: D; qrSvg: string; justConfirmed: boolean; customerName: string }) {
  const qc = useQueryClient();
  const { data: d = initial, refetch } = useQuery({ queryKey: ["booking", bookingId], queryFn: () => api.get<D>(`/api/bookings/${bookingId}`), initialData: initial, staleTime: 5_000 });
  const { connected } = useRealtime([`booking:${bookingId}`], () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  useEffect(() => {
    if (justConfirmed && d.booking.status === "CONFIRMED") toast.success("Booking confirmed! 🎉", { description: `Booking ID ${d.booking.code}` });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const b = d.booking;
  const tz = d.salon.timezone;
  const start = new Date(b.startsAt);
  const isUpcoming = ["CONFIRMED"].includes(b.status) && start.getTime() > Date.now();
  const active = ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE"].includes(b.status);
  const idx = progressIndex(d);
  const svcItem = d.items.find((i) => i.kind === "SERVICE");
  const options = d.items.filter((i) => i.kind === "OPTION");
  const hoursToStart = (start.getTime() - Date.now()) / 3_600_000;
  const canReschedule = isUpcoming && d.policy.allowReschedule && b.rescheduleCount < d.policy.maxReschedules && hoursToStart >= d.policy.rescheduleMinHours;
  const late = b.status === "CONFIRMED" && Date.now() > start.getTime();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/customer/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> My bookings</Link>

      {justConfirmed && b.status === "CONFIRMED" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-success-soft p-4 text-success">
          <PartyPopper className="h-6 w-6 shrink-0" />
          <div><p className="font-bold">You&apos;re booked!</p><p className="text-sm">Payment verified. We&apos;ve sent a confirmation to your notifications.</p></div>
        </div>
      )}
      {b.status === "FAILED" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-danger-soft p-4 text-danger">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <p className="text-sm font-semibold">This booking couldn&apos;t be completed{b.cancelReason === "CHECKOUT_TIMEOUT" ? " because the payment window expired" : ""}. {d.refunds.length ? "Any amount paid is being refunded." : "No money was charged."}</p>
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ------------------------------------------------ ticket */}
        <div>
          <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card" aria-label="Booking ticket">
            <div className="relative bg-ink p-5 text-canvas sm:p-6" style={{ background: `linear-gradient(135deg, ${d.salon.brandColor}, #1b1520)` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">BookMyStyle e-ticket</p>
                  <h1 className="mt-1 font-display text-2xl font-semibold text-white sm:text-3xl">{d.salon.name}</h1>
                  <p className="mt-0.5 text-sm text-white/75">{d.location?.addressLine}, {d.location?.area}</p>
                </div>
                <BookingStatusBadge status={b.status} />
              </div>
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <Info label="Service" value={svcItem?.name ?? d.service.name} sub={options.map((o) => o.name).join(" · ") || undefined} wide />
                <Info label="Date" value={formatDate(b.startsAt, tz, { year: "numeric" })} />
                <Info label="Time" value={`${formatTime(b.startsAt, tz)} – ${formatTime(b.endsAt, tz)}`} sub={formatDuration(b.durationMinutes)} />
                <Info label="Stylist" value={d.staff.map((s) => s.name).join(" & ") || "Assigned at salon"} />
                <Info label="Seat" value={d.resources.map((r) => r.name).join(", ") || "—"} sub={d.resources[0]?.type} />
                <Info label="Guest" value={customerName} />
                <Info label="Amount" value={formatINR(b.total, { decimals: b.total % 100 !== 0 })} sub={<PaymentStatusBadge status={b.paymentStatus} />} />
              </div>
              {active && (
                <div className="flex flex-col items-center">
                  <div className="h-40 w-40 rounded-2xl border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="Check-in QR code" role="img" />
                  <p className="mt-2 text-center text-xs text-muted">Show at the desk to check in</p>
                </div>
              )}
            </div>
            <div className="ticket-cut relative h-6 border-y border-dashed border-line" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6">
              <div>
                <p className="text-xs text-muted">Booking ID</p>
                <p className="font-mono text-lg font-bold tracking-wider">{b.code}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.location && <ButtonLink href={`https://www.google.com/maps/dir/?api=1&destination=${d.location.lat},${d.location.lng}`} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm"><Navigation className="h-4 w-4" /> Directions</ButtonLink>}
                {d.salon.phone && <ButtonLink href={`tel:${d.salon.phone.replace(/\s/g, "")}`} variant="secondary" size="sm"><Phone className="h-4 w-4" /> Call salon</ButtonLink>}
                <Button variant="ghost" size="sm" onClick={() => window.print()}><Download className="h-4 w-4" /> Save</Button>
              </div>
            </div>
            {b.requirements && <p className="border-t border-line px-5 py-3 text-sm text-ink-2 sm:px-6"><span className="font-semibold text-ink">Your requirements: </span>{b.requirements}</p>}
          </article>

          {(isUpcoming || b.status === "PAYMENT_PENDING") && (
            <div className="mt-4 flex flex-wrap gap-2">
              {b.status === "PAYMENT_PENDING" && <ButtonLink href={`/checkout/${b.id}`}>Complete payment</ButtonLink>}
              {canReschedule && <Button variant="secondary" onClick={() => setRescheduleOpen(true)}><CalendarClock className="h-4 w-4" /> Reschedule</Button>}
              <Button variant="dangerSoft" onClick={() => setCancelOpen(true)}><XCircle className="h-4 w-4" /> Cancel booking</Button>
            </div>
          )}
          {isUpcoming && !canReschedule && d.policy.allowReschedule && <p className="mt-2 text-xs text-muted">Rescheduling is available up to {d.policy.rescheduleMinHours} hours before the appointment (max {d.policy.maxReschedules} times).</p>}

          {b.status === "COMPLETED" && <ReviewBox bookingId={b.id} existing={d.review} onDone={() => refetch()} />}

          {/* payments & refunds */}
          <Card className="mt-6 p-5">
            <h2 className="font-bold">Payment</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {d.items.map((i) => <div key={i.id} className="flex justify-between"><dt className="text-ink-2">{i.kind === "OPTION" ? `${i.groupName}: ${i.name}` : i.name}</dt><dd>{i.price ? formatINR(i.price) : "Incl."}</dd></div>)}
              {b.discount > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{formatINR(b.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-2">GST</dt><dd>{formatINR(b.tax, { decimals: true })}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Total</dt><dd>{formatINR(b.total, { decimals: true })}</dd></div>
            </dl>
            {d.payments.filter((p) => p.status !== "INITIATED").map((p) => (
              <p key={p.id} className="mt-2 text-xs text-muted">{p.status === "FAILED" ? "Failed attempt" : "Paid"} via {p.method?.toUpperCase() ?? p.provider} · {formatDate(p.createdAt, tz)} {formatTime(p.createdAt, tz)}{p.providerPaymentId ? ` · ref ${p.providerPaymentId.slice(-10)}` : ""}</p>
            ))}
            {d.refunds.map((r) => (
              <p key={r.id} className="mt-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">Refund {formatINR(r.amount)} — {r.status.toLowerCase()} {r.reason ? `· ${r.reason}` : ""}</p>
            ))}
            {b.status !== "PAYMENT_PENDING" && <button onClick={() => setDisputeOpen(true)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-danger"><Flag className="h-3.5 w-3.5" /> Report a problem</button>}
          </Card>
        </div>

        {/* ------------------------------------------------ live status */}
        <aside className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Live status</h2>
              {connected && active && <LiveDot />}
            </div>
            {late && (
              <p className="mt-3 rounded-xl bg-warning-soft p-3 text-[13px] text-warning">
                <Timer className="mr-1 inline h-4 w-4" /> Running late? Your booking remains active ({d.policy.graceMinutes} min grace). Service will begin when a seat and stylist are free.
              </p>
            )}
            {b.status === "WAITING" && b.estimatedStartAt && (
              <div className="mt-3 rounded-xl bg-warning-soft p-3">
                <p className="text-sm font-bold text-warning">Waiting – expected service start approximately {formatTime(b.estimatedStartAt, tz)}</p>
                {d.queue?.note && <p className="mt-1 text-xs text-ink-2">{d.queue.note}</p>}
              </div>
            )}
            {b.lateMinutes ? <p className="mt-3 text-xs text-muted">You arrived {b.lateMinutes} min late. Your booking remains active; service begins when the required seat/stylist is free.</p> : null}
            {idx >= 0 ? (
              <ol className="mt-4 space-y-0">
                {STEPS.map((s, i) => {
                  const done = i <= idx || (i === 1 && idx >= 2);
                  const current = i === idx;
                  if (s.key === "WAITING" && b.status !== "WAITING" && idx !== 3 && !d.history.some((h) => h.toStatus === "WAITING")) return null;
                  return (
                    <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                      <span className={cn("relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", done ? "border-success bg-success text-white" : "border-line-strong bg-surface")}>
                        {done && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </span>
                      {i < STEPS.length - 1 && <span className={cn("absolute left-[11px] top-6 h-full w-0.5", i < idx ? "bg-success" : "bg-line")} aria-hidden />}
                      <span className={cn("pt-0.5 text-sm", current ? "font-bold text-ink" : done ? "text-ink-2" : "text-muted")}>
                        {s.label}
                        {current && b.status === "IN_SERVICE" && <span className="ml-2 inline-block animate-pulse-soft text-brand">●</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">{b.status === "CANCELLED" ? `Cancelled ${b.cancelledAt ? formatDate(b.cancelledAt, tz) : ""}. ${b.cancelReason ?? ""}` : b.status === "NO_SHOW" ? "Marked as no-show." : "This booking is not active."}</p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-bold">Timeline</h2>
            <ul className="mt-3 space-y-2.5">
              {[...d.history].reverse().map((h) => (
                <li key={h.id} className="text-[13px]">
                  <p className="font-semibold text-ink">{h.note ?? `${h.toStatus.replace("_", " ").toLowerCase()}`}</p>
                  <p className="text-xs text-muted">{formatDate(h.createdAt, tz)} · {formatTime(h.createdAt, tz)}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 text-[13px] text-ink-2">
            <h2 className="mb-2 font-bold text-ink">Salon policy</h2>
            {d.policy.policyText && <p className="mb-2">{d.policy.policyText}</p>}
            <p>Late-arrival grace: {d.policy.graceMinutes} min. No-show refund: {d.policy.noShowRefundPercent}%.</p>
          </Card>
        </aside>
      </div>

      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} bookingId={b.id} onDone={() => refetch()} />
      {rescheduleOpen && <RescheduleDialog onClose={() => setRescheduleOpen(false)} d={d} onDone={() => refetch()} />}
      <DisputeDialog open={disputeOpen} onClose={() => setDisputeOpen(false)} bookingId={b.id} />
    </div>
  );
}

function Info({ label, value, sub, wide }: { label: string; value: React.ReactNode; sub?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function CancelDialog({ open, onClose, bookingId, onDone }: { open: boolean; onClose: () => void; bookingId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { data: preview, isLoading } = useQuery({ queryKey: ["cancel-preview", bookingId], queryFn: () => api.get<{ percent: number; amount: number; explanation: string }>(`/api/bookings/${bookingId}/cancel`), enabled: open });
  const m = useMutation({
    mutationFn: () => api.post<{ refund: { amount: number } }>(`/api/bookings/${bookingId}/cancel`, { reason: reason || undefined }),
    onSuccess: (r) => {
      toast.success("Booking cancelled", { description: r.refund.amount ? `Refund of ${formatINR(r.refund.amount)} initiated.` : undefined });
      onClose();
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Cancel this booking?" footer={<><Button variant="ghost" onClick={onClose}>Keep booking</Button><Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>Cancel booking</Button></>}>
      {isLoading ? <Skeleton className="h-16" /> : preview && (
        <div className={cn("rounded-2xl p-4", preview.amount > 0 ? "bg-success-soft" : "bg-warning-soft")}>
          <p className="font-bold">{preview.amount > 0 ? `You'll get ${formatINR(preview.amount)} back` : "No refund applies"}</p>
          <p className="mt-1 text-sm text-ink-2">{preview.explanation}</p>
        </div>
      )}
      <Textarea className="mt-4" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional) — helps the salon improve" maxLength={500} aria-label="Cancellation reason" />
    </Dialog>
  );
}

function RescheduleDialog({ onClose, d, onDone }: { onClose: () => void; d: D; onDone: () => void }) {
  const tz = d.salon.timezone;
  const today = toDateKey(new Date(), tz);
  const [date, setDate] = useState(toDateKey(new Date(d.booking.startsAt), tz));
  const [minute, setMinute] = useState<number | null>(null);
  const optionIds = d.items.filter((i) => i.optionId).map((i) => i.optionId!);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["availability", d.salon.id, d.service.id, date, "reschedule"],
    queryFn: () => api.get<{ slots: { minute: number; available: boolean; message?: string }[]; closed: boolean }>(`/api/salons/${d.salon.id}/availability${qs({ serviceId: d.service.id, date, optionIds })}`),
  });
  useRealtime([`salon:${d.salon.id}`], (m) => m.type === "availability" && refetch());
  const m = useMutation({
    mutationFn: () => api.post(`/api/bookings/${d.booking.id}/reschedule`, { date, startMinute: minute }),
    onSuccess: () => {
      toast.success("Booking rescheduled");
      onClose();
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      refetch();
    },
  });
  return (
    <Dialog open onClose={onClose} size="lg" title="Reschedule" description="Pick a new time — we'll re-check seats and stylists before moving your booking." footer={<Button disabled={minute == null} loading={m.isPending} onClick={() => m.mutate()}>Confirm new time</Button>}>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 14 }, (_, i) => addDaysKey(today, i)).map((k) => (
          <button key={k} onClick={() => { setDate(k); setMinute(null); }} className={cn("shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold", k === date ? "border-brand bg-brand text-white" : "border-line")}>{formatDateKey(k)}</button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {isLoading ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-10" />) : data?.closed ? <p className="col-span-full text-sm text-muted">Closed on this day.</p> : data?.slots.filter((s) => s.available).map((s) => (
          <button key={s.minute} onClick={() => setMinute(s.minute)} className={cn("h-10 rounded-xl border text-sm font-semibold", minute === s.minute ? "border-brand bg-brand text-white" : "border-line hover:border-brand")}>{formatMinutes(s.minute)}</button>
        ))}
        {data && !data.closed && !data.slots.some((s) => s.available) && <p className="col-span-full text-sm text-muted">No availability on this day.</p>}
      </div>
    </Dialog>
  );
}

function ReviewBox({ bookingId, existing, onDone }: { bookingId: string; existing: D["review"]; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [serviceRating, setServiceRating] = useState(5);
  const [staffRating, setStaffRating] = useState(5);
  const [comment, setComment] = useState("");
  const m = useMutation({
    mutationFn: () => api.post(`/api/bookings/${bookingId}/review`, { rating, serviceRating, staffRating, comment: comment || null }),
    onSuccess: () => {
      toast.success("Thanks for your review!");
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (existing) {
    return (
      <Card className="mt-6 p-5" id="review">
        <h2 className="flex items-center gap-2 font-bold"><Star className="h-4 w-4 text-accent" /> Your review</h2>
        <div className="mt-2"><Stars value={existing.rating} /></div>
        {existing.comment && <p className="mt-2 text-sm text-ink-2">{existing.comment}</p>}
        {existing.ownerReply && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><span className="font-bold">Salon replied: </span>{existing.ownerReply}</p>}
      </Card>
    );
  }
  return (
    <Card className="mt-6 p-5" id="review">
      <h2 className="font-bold">How was your visit?</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div><p className="text-xs font-semibold text-muted">Overall</p><Stars value={rating} onChange={setRating} size={24} label="Overall rating" /></div>
        <div><p className="text-xs font-semibold text-muted flex items-center gap-1"><Scissors className="h-3 w-3" /> Service</p><Stars value={serviceRating} onChange={setServiceRating} size={20} label="Service rating" /></div>
        <div><p className="text-xs font-semibold text-muted flex items-center gap-1"><User className="h-3 w-3" /> Stylist</p><Stars value={staffRating} onChange={setStaffRating} size={20} label="Stylist rating" /></div>
      </div>
      <Textarea className="mt-3" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell others what you liked (optional)" maxLength={1500} aria-label="Review comment" />
      <Button className="mt-3" onClick={() => m.mutate()} loading={m.isPending}>Submit review</Button>
    </Card>
  );
}

function DisputeDialog({ open, onClose, bookingId }: { open: boolean; onClose: () => void; bookingId: string }) {
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => api.post("/api/admin/disputes", { bookingId, reason }),
    onSuccess: () => {
      toast.success("Thanks — our support team will look into it.");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Report a problem" description="Payment issue, service complaint or anything else." footer={<Button loading={m.isPending} disabled={reason.trim().length < 10} onClick={() => m.mutate()}>Submit</Button>}>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe what happened (at least 10 characters)" maxLength={1000} aria-label="Problem description" />
    </Dialog>
  );
}
