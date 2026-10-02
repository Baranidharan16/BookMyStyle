import Link from "next/link";
import { ArrowRight, BadgePercent, CalendarClock, CheckCircle2, CreditCard, MapPin, QrCode, Scissors, ShieldCheck, Sparkles, Store, TrendingUp, Zap } from "lucide-react";
import { getLandingData } from "@/server/domain/salons";
import { getSessionUser } from "@/server/auth/session";
import { HeroSearch } from "@/components/customer/hero-search";
import { SalonRail } from "@/components/customer/salon-rail";
import { RecentlyViewed } from "@/components/customer/recently-viewed";
import { SalonCard } from "@/components/customer/salon-card";
import { CategoryIcon } from "@/components/customer/category-icon";
import { SalonCover } from "@/components/customer/salon-cover";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, user] = await Promise.all([getLandingData(), getSessionUser()]);
  const signedIn = user?.role === "CUSTOMER";
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_85%_0%,var(--brand-soft),transparent_70%),radial-gradient(40%_50%_at_0%_100%,var(--accent-soft),transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16 lg:pb-16">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-semibold text-ink-2 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live availability from {data.topRated.length ? "top" : ""} salons in Chennai & Bengaluru
            </p>
            <h1 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              Book your perfect <em className="font-normal text-brand">salon</em> appointment.
            </h1>
            <p className="mt-4 max-w-xl text-base text-ink-2 sm:text-lg">See real seats and stylists free right now, choose exactly what you want, pay securely — and walk in to a chair that&apos;s waiting for you.</p>
          </div>
          <div className="mt-8 max-w-5xl">
            <HeroSearch />
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-accent" /> Instant confirmation</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-success" /> Secure UPI & card payments</span>
            <span className="inline-flex items-center gap-1.5"><QrCode className="h-4 w-4 text-brand" /> QR check-in, no queues</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ categories */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6" aria-labelledby="cats">
        <h2 id="cats" className="sr-only">Service categories</h2>
        <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:grid lg:grid-cols-11 lg:overflow-visible">
          {data.categories.map((c) => (
            <Link key={c.id} href={`/search?category=${c.slug}`} className="group flex w-[84px] shrink-0 flex-col items-center gap-2 rounded-2xl p-2 text-center transition hover:bg-surface lg:w-auto">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-brand shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-brand/40 group-hover:shadow-card">
                <CategoryIcon name={c.icon} className="h-6 w-6" />
              </span>
              <span className="text-[12px] font-semibold leading-tight text-ink-2 group-hover:text-ink">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <SalonRail mode="available-now" title="Available now" subtitle="Free seats in the next hour near {loc}" signedIn={signedIn} />
      <SalonRail mode="nearby" title="Popular near you" subtitle="Closest salons to {loc}" signedIn={signedIn} />
      <RecentlyViewed />

      {/* ------------------------------------------------------- trending */}
      {data.trending.length > 0 && (
        <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="trending">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 id="trending" className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-[1.75rem]">
                <TrendingUp className="h-6 w-6 text-brand" /> Trending salons
              </h2>
              <p className="text-sm text-muted">Most booked on BookMyStyle in the last 14 days</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.trending.slice(0, 4).map((s) => (
              <div key={s.id} className="relative">
                <SalonCard salon={s} signedIn={signedIn} />
                <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">{s.recentBookings} bookings · 14d</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- offers */}
      {data.offers.length > 0 && (
        <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="offers">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="offers" className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-[1.75rem]">
              <BadgePercent className="h-6 w-6 text-accent" /> Best offers
            </h2>
            <Link href="/offers" className="text-sm font-semibold text-brand hover:underline">All offers</Link>
          </div>
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {data.offers.map((o) => (
              <Link key={o.id} href={`/salons/${o.citySlug}/${o.salonSlug}`} className="group relative flex w-72 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card hover:shadow-pop">
                <div className="w-24 shrink-0">
                  <SalonCover seed={o.salonId} color={o.brandColor} variant={2} />
                </div>
                <div className="min-w-0 p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{o.kind.replace("_", " ").toLowerCase()}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug">{o.title}</p>
                  <p className="mt-1 truncate text-xs text-muted">{o.salonName}</p>
                  <p className="mt-2 inline-block rounded-md border border-dashed border-accent px-2 py-0.5 font-mono text-xs font-bold text-accent">{o.code}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- top rated */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="top">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="top" className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-[1.75rem]">
              <Sparkles className="h-6 w-6 text-accent" /> Highly rated
            </h2>
            <p className="text-sm text-muted">Rated by customers after verified, completed visits</p>
          </div>
          <Link href="/search?sort=rating" className="text-sm font-semibold text-brand hover:underline">See all</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.topRated.slice(0, 8).map((s) => (
            <SalonCard key={s.id} salon={s} signedIn={signedIn} />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6" aria-labelledby="how">
        <div className="rounded-[2rem] border border-line bg-surface p-6 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">How it works</p>
          <h2 id="how" className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">From search to styled in six steps</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [MapPin, "Find a salon", "Search by service, area or salon. Filter by rating, price, distance and live availability."],
              [Scissors, "Choose a service", "Pick exactly what you need — length, style, add-ons — and your favourite stylist."],
              [CalendarClock, "Pick a time", "See real free slots, calculated from seats, stylists, walk-ins and breaks."],
              [CreditCard, "Pay securely", "UPI, cards, net banking or wallets. Your seat is held while you pay."],
              [QrCode, "Visit & check in", "Show the QR ticket at the desk. Running late? Your booking stays active."],
              [CheckCircle2, "Get your service", "Track your queue status live, then rate your visit."],
            ].map(([Icon, title, body], i) => {
              const I = Icon as typeof MapPin;
              return (
                <li key={i} className="flex gap-4">
                  <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                    <I className="h-5 w-5" />
                    <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-canvas">{i + 1}</span>
                  </span>
                  <span>
                    <span className="block font-bold">{title as string}</span>
                    <span className="mt-1 block text-sm text-muted">{body as string}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------- for owners */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink p-8 text-canvas sm:p-12">
          <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/40 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent">
                <Store className="h-4 w-4" /> For salon owners
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">Fill every chair. Never double-book again.</h2>
              <p className="mt-3 max-w-xl text-canvas/75">Online bookings and walk-ins on one live board. Staff schedules, offers, payments and analytics — built for how Indian salons actually run.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/register?role=OWNER" size="lg">
                  Register your salon <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/for-salon-owners" size="lg" variant="ghost" className="text-canvas hover:bg-white/10 hover:text-canvas">
                  Learn more
                </ButtonLink>
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-3 text-sm">
              {["Live resource board", "Walk-in sync", "Staff scheduling", "UPI payments", "Offers & coupons", "Revenue analytics"].map((f) => (
                <li key={f} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- app cta */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-[2rem] border border-line bg-gradient-to-br from-brand-soft to-accent-soft p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold">Get the app experience</h2>
            <p className="mt-1 text-sm text-ink-2">Add BookMyStyle to your home screen for one-tap booking, reminders and your QR ticket — even offline.</p>
          </div>
          <ButtonLink href="/customer/dashboard" variant="dark">Open my bookings</ButtonLink>
        </div>
      </section>
    </>
  );
}
