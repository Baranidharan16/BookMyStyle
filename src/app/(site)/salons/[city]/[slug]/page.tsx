import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Accessibility, Car, CheckCircle2, ChevronRight, Clock, Mail, MapPin, Navigation, Phone, ShieldCheck, Sparkles, Tag, Users } from "lucide-react";
import { getSalonIdBySlug, getSalonProfile } from "@/server/domain/salons";
import { getSessionUser } from "@/server/auth/session";
import { getPlatformConfig } from "@/server/settings";
import { SalonCover } from "@/components/customer/salon-cover";
import { FavoriteButton } from "@/components/customer/favorite-button";
import { TrackView } from "@/components/customer/recently-viewed";
import { ServiceMenu } from "@/components/customer/service-menu";
import { SalonMapLazy } from "@/components/map/salon-map-lazy";
import { Avatar, RatingPill, Stars } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatMinutes, formatDate, WEEKDAY_NAMES, minutesOfDay, zonedParts } from "@/lib/time";
import { formatINR } from "@/lib/utils";

type Props = { params: Promise<{ city: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(city: string, slug: string) {
  const ref = await getSalonIdBySlug(city, slug);
  if (!ref) return null;
  const cfg = await getPlatformConfig();
  if (ref.status !== "APPROVED" && !cfg.showUnapprovedSalons) return null;
  return getSalonProfile(ref.id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, slug } = await params;
  const p = await load(city, slug);
  if (!p) return { title: "Salon not found" };
  const area = p.location ? `${p.location.area}, ${p.location.city}` : city;
  const title = `${p.salon.name}, ${area} — Book online`;
  const description = `${p.salon.name} in ${area}. ${p.salon.ratingCount ? `Rated ${p.salon.ratingAvg.toFixed(1)}★ by ${p.salon.ratingCount} customers. ` : ""}${p.services.slice(0, 4).map((s) => s.name).join(", ")} & more. See live availability and book instantly.`;
  return { title, description, alternates: { canonical: `/salons/${city}/${slug}` }, openGraph: { title, description, type: "website" } };
}

export default async function SalonPage({ params, searchParams }: Props) {
  const { city, slug } = await params;
  const sp = await searchParams;
  const [p, user] = await Promise.all([load(city, slug), getSessionUser()]);
  if (!p) notFound();
  const { salon, location } = p;
  const tz = salon.timezone;
  const now = zonedParts(new Date(), tz);
  const nowMin = minutesOfDay(new Date(), tz);
  const todaySpecial = p.specialDays.find((d) => d.date === `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`);
  const todayHours = todaySpecial ? (todaySpecial.isClosed ? [] : [{ openMinute: todaySpecial.openMinute!, closeMinute: todaySpecial.closeMinute! }]) : p.hours.filter((h) => h.weekday === now.weekday);
  const openNow = todayHours.some((h) => nowMin >= h.openMinute && nowMin < h.closeMinute);
  const base = `/salons/${city}/${slug}`;
  const bookHref = (serviceId?: string) => `${base}/book${serviceId ? `?service=${serviceId}` : ""}${sp.date ? `${serviceId ? "&" : "?"}date=${sp.date}` : ""}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": salon.genderType === "MEN" ? "BarberShop" : salon.amenities.some((a) => /spa|steam/i.test(a)) ? "DaySpa" : "BeautySalon",
    name: salon.name,
    description: salon.description,
    telephone: salon.phone,
    url: `${process.env.APP_URL ?? ""}${base}`,
    priceRange: salon.startingPrice ? `From ${formatINR(salon.startingPrice)}` : undefined,
    address: location ? { "@type": "PostalAddress", streetAddress: location.addressLine, addressLocality: location.area, addressRegion: location.state, postalCode: location.pincode, addressCountry: "IN" } : undefined,
    geo: location ? { "@type": "GeoCoordinates", latitude: location.lat, longitude: location.lng } : undefined,
    aggregateRating: salon.ratingCount ? { "@type": "AggregateRating", ratingValue: salon.ratingAvg, reviewCount: salon.ratingCount } : undefined,
    openingHoursSpecification: p.hours.map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: WEEKDAY_NAMES[h.weekday], opens: `${String(Math.floor(h.openMinute / 60)).padStart(2, "0")}:${String(h.openMinute % 60).padStart(2, "0")}`, closes: `${String(Math.floor(h.closeMinute / 60)).padStart(2, "0")}:${String(h.closeMinute % 60).padStart(2, "0")}` })),
    makesOffer: p.services.slice(0, 20).map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.name }, price: s.price / 100, priceCurrency: "INR" })),
  };

  const ratingDist = [5, 4, 3, 2, 1].map((r) => ({ r, n: p.reviews.filter((x) => x.rating === r).length }));

  return (
    <div className="pb-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <TrackView id={salon.id} name={salon.name} slug={salon.slug} citySlug={salon.citySlug} brandColor={salon.brandColor} area={location?.area ?? ""} />

      {/* gallery */}
      <div className="mx-auto max-w-7xl px-0 sm:px-6 sm:pt-6">
        <nav aria-label="Breadcrumb" className="hidden items-center gap-1 pb-3 text-[13px] text-muted sm:flex">
          <Link href="/" className="hover:text-ink">Home</Link> <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/search?city=${location?.city ?? ""}`} className="hover:text-ink">{location?.city}</Link> <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-ink">{salon.name}</span>
        </nav>
        <div className="relative grid h-56 grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden sm:h-80 sm:rounded-3xl">
          <div className="col-span-4 row-span-2 sm:col-span-2">
            <SalonCover seed={salon.id} color={salon.brandColor} src={salon.coverUrl} label={`${salon.name} cover`} />
          </div>
          {p.images.slice(0, 4).map((img, i) => (
            <div key={img.id} className="relative hidden sm:block">
              <SalonCover seed={salon.id} color={salon.brandColor} variant={i + 1} src={img.url} label={img.caption ?? undefined} />
              {img.caption && <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white">{img.caption}</span>}
            </div>
          ))}
          <FavoriteButton salonId={salon.id} signedIn={user?.role === "CUSTOMER"} className="absolute right-3 top-3" />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-6 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {/* header */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={openNow ? "success" : "neutral"} dot>{openNow ? "Open now" : "Closed now"}</Badge>
              <Badge>{salon.genderType === "UNISEX" ? "Unisex" : salon.genderType === "MEN" ? "Men only" : salon.genderType === "WOMEN" ? "Women only" : "Kids"}</Badge>
              {salon.status !== "APPROVED" && <Badge tone="warning">Pending verification</Badge>}
              {salon.status === "APPROVED" && <Badge tone="info"><ShieldCheck className="h-3 w-3" /> Verified</Badge>}
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{salon.name}</h1>
            {salon.tagline && <p className="text-ink-2">{salon.tagline}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
              <RatingPill value={salon.ratingAvg} count={salon.ratingCount} />
              {location && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 text-muted" />{location.addressLine}, {location.area}, {location.city}</span>
              )}
              <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4 text-muted" />
                {todayHours.length ? `Today ${todayHours.map((h) => `${formatMinutes(h.openMinute)}–${formatMinutes(h.closeMinute)}`).join(", ")}` : `Closed today${todaySpecial?.reason ? ` (${todaySpecial.reason})` : ""}`}
              </span>
            </div>
          </div>

          {/* section nav */}
          <nav className="no-scrollbar sticky top-16 z-20 -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur sm:mx-0 sm:px-0" aria-label="Salon sections">
            {[["services", "Services"], ["offers", "Offers"], ["staff", "Stylists"], ["reviews", "Reviews"], ["about", "About"]].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-muted hover:border-brand hover:text-ink">{label}</a>
            ))}
          </nav>

          <section id="services" className="scroll-mt-32 pt-6">
            <h2 className="mb-4 font-display text-2xl font-semibold">Services & prices</h2>
            <ServiceMenu
              services={p.services.map((s) => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMinutes: s.durationMinutes, bufferMinutes: s.bufferMinutes, category: s.category?.name ?? "Other", categoryIcon: s.category?.icon ?? "scissors", options: s.optionGroups.reduce((n, g) => n + g.options.length, 0), staffRequired: s.staffRequired }))}
              bookBase={bookHref()}
            />
          </section>

          {p.offers.length > 0 && (
            <section id="offers" className="scroll-mt-32 pt-10">
              <h2 className="mb-4 font-display text-2xl font-semibold">Offers</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {p.offers.map((o) => (
                  <div key={o.id} className="flex gap-3 rounded-2xl border border-dashed border-accent/60 bg-accent-soft/50 p-4">
                    <Tag className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="font-bold">{o.title}</p>
                      {o.description && <p className="text-sm text-ink-2">{o.description}</p>}
                      <p className="mt-1 text-xs text-muted">
                        Use code <span className="font-mono font-bold text-accent">{o.code}</span> · valid till {formatDate(o.validTo, tz, { weekday: undefined, year: "numeric" })}
                        {o.minAmount > 0 && ` · min ${formatINR(o.minAmount)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section id="staff" className="scroll-mt-32 pt-10">
            <h2 className="mb-4 font-display text-2xl font-semibold">Meet the stylists</h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-3">
              {p.staff.map((s) => (
                <div key={s.id} className="flex w-60 shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface p-3 sm:w-auto">
                  <Avatar name={s.name} src={s.avatarUrl} size={52} />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{s.name}</p>
                    <p className="truncate text-xs text-muted">{s.title} · {s.experienceYears} yrs</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <RatingPill value={s.ratingAvg} count={s.ratingCount} />
                    </div>
                    {s.specialization && <p className="mt-1 truncate text-xs text-ink-2">{s.specialization}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="reviews" className="scroll-mt-32 pt-10">
            <h2 className="mb-4 font-display text-2xl font-semibold">Reviews</h2>
            {p.reviews.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-muted">No reviews yet. Reviews can only be written after a completed visit.</p>
            ) : (
              <>
                <div className="mb-6 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
                  <div className="text-center sm:w-40">
                    <p className="text-5xl font-bold">{salon.ratingAvg.toFixed(1)}</p>
                    <Stars value={salon.ratingAvg} />
                    <p className="mt-1 text-xs text-muted">{salon.ratingCount} verified reviews</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {ratingDist.map(({ r, n }) => (
                      <div key={r} className="flex items-center gap-2 text-xs">
                        <span className="w-3">{r}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-accent" style={{ width: `${p.reviews.length ? (n / p.reviews.length) * 100 : 0}%` }} /></span>
                      </div>
                    ))}
                    <p className="pt-1 text-[11px] text-muted">Distribution of the latest {p.reviews.length} reviews</p>
                  </div>
                </div>
                <ul className="space-y-4">
                  {p.reviews.slice(0, 8).map((r) => (
                    <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.customerName} size={36} />
                          <div>
                            <p className="text-sm font-bold">{r.customerName}</p>
                            <p className="text-xs text-muted">{[r.serviceName, r.staffName && `with ${r.staffName}`].filter(Boolean).join(" ")} · {formatDate(r.createdAt, tz, { weekday: undefined, year: "numeric" })}</p>
                          </div>
                        </div>
                        <RatingPill value={r.rating} />
                      </div>
                      {r.comment && <p className="mt-3 text-sm text-ink-2">{r.comment}</p>}
                      {r.ownerReply && (
                        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                          <p className="text-xs font-bold text-ink">Response from {salon.name}</p>
                          <p className="mt-1 text-ink-2">{r.ownerReply}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section id="about" className="scroll-mt-32 pt-10">
            <h2 className="mb-4 font-display text-2xl font-semibold">About</h2>
            {salon.description && <p className="max-w-3xl text-ink-2">{salon.description}</p>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="mb-3 flex items-center gap-2 font-bold"><Clock className="h-4 w-4 text-brand" /> Opening hours</p>
                <ul className="space-y-1.5 text-sm">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const h = p.hours.filter((x) => x.weekday === d);
                    return (
                      <li key={d} className={`flex justify-between gap-3 ${d === now.weekday ? "font-bold text-ink" : "text-ink-2"}`}>
                        <span>{WEEKDAY_NAMES[d]}</span>
                        <span className="text-right">{h.length ? h.map((x) => `${formatMinutes(x.openMinute)} – ${formatMinutes(x.closeMinute)}`).join(", ") : "Closed"}</span>
                      </li>
                    );
                  })}
                </ul>
                {p.specialDays.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3 text-xs">
                    {p.specialDays.map((d) => (
                      <p key={d.id} className="text-warning">{d.date}: {d.isClosed ? "Closed" : `${formatMinutes(d.openMinute!)} – ${formatMinutes(d.closeMinute!)}`} {d.reason && `· ${d.reason}`}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4 rounded-2xl border border-line bg-surface p-4 text-sm">
                <p className="flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-brand" /> Amenities</p>
                <div className="flex flex-wrap gap-1.5">{salon.amenities.map((a) => <Badge key={a}><CheckCircle2 className="h-3 w-3" /> {a}</Badge>)}</div>
                {salon.parkingInfo && <p className="flex gap-2 text-ink-2"><Car className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{salon.parkingInfo}</p>}
                {salon.accessibilityInfo && <p className="flex gap-2 text-ink-2"><Accessibility className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{salon.accessibilityInfo}</p>}
                {p.resourceSummary.length > 0 && <p className="flex gap-2 text-ink-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{p.resourceSummary.map((r) => `${r.count} ${r.name}${r.count > 1 ? "s" : ""}`).join(" · ")}</p>}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm">
              <p className="mb-2 font-bold">Booking & cancellation policy</p>
              <ul className="list-disc space-y-1 pl-5 text-ink-2">
                {p.policy.policyText && <li>{p.policy.policyText}</li>}
                <li>Grace period for late arrival: {p.policy.graceMinutes} minutes. Late customers are served when a seat and stylist are free.</li>
                <li>
                  {p.policy.refundType === "REFUNDABLE" && "Free cancellation any time before your appointment."}
                  {p.policy.refundType === "NON_REFUNDABLE" && "Bookings are non-refundable."}
                  {p.policy.refundType === "TRANSFERABLE" && "Payments are non-refundable but can be moved to another slot (reschedule)."}
                  {p.policy.refundType === "PARTIAL" && [...p.policy.cancellationTiers].sort((a, b) => b.hoursBefore - a.hoursBefore).map((t) => `${t.refundPercent}% refund if cancelled ${t.hoursBefore}+ hrs before`).join("; ") + "; no refund after that."}
                </li>
                <li>{p.policy.allowReschedule ? `Reschedule up to ${p.policy.rescheduleMinHours} hours before (max ${p.policy.maxReschedules} times).` : "Rescheduling isn't available."}</li>
                <li>No-show refund: {p.policy.noShowRefundPercent}%.</li>
              </ul>
            </div>
          </section>
        </div>

        {/* sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="hidden rounded-2xl border border-line bg-surface p-5 shadow-card lg:block">
            <p className="text-sm text-muted">Services from</p>
            <p className="text-2xl font-bold">{salon.startingPrice ? formatINR(salon.startingPrice) : "—"}</p>
            <ButtonLink href={bookHref()} block size="lg" className="mt-4">Book an appointment</ButtonLink>
            <p className="mt-2 text-center text-xs text-muted">Live availability · Secure payment · Instant confirmation</p>
          </div>
          {location && (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <SalonMapLazy height={200} center={[location.lat, location.lng]} salons={[{ id: salon.id, name: salon.name, lat: location.lat, lng: location.lng, ratingAvg: salon.ratingAvg, distanceKm: null, startingPrice: salon.startingPrice, href: "#" }]} />
              <div className="space-y-2 p-4 text-sm">
                <p className="text-ink-2">{location.addressLine}, {location.area}, {location.city} {location.pincode}</p>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`} variant="secondary" size="sm" target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" /> Directions</ButtonLink>
                  {salon.phone && <ButtonLink href={`tel:${salon.phone.replace(/\s/g, "")}`} variant="secondary" size="sm"><Phone className="h-4 w-4" /> Call</ButtonLink>}
                  {salon.email && <ButtonLink href={`mailto:${salon.email}`} variant="ghost" size="sm"><Mail className="h-4 w-4" /> Email</ButtonLink>}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-surface/95 p-3 backdrop-blur md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{salon.name}</p>
            <p className="text-xs text-muted">From {salon.startingPrice ? formatINR(salon.startingPrice) : "—"}</p>
          </div>
          <ButtonLink href={bookHref()} size="lg">Book now</ButtonLink>
        </div>
      </div>
    </div>
  );
}
