import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Heart } from "lucide-react";
import { db } from "@/server/db";
import { favorites } from "@/server/db/schema";
import { requirePageUser } from "@/server/auth/session";
import { searchSalons } from "@/server/domain/salons";
import { SalonCard } from "@/components/customer/salon-card";
import { EmptyState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { minutesOfDay, toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Favourites" };

export default async function FavoritesPage() {
  const user = await requirePageUser(["CUSTOMER"]);
  const ids = (await db.select({ id: favorites.salonId }).from(favorites).where(eq(favorites.userId, user.id))).map((r) => r.id);
  const now = new Date();
  const nowMin = minutesOfDay(now, "Asia/Kolkata");
  const minute = Math.min(20 * 60 + 30, Math.ceil((nowMin + 60) / 15) * 15);
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const res = ids.length ? await searchSalons({ ids, pageSize: 30 }) : { items: [] };
  // "Upcoming availability" for each favourite (next hour today)
  const avail = ids.length ? await searchSalons({ ids, pageSize: 30, date: toDateKey(now), time: minute }) : { items: [] };
  const items = res.items.map((s) => ({ ...s, availability: avail.items.find((a) => a.id === s.id)?.availability ?? { requestedAvailable: false, nearestMinute: null, message: null } }));
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader title="Favourites" description={`Your saved salons, with live availability around ${time.replace(/^0/, "")} today.`} />
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((s) => <SalonCard key={s.id} salon={s} signedIn />)}</div>
      ) : (
        <EmptyState icon={<Heart className="h-6 w-6" />} title="No favourites yet" description="Tap the heart on any salon to save it here for quick booking." action={<ButtonLink href="/search">Explore salons</ButtonLink>} />
      )}
    </div>
  );
}
