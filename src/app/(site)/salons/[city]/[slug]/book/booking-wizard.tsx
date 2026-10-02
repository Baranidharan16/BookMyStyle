"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellRing, Check, Clock, Info, Loader2, Lock, Sparkles, Tag, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError, errorMessage, qs } from "@/lib/api-client";
import { cn, formatDuration, formatINR } from "@/lib/utils";
import { addDaysKey, formatDateKey, formatMinutes, toDateKey, weekdayOf, WEEKDAY_SHORT } from "@/lib/time";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { Skeleton, LiveDot } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";

type Option = { id: string; name: string; priceDelta: number; durationDelta: number };
type Group = { id: string; name: string; multiSelect: boolean; required: boolean; options: Option[] };
type Svc = { id: string; name: string; description: string | null; price: number; durationMinutes: number; bufferMinutes: number; staffRequired: number; category: string; staffIds: string[]; optionGroups: Group[] };
type Staff = { id: string; name: string; title: string; ratingAvg: number; avatarUrl: string | null };
type Slot = { minute: number; startsAt: string; available: boolean; reason?: string; message?: string; freeStaffIds?: string[] };
type Availability = { date: string; closed: boolean; closedReason: string | null; bookable: boolean; durationMinutes: number; slots: Slot[] };
type Quote = { subtotal: number; discount: number; tax: number; total: number; taxPercent: number; couponError: string | null; couponTitle: string | null; durationMinutes: number };

