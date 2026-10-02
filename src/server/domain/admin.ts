import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { getPlatformConfig } from "../settings";

export async function getPlatformStats() {
  const cfg = await getPlatformConfig();
  const r = await db.execute<Record<string, number>>(sql`
    select
      (select count(*) from users where status <> 'DELETED')::int as users,
      (select count(*) from users where role = 'CUSTOMER' and status = 'ACTIVE')::int as customers,
      (select count(distinct customer_id) from bookings where created_at > now() - interval '30 days')::int as active_users,
      (select count(*) from salons)::int as salons,
      (select count(*) from salons where status = 'APPROVED')::int as active_salons,
      (select count(*) from salons where status in ('PENDING','UNDER_REVIEW'))::int as pending_salons,
      (select count(*) from bookings where (starts_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date and status in ('CONFIRMED','CHECKED_IN','WAITING','IN_SERVICE','COMPLETED'))::int as bookings_today,
      (select coalesce(sum(total),0) from bookings where status in ('CONFIRMED','CHECKED_IN','WAITING','IN_SERVICE','COMPLETED') and source = 'ONLINE' and payment_status in ('SUCCESSFUL','PARTIALLY_REFUNDED') and created_at > now() - interval '30 days')::bigint as gmv_30d,
      (select coalesce(sum((b.total - b.tax) * coalesce(s.commission_percent, case s.plan when 'FREE' then ${cfg.planCommission.FREE} when 'PRO' then ${cfg.planCommission.PRO} else ${cfg.planCommission.PREMIUM} end) / 100.0),0)
         from bookings b join salons s on s.id = b.salon_id
         where b.source = 'ONLINE' and b.status in ('CONFIRMED','CHECKED_IN','WAITING','IN_SERVICE','COMPLETED') and b.payment_status in ('SUCCESSFUL','PARTIALLY_REFUNDED') and b.created_at > now() - interval '30 days')::bigint as commission_30d,
      (select count(*) from refunds where status = 'FAILED')::int as failed_refunds,
      (select count(*) from reviews where status = 'FLAGGED')::int as flagged_reviews,
      (select count(*) from disputes where status in ('OPEN','IN_REVIEW'))::int as open_disputes`);
  const daily = await db.execute<{ day: string; bookings: number; gmv: number }>(sql`
    select to_char((created_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, count(*)::int as bookings, coalesce(sum(total),0)::int as gmv
    from bookings where source = 'ONLINE' and status in ('CONFIRMED','CHECKED_IN','WAITING','IN_SERVICE','COMPLETED') and created_at > now() - interval '30 days'
    group by 1 order by 1`);
  const row = r.rows[0]!;
  return { ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])), daily: daily.rows };
}
