import { z } from "zod";
import { searchSalons } from "@/server/domain/salons";
import { ok, parseQuery, route } from "@/server/http/handler";

const bool = z.enum(["1", "true", "0", "false"]).transform((v) => v === "1" || v === "true").optional();
const num = z.coerce.number().optional();
const querySchema = z.object({
  q: z.string().max(80).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  area: z.string().max(60).optional(),
  city: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  priceMin: num,
  priceMax: num,
  ratingMin: num,
  maxDistanceKm: num,
  offers: bool,
  openNow: bool,
  gender: z.enum(["MEN", "WOMEN", "UNISEX", "KIDS"]).optional(),
  maxDuration: z.coerce.number().int().optional(),
  sort: z.enum(["relevance", "distance", "rating", "price", "availability"]).optional(),
  page: z.coerce.number().int().min(1).max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(30).optional(),
});

/** GET /api/salons — search & discovery (paginated). Prices in rupees on the query string. */
export const GET = route(async (req) => {
  const q = parseQuery(req, querySchema);
  const time = q.time ? Number(q.time.slice(0, 2)) * 60 + Number(q.time.slice(3)) : undefined;
  const data = await searchSalons({
    ...q,
    time,
    priceMin: q.priceMin != null ? q.priceMin * 100 : undefined,
    priceMax: q.priceMax != null ? q.priceMax * 100 : undefined,
  });
  return ok(data);
});