export function BookingWizard({
  salon,
  services,
  staff,
  policy,
  user,
  initial,
}: {
  salon: { id: string; name: string; citySlug: string; slug: string; brandColor: string; timezone: string; area: string; bookable: boolean };
  services: Svc[];
  staff: Staff[];
  policy: { bookingWindowDays: number; refundType: string; cancellationTiers: { hoursBefore: number; refundPercent: number }[]; graceMinutes: number; lockMinutes: number };
  user: { role: string; name: string } | null;
  initial: { serviceId?: string; date: string };
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState(initial.serviceId && services.some((s) => s.id === initial.serviceId) ? initial.serviceId : services[0]?.id);
  const service = services.find((s) => s.id === serviceId);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const today = toDateKey(new Date(), salon.timezone);
  const [date, setDate] = useState(initial.date < today ? today : initial.date);
  const [staffPref, setStaffPref] = useState<string | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [requirements, setRequirements] = useState("");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);

  // default required single-select options
  useEffect(() => {
    if (!service) return;
    const init: Record<string, string[]> = {};
    service.optionGroups.forEach((g) => (init[g.id] = g.required && !g.multiSelect && g.options[0] ? [g.options[0].id] : []));
    setSelected(init);
    setStaffPref(null);
    setMinute(null);
  }, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const optionIds = useMemo(() => Object.values(selected).flat(), [selected]);
  const chosenOptions = service ? service.optionGroups.flatMap((g) => g.options.filter((o) => optionIds.includes(o.id)).map((o) => ({ ...o, group: g.name }))) : [];
  const subtotal = (service?.price ?? 0) + chosenOptions.reduce((s, o) => s + o.priceDelta, 0);
  const duration = (service?.durationMinutes ?? 0) + chosenOptions.reduce((s, o) => s + o.durationDelta, 0);
  const missingRequired = service?.optionGroups.filter((g) => g.required && !(selected[g.id]?.length)) ?? [];
  const eligibleStaff = staff.filter((s) => service?.staffIds.includes(s.id));

  const availKey = ["availability", salon.id, serviceId, date, optionIds.join(","), staffPref];
  const { data: avail, isLoading: availLoading, isError: availError, refetch } = useQuery({
    queryKey: availKey,
    queryFn: () => api.get<Availability>(`/api/salons/${salon.id}/availability${qs({ serviceId, date, optionIds, staffId: staffPref })}`),
    enabled: !!serviceId && missingRequired.length === 0,
    staleTime: 15_000,
  });

  // Live updates: another customer booking, a walk-in or a cancellation changes availability instantly.
  const { connected } = useRealtime([`salon:${salon.id}`], (m) => {
    if (m.type === "availability" || m.type === "services") {
      if (!m.data?.date || m.data.date === date) qc.invalidateQueries({ queryKey: ["availability", salon.id] });
    }
  });

  // If the selected slot disappears, tell the customer immediately.
  useEffect(() => {
    if (minute == null || !avail) return;
    const s = avail.slots.find((x) => x.minute === minute);
    if (!s || !s.available) {
      toast.warning(`${formatMinutes(minute)} is no longer available.`, { description: "Someone just booked it — please pick another time." });
      setMinute(null);
    }
  }, [avail, minute]);

  const { data: quote, isFetching: quoting } = useQuery({
    queryKey: ["quote", salon.id, serviceId, optionIds.join(","), date, minute, appliedCoupon],
    queryFn: () => api.post<Quote>("/api/bookings/quote", { salonId: salon.id, serviceId, optionIds, date, startMinute: minute ?? 600, couponCode: appliedCoupon }),
    enabled: !!serviceId && missingRequired.length === 0,
  });
  useEffect(() => {
    if (quote?.couponError && appliedCoupon) toast.error(quote.couponError);
  }, [quote?.couponError, appliedCoupon]);

  const hold = useMutation({
    mutationFn: () =>
      api.post<{ bookingId: string }>("/api/bookings/lock", {
        salonId: salon.id,
        serviceId,
        optionIds,
        date,
        startMinute: minute,
        staffPreference: staffPref,
        couponCode: appliedCoupon && !quote?.couponError ? appliedCoupon : null,
        requirements: requirements || null,
        notes: notes || null,
      }),
    onSuccess: (r) => router.push(`/checkout/${r.bookingId}`),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ["availability", salon.id] });
      setMinute(null);
    },
  });

  const dates = Array.from({ length: Math.min(policy.bookingWindowDays, 30) }, (_, i) => addDaysKey(today, i));
  const groups = avail
    ? [
        { label: "Morning", slots: avail.slots.filter((s) => s.minute < 720) },
        { label: "Afternoon", slots: avail.slots.filter((s) => s.minute >= 720 && s.minute < 1020) },
        { label: "Evening", slots: avail.slots.filter((s) => s.minute >= 1020) },
      ].filter((g) => g.slots.length)
    : [];
  const anyAvailable = avail?.slots.some((s) => s.available);
  const canProceed = !!service && minute != null && missingRequired.length === 0 && salon.bookable;
  const isCustomer = !user || user.role === "CUSTOMER";

  const proceed = () => {
    if (!user) return router.push(`/login?next=${encodeURIComponent(window.location.pathname + `?service=${serviceId}&date=${date}`)}`);
    hold.mutate();
  };

  const Summary = (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Your booking</p>
        <p className="mt-1 font-bold">{service?.name ?? "Select a service"}</p>
        {chosenOptions.length > 0 && <p className="text-[13px] text-muted">{chosenOptions.map((o) => o.name).join(" · ")}</p>}
        <p className="mt-1 text-[13px] text-ink-2">
          {formatDateKey(date)}
          {minute != null && `, ${formatMinutes(minute)} – ${formatMinutes(minute + duration)}`} · {formatDuration(duration)}
        </p>
        {staffPref && <p className="text-[13px] text-ink-2">With {staff.find((s) => s.id === staffPref)?.name}</p>}
      </div>
      <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Service</dt><dd>{formatINR(service?.price ?? 0)}</dd></div>
        {chosenOptions.filter((o) => o.priceDelta).map((o) => (
          <div key={o.id} className="flex justify-between"><dt className="text-muted">{o.name}</dt><dd>+{formatINR(o.priceDelta)}</dd></div>
        ))}
        {quote && quote.discount > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{formatINR(quote.discount)}</dd></div>}
        <div className="flex justify-between"><dt className="text-muted">GST ({quote?.taxPercent ?? 18}%)</dt><dd>{quote ? formatINR(quote.tax, { decimals: true }) : "—"}</dd></div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd className="flex items-center gap-1">{quoting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}{formatINR(quote?.total ?? subtotal, { decimals: !!quote && quote.total % 100 !== 0 })}</dd></div>
      </dl>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedCoupon(coupon.trim().toUpperCase() || null);
        }}
      >
        <div className="relative flex-1">
          <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" className="h-10 pl-9 font-mono uppercase" aria-label="Coupon code" />
        </div>
        <Button type="submit" variant="secondary" size="md" disabled={!coupon}>Apply</Button>
      </form>
      {appliedCoupon && quote && !quote.couponError && quote.couponTitle && (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success"><Check className="h-4 w-4" /> {quote.couponTitle} applied</p>
      )}
      <Button size="lg" block onClick={proceed} disabled={!canProceed || !isCustomer} loading={hold.isPending}>
        <Lock className="h-4 w-4" /> {user ? "Reserve & pay" : "Sign in to reserve"}
      </Button>
      {!isCustomer && <p className="text-center text-xs text-warning">Sign in with a customer account to book.</p>}
      <p className="text-center text-xs text-muted">Your slot is held for {policy.lockMinutes} minutes while you pay. Nothing is charged until you confirm.</p>
    </div>
  );

  if (!services.length) return <div className="mx-auto max-w-3xl p-8 text-center text-muted">This salon has no bookable services yet.</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-40 pt-4 sm:px-6 lg:pb-12">
      <Link href={`/salons/${salon.citySlug}/${salon.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {salon.name}
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Book at {salon.name}</h1>
      {!salon.bookable && <p className="mt-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">This salon is awaiting verification and can&apos;t accept bookings yet.</p>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          {/* 1. service */}
          <section aria-labelledby="s1">
            <h2 id="s1" className="mb-3 flex items-center gap-2 text-lg font-bold"><Step n={1} /> Choose a service</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setServiceId(s.id)}
                  aria-pressed={s.id === serviceId}
                  className={cn("rounded-2xl border p-3.5 text-left transition", s.id === serviceId ? "border-brand bg-brand-soft/60 ring-2 ring-brand/20" : "border-line bg-surface hover:border-line-strong")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold">{s.name}</span>
                    <span className="shrink-0 font-bold">{formatINR(s.price)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{s.category} · {formatDuration(s.durationMinutes)}{s.optionGroups.length ? " · customisable" : ""}</p>
                </button>
              ))}
            </div>
            {service && service.optionGroups.length > 0 && (
              <div className="mt-4 space-y-4 rounded-2xl border border-line bg-surface p-4">
                <p className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-brand" /> Customise your {service.name.toLowerCase()}</p>
                {service.optionGroups.map((g) => (
                  <fieldset key={g.id}>
                    <legend className="mb-2 text-[13px] font-semibold text-ink-2">
                      {g.name} {g.required ? <span className="text-danger">*</span> : <span className="font-normal text-muted">(optional{g.multiSelect ? ", choose any" : ""})</span>}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {g.options.map((o) => {
                        const on = selected[g.id]?.includes(o.id);
                        return (
                          <button
                            key={o.id}
                            type="button"
                            role={g.multiSelect ? "checkbox" : "radio"}
                            aria-checked={on}
                            onClick={() =>
                              setSelected((cur) => {
                                const list = cur[g.id] ?? [];
                                if (g.multiSelect) return { ...cur, [g.id]: on ? list.filter((x) => x !== o.id) : [...list, o.id] };
                                return { ...cur, [g.id]: on && !g.required ? [] : [o.id] };
                              })
                            }
                            className={cn("rounded-xl border px-3 py-2 text-left text-sm transition", on ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-line-strong")}
                          >
                            <span className="font-semibold">{o.name}</span>
                            {(o.priceDelta > 0 || o.durationDelta > 0) && (
                              <span className={cn("ml-1.5 text-xs", on ? "text-white/80" : "text-muted")}>
                                {o.priceDelta > 0 && `+${formatINR(o.priceDelta)}`} {o.durationDelta > 0 && `+${o.durationDelta}m`}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </section>

          {/* 2. date + staff */}
          <section aria-labelledby="s2">
            <h2 id="s2" className="mb-3 flex items-center gap-2 text-lg font-bold"><Step n={2} /> Pick a date</h2>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {dates.map((d, i) => (
                <button
                  key={d}
                  onClick={() => {
                    setDate(d);
                    setMinute(null);
                  }}
                  aria-pressed={d === date}
                  className={cn("flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2.5 transition", d === date ? "border-brand bg-brand text-white shadow-md shadow-brand/25" : "border-line bg-surface hover:border-line-strong")}
                >
                  <span className={cn("text-[11px] font-semibold uppercase", d === date ? "text-white/80" : "text-muted")}>{i === 0 ? "Today" : i === 1 ? "Tmrw" : WEEKDAY_SHORT[weekdayOf(d)]}</span>
                  <span className="text-lg font-bold">{Number(d.slice(8))}</span>
                  <span className={cn("text-[10px]", d === date ? "text-white/80" : "text-muted")}>{formatDateKey(d, { month: "short", weekday: undefined, day: undefined })}</span>
                </button>
              ))}
            </div>
            {service && service.staffRequired > 0 && eligibleStaff.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold"><UserRound className="h-4 w-4 text-brand" /> Stylist preference</p>
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                  <button onClick={() => setStaffPref(null)} aria-pressed={!staffPref} className={cn("flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold", !staffPref ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface")}>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-3"><Sparkles className="h-4 w-4" /></span> Any available
                  </button>
                  {eligibleStaff.map((s) => (
                    <button key={s.id} onClick={() => setStaffPref(s.id)} aria-pressed={staffPref === s.id} className={cn("flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm", staffPref === s.id ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
                      <Avatar name={s.name} src={s.avatarUrl} size={32} />
                      <span>
                        <span className="block font-semibold">{s.name}</span>
                        <span className="block text-[11px] text-muted">{s.title}{s.ratingAvg ? ` · ★ ${s.ratingAvg.toFixed(1)}` : ""}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 3. time */}
          <section aria-labelledby="s3" ref={timeRef}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="s3" className="flex items-center gap-2 text-lg font-bold"><Step n={3} /> Select a time</h2>
              {connected && <LiveDot label="Live availability" />}
            </div>
            {missingRequired.length > 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-muted">Choose {missingRequired.map((g) => `“${g.name}”`).join(", ")} to see available times.</p>
            ) : availLoading ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
            ) : availError ? (
              <div className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">Couldn&apos;t load availability. <button className="font-bold underline" onClick={() => refetch()}>Retry</button></div>
            ) : avail?.closed ? (
              <p className="rounded-2xl bg-surface-2 p-5 text-sm text-ink-2">The salon is closed on {formatDateKey(date)}{avail.closedReason ? ` (${avail.closedReason})` : ""}. Please choose another date.</p>
            ) : (
              <>
                <div className="space-y-4">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{g.label}</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
                        {g.slots.map((s) => (
                          <button
                            key={s.minute}
                            disabled={!s.available}
                            title={s.available ? undefined : s.message}
                            aria-pressed={minute === s.minute}
                            aria-label={`${formatMinutes(s.minute)}${s.available ? "" : ` — unavailable: ${s.message}`}`}
                            onClick={() => setMinute(s.minute)}
                            className={cn(
                              "h-11 rounded-xl border text-sm font-semibold tabular-nums transition",
                              minute === s.minute ? "border-brand bg-brand text-white shadow-md shadow-brand/25" : s.available ? "border-line bg-surface hover:border-brand hover:text-brand" : "cursor-not-allowed border-transparent bg-surface-2 text-muted/60 line-through",
                            )}
                          >
                            {formatMinutes(s.minute)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {!anyAvailable && (
                  <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
                    <BellRing className="h-5 w-5 shrink-0 text-brand" />
                    <p className="flex-1 text-sm text-ink-2">No availability for this day{staffPref ? " with your preferred stylist" : ""}. Join the waitlist and we&apos;ll notify you the moment a slot opens.</p>
                    <Button variant="soft" size="sm" onClick={() => (user ? setWaitlistOpen(true) : router.push("/login"))}>Join waitlist</Button>
                  </div>
                )}
                <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Times are calculated live from free seats, stylist schedules, breaks, walk-ins and other bookings{service?.bufferMinutes ? ` (incl. ${service.bufferMinutes} min cleanup)` : ""}.
                </p>
              </>
            )}
          </section>

          {/* 4. requirements */}
          <section aria-labelledby="s4">
            <h2 id="s4" className="mb-3 flex items-center gap-2 text-lg font-bold"><Step n={4} /> Anything we should know?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} maxLength={1000} placeholder="Additional requirements — e.g. ‘keep the sides short’, ‘sensitive skin’, reference look…" aria-label="Additional requirements" />
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Notes for the salon (optional)" aria-label="Notes for the salon" />
            </div>
          </section>

          <div className="rounded-2xl bg-surface-2 p-4 text-[13px] text-ink-2">
            <p className="font-bold text-ink">Cancellation & late arrival</p>
            <p className="mt-1">
              {policy.refundType === "PARTIAL" && [...policy.cancellationTiers].sort((a, b) => b.hoursBefore - a.hoursBefore).map((t) => `${t.refundPercent}% refund ${t.hoursBefore}+ hrs before`).join(" · ") + " · no refund after that."}
              {policy.refundType === "REFUNDABLE" && "Free cancellation before your appointment."}
              {policy.refundType === "NON_REFUNDABLE" && "This booking is non-refundable."}
              {policy.refundType === "TRANSFERABLE" && "Non-refundable, but you can reschedule to another slot."}{" "}
              Arriving late? Your booking stays active ({policy.graceMinutes} min grace), and you&apos;ll be served as soon as a seat and stylist are free.
            </p>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-line bg-surface p-5 shadow-card">{Summary}</div>
        </aside>
      </div>

      {/* mobile summary bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-pop lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{minute != null ? `${formatDateKey(date)}, ${formatMinutes(minute)}` : "Select a time"}</p>
            <p className="text-xs text-muted">{formatINR(quote?.total ?? subtotal)} · {formatDuration(duration)}</p>
          </div>
          <MobileReview summary={Summary} disabled={!canProceed} onPick={() => timeRef.current?.scrollIntoView({ behavior: "smooth" })} />
        </div>
      </div>

      <WaitlistDialog open={waitlistOpen} onClose={() => setWaitlistOpen(false)} salonId={salon.id} serviceId={serviceId!} date={date} />
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-canvas">{n}</span>;
}

function MobileReview({ summary, disabled, onPick }: { summary: React.ReactNode; disabled: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" onClick={() => (disabled ? onPick() : setOpen(true))}>
        {disabled ? <><Clock className="h-4 w-4" /> Pick time</> : "Review"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Review booking">
        {summary}
      </Dialog>
    </>
  );
}

function WaitlistDialog({ open, onClose, salonId, serviceId, date }: { open: boolean; onClose: () => void; salonId: string; serviceId: string; date: string }) {
  const [from, setFrom] = useState(600);
  const [to, setTo] = useState(1200);
  const m = useMutation({
    mutationFn: () => api.post("/api/waitlist", { salonId, serviceId, date, fromMinute: from, toMinute: to }),
    onSuccess: () => {
      toast.success("You're on the waitlist", { description: "We'll notify you as soon as a matching slot opens." });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const opts = Array.from({ length: 29 }, (_, i) => 480 + i * 30);
  return (
    <Dialog open={open} onClose={onClose} title="Join the waitlist" description={`For ${formatDateKey(date)} — tell us which window works for you.`} footer={<Button onClick={() => m.mutate()} loading={m.isPending} disabled={from >= to}>Notify me</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">From
          <select className="mt-1 h-11 w-full rounded-xl border border-line-strong bg-surface px-3" value={from} onChange={(e) => setFrom(+e.target.value)}>{opts.map((o) => <option key={o} value={o}>{formatMinutes(o)}</option>)}</select>
        </label>
        <label className="text-sm font-semibold">To
          <select className="mt-1 h-11 w-full rounded-xl border border-line-strong bg-surface px-3" value={to} onChange={(e) => setTo(+e.target.value)}>{opts.map((o) => <option key={o} value={o}>{formatMinutes(o)}</option>)}</select>
        </label>
      </div>
    </Dialog>
  );
}
