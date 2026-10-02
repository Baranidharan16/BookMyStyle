import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { salons } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const rows = await db.select({ slug: salons.slug, city: salons.citySlug, updatedAt: salons.updatedAt }).from(salons).where(eq(salons.status, "APPROVED"));
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/offers`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/for-salon-owners`, changeFrequency: "monthly", priority: 0.5 },
    ...rows.map((r) => ({ url: `${base}/salons/${r.city}/${r.slug}`, lastModified: r.updatedAt, changeFrequency: "daily" as const, priority: 0.9 })),
  ];
}
