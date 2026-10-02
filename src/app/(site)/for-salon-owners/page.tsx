import type { Metadata } from "next";
import { ArrowRight, BarChart3, CalendarRange, CreditCard, LayoutGrid, Megaphone, Repeat2, Tag, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "For salon owners", description: "Online bookings, walk-in sync, staff scheduling, UPI payments and analytics for salons, spas and barbershops." };

const FEATURES = [
  [CalendarRange, "Online bookings, 24×7", "Customers book real free slots — calculated from your seats, staff rosters, breaks and buffers. No more phone tag."],
  [Repeat2, "Walk-in synchronisation", "Add a walk-in in two taps. That seat disappears from online availability instantly — no double-booking, ever."],
  [LayoutGrid, "Live resource board", "Every chair, bed and room on one screen: who's in service, who's next, what's free. Updates in real time."],
  [Users, "Staff management", "Shifts, breaks, leave, skills and permissions. The booking engine only offers stylists who can actually do the job."],
  [CreditCard, "Prepaid bookings", "UPI, cards, net banking and wallets. Configurable refund, late-arrival and no-show rules that you control."],
  [Tag, "Offers & coupons", "Percentage, flat, first-visit, weekend, festival or happy-hour offers with usage limits."],
  [BarChart3, "Analytics", "Revenue, peak hours, staff and chair utilisation, retention, cancellation and no-show rates."],
  [Megaphone, "Customer management", "Every online and walk-in customer in one list — visits, spend and history."],
];

export default function ForOwnersPage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-canvas">
        <div aria-hidden className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand/50 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">BookMyStyle for Business</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-6xl">Run your salon on one live screen.</h1>
          <p className="mt-5 max-w-2xl text-lg text-canvas/75">Online bookings, walk-ins, staff, payments and analytics — built for how Indian salons, parlours, spas and barbershops actually work.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register?role=OWNER" size="lg">Register your salon <ArrowRight className="h-4 w-4" /></ButtonLink>
            <ButtonLink href="/login?next=/business" size="lg" variant="ghost" className="text-canvas hover:bg-white/10 hover:text-canvas">Business login</ButtonLink>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, title, body]) => {
            const I = Icon as typeof ArrowRight;
            return (
              <div key={title as string} className="rounded-2xl border border-line bg-surface p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand"><I className="h-5 w-5" /></span>
                <h2 className="mt-4 font-bold">{title as string}</h2>
                <p className="mt-1.5 text-sm text-muted">{body as string}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-14 rounded-[2rem] border border-line bg-surface p-8 text-center sm:p-12">
          <h2 className="font-display text-3xl font-semibold">Go live in a day</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted">A 10-step guided setup: salon details, location, hours, seats, staff, services, payouts and policies. We verify and you start taking bookings.</p>
          <ButtonLink href="/register?role=OWNER" size="lg" className="mt-6">Start free</ButtonLink>
        </div>
      </section>
    </div>
  );
}
