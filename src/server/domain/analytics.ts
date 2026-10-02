import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { salons } from "../db/schema";
import { addDaysKey, toDateKey, zonedToUtc } from "@/lib/time";

const num = (v: unknown) => Number(v ?? 0);
const REVENUE_STATUSES = sql`('CONFIRMED','CHECKED_IN','WAITING','IN_SERVICE','COMPLETED')`;

async function tzOf(salonId: string) {
  const s = await db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { timezone: true } });
  return s?.timezone ?? "Asia/Kolkata";
}

/** Today's operational KPIs for the owner dashboard header. */
export async function getTodayOverview(salonId: string) {
  const tz = await tzOf(salonId);
  const today = toDateKey(new Date(), tz);
  const from = zonedToUtc(today, 0, tz);
  const to = zonedToUtc(addDaysKey(today, 1), 0, tz);
  const res = await db.execute<Record<string, unknown>>(sql`
    select
      count(*) filter (where status in ${REVENUE_STATUSES}) as bookings,
      count(*) filter (where status in ${REVENUE_STATUSES} and source = 'ONLINE') as online,
      count(*) filter (where status in ${REVENUE_STATUSES} and source <> 'ONLINE') as walkins,
      count(*) filter (where status = 'CANCELLED') as cancelled,
      count(*) filter (where status = 'NO_SHOW') as no_shows,
      count(*) filter (where status in ${REVENUE_STATUSES} and payment_status in ('PENDING','INITIATED')) as pending_payments,
      coalesce(sum(total - tax) filter (where status in ${REVENUE_STATUSES} and payment_status = 'SUCCESSFUL'), 0) as revenue,
      coalesce(sum(total - tax) filter (where status in ${REVENUE_STATUSES} and payment_status in ('PENDING','INITIATED')), 0) as pending_amount,
      count(*) filter (where status in ('CHECKED_IN','WAITING')) as waiting,
      count(*) filter (where status = 'IN_SERVICE') as in_service
    from bookings where salon_id = ${salonId} and starts_at >= ${from} and starts_at < ${to}`);
  const r = res.rows[0]!;
  const occ = await db.execute<{ total: number; occupied: number }>(sql`
    select (select count(*) from resources where salon_id = ${salonId} and active)::int as total,
           (select count(distinct br.resource_id) from booking_resources br join bookings b on b.id = br.booking_id
            where br.salon_id = ${salonId} and br.active and br.starts_at <= now() and br.ends_at > now()
              and b.status in ('CHECKED_IN','WAITING','IN_SERVICE','CONFIRMED'))::int as occupied`);
  return {
    date: today,
    bookings: num(r.bookings),
    online: num(r.online),
    walkins: num(r.walkins),
    cancelled: num(r.cancelled),
    noShows: num(r.no_shows),
    pendingPayments: num(r.pending_payments),
    pendingAmount: num(r.pending_amount),
    revenue: num(r.revenue),
    waiting: num(r.waiting),
    inService: num(r.in_service),
    resourcesTotal: num(occ.rows[0]?.total),
    resourcesOccupied: num(occ.rows[0]?.occupied),
  };
}

