import type { Metadata } from "next";
import { Suspense } from "react";
import { getSessionUser } from "@/server/auth/session";
import { listCategories } from "@/server/domain/salons";
import { SearchView } from "./search-view";

export const metadata: Metadata = { title: "Find salons near you", description: "Search salons, barbers and spas by service, area, price, rating and real-time availability." };

export default async function SearchPage() {
  const [user, categories] = await Promise.all([getSessionUser(), listCategories()]);
  return (
    <Suspense>
      <SearchView signedIn={user?.role === "CUSTOMER"} categories={categories.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))} />
    </Suspense>
  );
}
