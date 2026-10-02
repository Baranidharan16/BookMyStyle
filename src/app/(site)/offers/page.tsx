import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, Clock } from "lucide-react";
import { getLandingData, getPlatformOffers } from "@/server/domain/salons";
import { SalonCover } from "@/components/customer/salon-cover";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/time";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Offers & deals", description: "Salon, spa and grooming offers near you — coupons, festival deals and first-visit discounts." };
export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const [{ offers }, platform] = await Promise.all([getLandingData(), getPlatformOffers()]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow="Deals" title="Offers & coupons" description="Apply the code at checkout. Discounts are validated live against each offer's rules." />
      {platform.length > 0 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {platform.map((c) => (
            <div key={c.id} className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand to-[#6e1638] p-5 text-white">
              <BadgePercent className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{c.title}</p>
                <p className="text-sm text-white/80">Valid at every salon{c.minAmount ? ` · min ${formatINR(c.minAmount)}` : ""}</p>
              </div>
              <span className="rounded-lg border border-dashed border-white px-3 py-1 font-mono font-bold">{c.code}</span>
            </div>
          ))}
        </div>
      )}
      {offers.length === 0 ? (
        <EmptyState title="No active offers right now" description="Check back soon — salons add new deals every week." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => (
            <Link key={o.id} href={`/salons/${o.citySlug}/${o.salonSlug}#offers`} className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card hover:shadow-pop">
              <div className="relative h-28"><SalonCover seed={o.salonId} color={o.brandColor} variant={1} /><span className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-0.5 text-xs font-bold text-white">{o.salonName}</span></div>
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">{o.kind.replace("_", " ").toLowerCase()}</p>
                <p className="mt-1 font-bold group-hover:text-brand">{o.title}</p>
                {o.description && <p className="mt-0.5 text-sm text-muted">{o.description}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-lg border border-dashed border-accent px-2 py-0.5 font-mono text-sm font-bold text-accent">{o.code}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted"><Clock className="h-3.5 w-3.5" /> till {formatDate(o.validTo, undefined, { weekday: undefined })}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
