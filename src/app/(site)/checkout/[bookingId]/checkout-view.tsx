"use client";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Clock, CreditCard, Landmark, Lock, MapPin, ShieldCheck, Smartphone, Timer, Wallet } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { cn, formatDuration, formatINR } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/time";
import { useCountdown } from "@/hooks/use-countdown";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CheckoutConfig =
  | { provider: "razorpay"; keyId: string; orderId: string; amount: number; currency: string }
  | { provider: "sandbox"; orderId: string; amount: number; currency: string; checkoutUrl: string };

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
  }
}

export function CheckoutView({
  booking,
  salon,
  items,
  staff,
  resources,
  customer,
}: {
  booking: { id: string; code: string; startsAt: string; endsAt: string; durationMinutes: number; subtotal: number; discount: number; tax: number; total: number; lockExpiresAt: string | null; requirements: string | null };
  salon: { name: string; timezone: string; area: string; citySlug: string; slug: string };
  items: { name: string; kind: string; price: number; groupName: string | null }[];
  staff: string[];
  resources: string[];
  customer: { name: string; email: string; phone: string | null };
}) {
  const router = useRouter();
  const { label, expired, remainingMs } = useCountdown(booking.lockExpiresAt);
  const [verifying, setVerifying] = useState(false);
  const tz = salon.timezone;

  const verify = async (payload: { orderId: string; paymentId: string; signature: string }) => {
    setVerifying(true);
    try {
      const r = await api.post<{ outcome: string; bookingId: string }>("/api/payments/verify", payload);
      if (r.outcome === "SLOT_LOST") toast.error("Your slot was released before payment completed. A full refund has been initiated.");
      router.replace(`/customer/bookings/${booking.id}?confirmed=1`);
    } catch (e) {
      setVerifying(false);
      toast.error(errorMessage(e));
    }
  };

  const pay = useMutation({
    mutationFn: () => api.post<{ config: CheckoutConfig }>("/api/payments/create", { bookingId: booking.id }),
    onSuccess: ({ config }) => {
      if (config.provider === "sandbox") {
        router.push(`${config.checkoutUrl}?booking=${booking.id}`);
        return;
      }
      if (!window.Razorpay) return toast.error("Payment window failed to load. Please check your connection and retry.");
      const rzp = new window.Razorpay({
        key: config.keyId,
        order_id: config.orderId,
        amount: config.amount,
        currency: config.currency,
        name: "BookMyStyle",
        description: `${salon.name} · ${booking.code}`,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone ?? undefined },
        theme: { color: "#a3214f" },
        handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => verify({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
        modal: { ondismiss: () => api.post("/api/payments/fail", { orderId: config.orderId, reason: "Checkout was closed before completing payment." }).catch(() => {}) },
      });
      rzp.on("payment.failed", (r) => toast.error(r.error?.description ?? "Payment failed. You can retry while your slot is held."));
      rzp.open();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const svc = items.find((i) => i.kind === "SERVICE");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className={cn("mb-6 flex items-center gap-3 rounded-2xl border p-4", expired ? "border-danger/30 bg-danger-soft" : remainingMs < 60_000 ? "border-warning/30 bg-warning-soft" : "border-line bg-surface")} role="status" aria-live="polite">
        <Timer className={cn("h-5 w-5 shrink-0", expired ? "text-danger" : "text-brand")} />
        {expired ? (
          <p className="text-sm font-semibold text-danger">Your slot hold has expired and the time has been released. <Link href={`/salons/${salon.citySlug}/${salon.slug}/book`} className="underline">Pick a slot again</Link>.</p>
        ) : (
          <p className="text-sm">We&apos;re holding your slot for <strong className="tabular-nums">{label}</strong>. Complete payment to confirm.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Review & pay</h1>
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Appointment</p>
            <p className="mt-1 text-lg font-bold">{svc?.name}</p>
            {items.filter((i) => i.kind === "OPTION").length > 0 && <p className="text-sm text-muted">{items.filter((i) => i.kind === "OPTION").map((i) => i.name).join(" · ")}</p>}
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand" /> {salon.name}, {salon.area}</p>
              <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand" /> {formatDate(booking.startsAt, tz, { year: "numeric" })}</p>
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand" /> {formatTime(booking.startsAt, tz)} – {formatTime(booking.endsAt, tz)} ({formatDuration(booking.durationMinutes)})</p>
              <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" /> {staff.length ? staff.join(" & ") : "Any stylist"}{resources.length ? ` · ${resources.join(", ")}` : ""}</p>
            </div>
            {booking.requirements && <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">“{booking.requirements}”</p>}
          </Card>
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Pay with</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[[Smartphone, "UPI"], [CreditCard, "Cards"], [Landmark, "Net banking"], [Wallet, "Wallets"]].map(([Icon, l]) => {
                const I = Icon as typeof Smartphone;
                return (
                  <div key={l as string} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-2/50 p-3 text-xs font-semibold text-ink-2">
                    <I className="h-5 w-5 text-brand" /> {l as string}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Lock className="h-3.5 w-3.5" /> Payments are processed by our payment partner and verified on our servers before your booking is confirmed.</p>
          </Card>
        </div>
        <div>
          <Card className="p-5 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Price details</p>
            <dl className="mt-3 space-y-2 text-sm">
              {items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3"><dt className="text-ink-2">{i.kind === "OPTION" ? `${i.groupName}: ${i.name}` : i.name}</dt><dd>{i.price ? formatINR(i.price) : "Incl."}</dd></div>
              ))}
              {booking.discount > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{formatINR(booking.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-2">GST</dt><dd>{formatINR(booking.tax, { decimals: true })}</dd></div>
              <div className="flex justify-between border-t border-line pt-3 text-lg font-bold"><dt>To pay</dt><dd>{formatINR(booking.total, { decimals: booking.total % 100 !== 0 })}</dd></div>
            </dl>
            {expired ? (
              <ButtonLink href={`/salons/${salon.citySlug}/${salon.slug}/book`} block size="lg" className="mt-5">Choose a new slot</ButtonLink>
            ) : (
              <Button block size="lg" className="mt-5" onClick={() => pay.mutate()} loading={pay.isPending || verifying}>
                <Lock className="h-4 w-4" /> {verifying ? "Verifying payment…" : `Pay ${formatINR(booking.total, { decimals: booking.total % 100 !== 0 })}`}
              </Button>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> If money is debited but confirmation fails, it&apos;s refunded automatically.</p>
            <p className="mt-2 text-center text-[11px] text-muted">Booking ref {booking.code}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
