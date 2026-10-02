import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";

/** This salon's customers only (online + walk-in), aggregated from its own bookings. */
export const GET = salonRoute("VIEW_CUSTOMERS", async ({ req, params }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const like = `%${q}%`;
  const rows = await db.execute<{ key: string; name: string; phone: string | null; type: string; visits: number; spent: number; last_visit: Date; first_visit: Date; no_shows: number }>(sql`
    select coalesce(b.customer_id::text, 'w:' || coalesce(b.walk_in_customer_id::text, b.customer_phone, b.id::text)) as key,
      max(b.customer_name) as name, max(b.customer_phone) as phone,
      case when bool_or(b.customer_id is not null) then 'ONLINE' else 'WALK_IN' end as type,
      count(*) filter (where b.status = 'COMPLETED')::int as visits,
      coalesce(sum(b.total - b.tax) filter (where b.status = 'COMPLETED'),0)::int as spent,
      max(b.starts_at) filter (where b.status in ('COMPLETED','CONFIRMED','CHECKED_IN','IN_SERVICE')) as last_visit,
      min(b.starts_at) as first_visit,
      count(*) filter (where b.status = 'NO_SHOW')::int as no_shows
    from bookings b
    where b.salon_id = ${params.salonId} and b.status <> 'PAYMENT_PENDING' and b.status <> 'FAILED'
      ${q ? sql`and (b.customer_name ilike ${like} or b.customer_phone ilike ${like})` : sql``}
    group by 1 order by last_visit desc nulls last limit 200`);
  return ok(rows.rows);
});