/** Business analytics over the last `days` days (revenue excludes GST). */
export async function getAnalytics(salonId: string, days = 30) {
  const tz = await tzOf(salonId);
  const today = toDateKey(new Date(), tz);
  const fromKey = addDaysKey(today, -(days - 1));
  const from = zonedToUtc(fromKey, 0, tz);
  const to = zonedToUtc(addDaysKey(today, 1), 0, tz);
  const base = sql`b.salon_id = ${salonId} and b.starts_at >= ${from} and b.starts_at < ${to}`;

  const [daily, totals, popular, peak, staffUtil, resUtil, customers, offers, weekday] = await Promise.all([
    db.execute<{ day: string; revenue: number; bookings: number; online: number; offline: number }>(sql`
      select to_char((b.starts_at at time zone ${tz})::date, 'YYYY-MM-DD') as day,
        coalesce(sum(b.total - b.tax) filter (where b.status in ${REVENUE_STATUSES} and b.payment_status in ('SUCCESSFUL','PARTIALLY_REFUNDED')),0)::int as revenue,
        count(*) filter (where b.status in ${REVENUE_STATUSES})::int as bookings,
        count(*) filter (where b.status in ${REVENUE_STATUSES} and b.source = 'ONLINE')::int as online,
        count(*) filter (where b.status in ${REVENUE_STATUSES} and b.source <> 'ONLINE')::int as offline
      from bookings b where ${base} group by 1 order by 1`),
    db.execute<Record<string, unknown>>(sql`
      select
        coalesce(sum(b.total - b.tax) filter (where b.status in ${REVENUE_STATUSES} and b.payment_status in ('SUCCESSFUL','PARTIALLY_REFUNDED')),0) as revenue,
        count(*) filter (where b.status in ${REVENUE_STATUSES}) as bookings,
        count(*) filter (where b.status = 'CANCELLED') as cancelled,
        count(*) filter (where b.status = 'NO_SHOW') as no_shows,
        count(*) filter (where b.status in ${REVENUE_STATUSES} and b.source = 'ONLINE') as online,
        count(*) filter (where b.status in ${REVENUE_STATUSES} and b.source <> 'ONLINE') as offline,
        count(*) filter (where b.status not in ('PAYMENT_PENDING','FAILED')) as all_bookings,
        coalesce(sum(b.discount) filter (where b.status in ${REVENUE_STATUSES}),0) as discounts
      from bookings b where ${base}`),
    db.execute<{ name: string; bookings: number; revenue: number }>(sql`
      select s.name, count(*)::int as bookings, coalesce(sum(b.total - b.tax),0)::int as revenue
      from bookings b join services s on s.id = b.service_id
      where ${base} and b.status in ${REVENUE_STATUSES} group by s.name order by bookings desc limit 8`),
    db.execute<{ hour: number; bookings: number }>(sql`
      select extract(hour from b.starts_at at time zone ${tz})::int as hour, count(*)::int as bookings
      from bookings b where ${base} and b.status in ${REVENUE_STATUSES} group by 1 order by 1`),
    db.execute<{ name: string; booked: number; scheduled: number; bookings: number; rating: number }>(sql`
      with sched as (
        select ss.staff_id, sum((ss.end_minute - ss.start_minute) - coalesce((select sum(sb.end_minute - sb.start_minute) from staff_breaks sb where sb.staff_id = ss.staff_id and sb.weekday = ss.weekday),0)) as weekly
        from staff_schedules ss group by ss.staff_id
      )
      select st.name, st.rating_avg as rating,
        coalesce((select sum(extract(epoch from (bs.ends_at - bs.starts_at)) / 60) from booking_staff bs join bookings b on b.id = bs.booking_id where bs.staff_id = st.id and ${base} and b.status in ${REVENUE_STATUSES}),0)::int as booked,
        (coalesce(sc.weekly,0) * ${days} / 7.0)::int as scheduled,
        (select count(*) from booking_staff bs join bookings b on b.id = bs.booking_id where bs.staff_id = st.id and ${base} and b.status in ${REVENUE_STATUSES})::int as bookings
      from staff st left join sched sc on sc.staff_id = st.id
      where st.salon_id = ${salonId} and st.active order by booked desc`),
    db.execute<{ name: string; type: string; booked: number }>(sql`
      select r.name, rt.name as type,
        coalesce((select sum(extract(epoch from (br.ends_at - br.starts_at)) / 60) from booking_resources br join bookings b on b.id = br.booking_id where br.resource_id = r.id and ${base} and b.status in ${REVENUE_STATUSES}),0)::int as booked
      from resources r join resource_types rt on rt.id = r.resource_type_id where r.salon_id = ${salonId} and r.active order by rt.name, r.sort`),
    db.execute<Record<string, unknown>>(sql`
      with c as (
        select coalesce(b.customer_id::text, 'w:' || b.walk_in_customer_id::text, 'p:' || b.customer_phone) as cid, min(b.starts_at) as first_visit,
          count(*) filter (where b.starts_at >= ${from}) as in_range
        from bookings b where b.salon_id = ${salonId} and b.status in ${REVENUE_STATUSES} group by 1
      )
      select count(*) filter (where in_range > 0 and first_visit >= ${from}) as new_customers,
             count(*) filter (where in_range > 0 and first_visit < ${from}) as returning_customers,
             count(*) filter (where in_range > 1) as repeat_in_range,
             count(*) filter (where in_range > 0) as active_customers
      from c`),
    db.execute<{ code: string; title: string; uses: number; discount: number; revenue: number }>(sql`
      select c.code, c.title, count(u.id)::int as uses, coalesce(sum(u.discount),0)::int as discount, coalesce(sum(b.total - b.tax),0)::int as revenue
      from coupons c left join coupon_usage u on u.coupon_id = c.id left join bookings b on b.id = u.booking_id
      where c.salon_id = ${salonId} group by c.id order by uses desc`),
    db.execute<{ dow: number; bookings: number }>(sql`
      select extract(dow from b.starts_at at time zone ${tz})::int as dow, count(*)::int as bookings
      from bookings b where ${base} and b.status in ${REVENUE_STATUSES} group by 1 order by 1`),
  ]);

  const t = totals.rows[0]!;
  const bookingsN = num(t.bookings);
  const all = num(t.all_bookings);
  const openMinutes = await db.execute<{ m: number }>(sql`select coalesce(sum(close_minute - open_minute),0)::int as m from business_hours where salon_id = ${salonId}`);
  const weeklyOpen = num(openMinutes.rows[0]?.m);
  const dayMap = new Map(daily.rows.map((d) => [d.day, d]));
  const c = customers.rows[0]!;
  return {
    range: { from: fromKey, to: today, days },
    totals: {
      revenue: num(t.revenue),
      bookings: bookingsN,
      averageOrderValue: bookingsN ? Math.round(num(t.revenue) / bookingsN) : 0,
      cancellationRate: all ? num(t.cancelled) / all : 0,
      noShowRate: all ? num(t.no_shows) / all : 0,
      online: num(t.online),
      offline: num(t.offline),
      discounts: num(t.discounts),
      newCustomers: num(c.new_customers),
      returningCustomers: num(c.returning_customers),
      retentionRate: num(c.active_customers) ? (num(c.returning_customers) + num(c.repeat_in_range)) / (num(c.active_customers) * 1) : 0,
    },
    daily: Array.from({ length: days }, (_, i) => {
      const day = addDaysKey(fromKey, i);
      const d = dayMap.get(day);
      return { day, revenue: d?.revenue ?? 0, bookings: d?.bookings ?? 0, online: d?.online ?? 0, offline: d?.offline ?? 0 };
    }),
    popularServices: popular.rows,
    peakHours: Array.from({ length: 24 }, (_, h) => ({ hour: h, bookings: peak.rows.find((p) => p.hour === h)?.bookings ?? 0 })).filter((x) => x.hour >= 7 && x.hour <= 22),
    weekday: Array.from({ length: 7 }, (_, d) => ({ dow: d, bookings: weekday.rows.find((w) => w.dow === d)?.bookings ?? 0 })),
    staffUtilization: staffUtil.rows.map((s) => ({ ...s, utilization: s.scheduled ? Math.min(1, s.booked / s.scheduled) : 0 })),
    resourceUtilization: resUtil.rows.map((r) => ({ ...r, utilization: weeklyOpen ? Math.min(1, r.booked / ((weeklyOpen * days) / 7)) : 0 })),
    offers: offers.rows,
  };
}
