import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSalonIdBySlug, getSalonProfile } from "@/server/domain/salons";
import { getSessionUser } from "@/server/auth/session";
import { getPlatformConfig } from "@/server/settings";
import { toDateKey } from "@/lib/time";
import { BookingWizard } from "./booking-wizard";

type Props = { params: Promise<{ city: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export const metadata: Metadata = { title: "Book an appointment", robots: { index: false } };

export default async function BookPage({ params, searchParams }: Props) {
  const { city, slug } = await params;
  const sp = await searchParams;
  const ref = await getSalonIdBySlug(city, slug);
  const cfg = await getPlatformConfig();
  if (!ref || (ref.status !== "APPROVED" && !cfg.showUnapprovedSalons)) notFound();
  const [p, user] = await Promise.all([getSalonProfile(ref.id), getSessionUser()]);
  if (!p) notFound();
  return (
    <BookingWizard
      salon={{ id: p.salon.id, name: p.salon.name, citySlug: city, slug, brandColor: p.salon.brandColor, timezone: p.salon.timezone, area: p.location?.area ?? "", bookable: p.salon.status === "APPROVED" }}
      services={p.services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        price: s.price,
        durationMinutes: s.durationMinutes,
        bufferMinutes: s.bufferMinutes,
        staffRequired: s.staffRequired,
        category: s.category?.name ?? "Other",
        staffIds: s.staffIds,
        optionGroups: s.optionGroups.map((g) => ({ id: g.id, name: g.name, multiSelect: g.multiSelect, required: g.required, options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta, durationDelta: o.durationDelta })) })),
      }))}
      staff={p.staff.map((s) => ({ id: s.id, name: s.name, title: s.title, ratingAvg: s.ratingAvg, avatarUrl: s.avatarUrl }))}
      policy={{ bookingWindowDays: p.policy.bookingWindowDays, refundType: p.policy.refundType, cancellationTiers: p.policy.cancellationTiers, graceMinutes: p.policy.graceMinutes, lockMinutes: p.policy.lockMinutes }}
      user={user ? { role: user.role, name: user.name } : null}
      initial={{ serviceId: sp.service, date: sp.date ?? toDateKey(new Date(), p.salon.timezone) }}
    />
  );
}
