import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  areas,
  businessHours,
  coupons,
  holidays,
  resourceTypes,
  resources,
  reviews,
  salonImages,
  salonLocations,
  salons,
  serviceCategories,
  serviceOptionGroups,
  serviceOptions,
  services,
  staff,
  staffServices,
  users,
} from "../db/schema";
import { loadDayContext, loadServiceSelection, getPolicy } from "../booking/context";
import { evaluateSlot, listSlots } from "../booking/engine-core";
import { getPlatformConfig } from "../settings";
import { approxTravelMinutes } from "@/lib/utils";
import { minutesOfDay, toDateKey, zonedToUtc } from "@/lib/time";

export type SearchFilters = {
  q?: string;
  lat?: number;
  lng?: number;
  area?: string;
  city?: string;
  category?: string;
  date?: string;
  time?: number; // minute of day
  priceMin?: number; // paise
  priceMax?: number;
  ratingMin?: number;
  maxDistanceKm?: number;
  offers?: boolean;
  openNow?: boolean;
  gender?: "MEN" | "WOMEN" | "UNISEX" | "KIDS";
  maxDuration?: number;
  sort?: "relevance" | "distance" | "rating" | "price" | "availability";
  page?: number;
  pageSize?: number;
  ids?: string[];
};

export type SalonCard = {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  tagline: string | null;
  area: string;
  city: string;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
  coverUrl: string | null;
  logoUrl: string | null;
  brandColor: string;
  genderType: string;
  startingPrice: number | null;
  distanceKm: number | null;
  travelMinutes: number | null;
  openNow: boolean;
  offer: string | null;
  matchedService: { id: string; name: string; price: number; durationMinutes: number } | null;
  availability: { requestedAvailable: boolean; nearestMinute: number | null; message: string | null } | null;
};

const distanceExpr = (lat: number, lng: number) =>
  sql<number>`(6371 * 2 * asin(sqrt(power(sin(radians(${salonLocations.lat} - ${lat}) / 2), 2) + cos(radians(${lat})) * cos(radians(${salonLocations.lat})) * power(sin(radians(${salonLocations.lng} - ${lng}) / 2), 2))))`;

const openNowExpr = sql<boolean>`(
  exists (
    select 1 from business_hours bh
    where bh.salon_id = ${salons.id}
      and bh.weekday = extract(dow from (now() at time zone ${salons.timezone}))::int
      and (extract(hour from (now() at time zone ${salons.timezone})) * 60 + extract(minute from (now() at time zone ${salons.timezone})))
          between bh.open_minute and bh.close_minute - 1
  )
  and not exists (
    select 1 from holidays h where h.salon_id = ${salons.id} and h.is_closed and h.date = (now() at time zone ${salons.timezone})::date
  )
)`;

const offerExpr = sql<string | null>`(
  select c.title from coupons c
  where (c.salon_id = ${salons.id}) and c.active and c.valid_from <= now() and c.valid_to >= now()
    and (c.usage_limit is null or c.used_count < c.usage_limit)
  order by c.value desc limit 1
)`;

async function publicStatuses() {
  const cfg = await getPlatformConfig();
  return cfg.showUnapprovedSalons ? (["APPROVED", "PENDING", "UNDER_REVIEW"] as const) : (["APPROVED"] as const);
}

/**
 * Salon discovery. Filtering/sorting/pagination happen in SQL; when the
 * customer asks for a specific date+time the shortlisted salons are then run
 * through the real availability engine (seats, staff, bookings, walk-ins,
 * holds, breaks, holidays) so only salons that can actually serve them show.
 */
export async function searchSalons(f: SearchFilters): Promise<{ items: SalonCard[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(30, Math.max(1, f.pageSize ?? 12));
  const statuses = await publicStatuses();
  const hasGeo = f.lat != null && f.lng != null;
  const dist = hasGeo ? distanceExpr(f.lat!, f.lng!) : sql<number>`null`;
  const q = f.q?.trim().toLowerCase();

  // service-level filter used for "matched service" + price + duration filters
  const svcConds = [sql`sv.salon_id = ${salons.id}`, sql`sv.active`];
  if (f.category) svcConds.push(sql`sv.category_id = (select id from service_categories where slug = ${f.category})`);
  if (q) svcConds.push(sql`(lower(sv.name) like ${"%" + q + "%"} or lower(${salons.name}) like ${"%" + q + "%"} or lower(${salonLocations.area}) like ${"%" + q + "%"})`);
  if (f.maxDuration) svcConds.push(sql`sv.duration_minutes <= ${f.maxDuration}`);
  if (f.priceMin != null) svcConds.push(sql`sv.price >= ${f.priceMin}`);
  if (f.priceMax != null) svcConds.push(sql`sv.price <= ${f.priceMax}`);
  if (f.gender && f.gender !== "UNISEX") svcConds.push(sql`sv.gender in (${f.gender}, 'UNISEX')`);
  const svcWhere = sql.join(svcConds, sql` and `);
  const needsServiceMatch = !!(f.category || q || f.maxDuration || f.priceMin != null || f.priceMax != null);

  const matchedExpr = sql<string | null>`(select sv.id from services sv where ${svcWhere} order by sv.price asc limit 1)`;

  const where = [inArray(salons.status, [...statuses])];
  if (f.ids?.length) where.push(inArray(salons.id, f.ids));
  if (f.city) where.push(sql`lower(${salonLocations.city}) = ${f.city.toLowerCase()}`);
  if (f.area) where.push(sql`lower(${salonLocations.area}) = ${f.area.toLowerCase()}`);
  if (f.ratingMin) where.push(sql`${salons.ratingAvg} >= ${f.ratingMin}`);
  if (f.gender && f.gender !== "UNISEX") where.push(sql`${salons.genderType} in (${f.gender}, 'UNISEX')`);
  if (needsServiceMatch) where.push(sql`exists (select 1 from services sv where ${svcWhere})`);
  if (f.offers) where.push(sql`${offerExpr} is not null`);
  if (f.openNow) where.push(openNowExpr);
  if (hasGeo && f.maxDistanceKm) {
    // bounding box first (uses the lat/lng index), exact distance second
    const dLat = f.maxDistanceKm / 111;
    const dLng = f.maxDistanceKm / (111 * Math.cos((f.lat! * Math.PI) / 180));
    where.push(sql`${salonLocations.lat} between ${f.lat! - dLat} and ${f.lat! + dLat}`);
    where.push(sql`${salonLocations.lng} between ${f.lng! - dLng} and ${f.lng! + dLng}`);
    where.push(sql`${dist} <= ${f.maxDistanceKm}`);
  }

  const priceExpr = needsServiceMatch ? sql<number | null>`(select min(sv.price) from services sv where ${svcWhere})` : sql<number | null>`${salons.startingPrice}`;
  const relevance = q
    ? sql`(case when lower(${salons.name}) like ${q + "%"} then 3 when lower(${salons.name}) like ${"%" + q + "%"} then 2 else 1 end) desc, ${salons.ratingAvg} desc`
    : hasGeo
      ? sql`${dist} asc`
      : sql`${salons.featured} desc, ${salons.ratingAvg} desc`;
  const order =
    f.sort === "distance" && hasGeo
      ? sql`${dist} asc`
      : f.sort === "rating"
        ? sql`${salons.ratingAvg} desc, ${salons.ratingCount} desc`
        : f.sort === "price"
          ? sql`${priceExpr} asc nulls last`
          : relevance;

  const availabilityMode = !!(f.date && f.time != null);
  const base = db
    .select({
      id: salons.id,
      name: salons.name,
      slug: salons.slug,
      citySlug: salons.citySlug,
      tagline: salons.tagline,
      timezone: salons.timezone,
      area: salonLocations.area,
      city: salonLocations.city,
      lat: salonLocations.lat,
      lng: salonLocations.lng,
      ratingAvg: salons.ratingAvg,
      ratingCount: salons.ratingCount,
      coverUrl: salons.coverUrl,
      logoUrl: salons.logoUrl,
      brandColor: salons.brandColor,
      genderType: salons.genderType,
      startingPrice: priceExpr,
      distanceKm: dist,
      openNow: openNowExpr,
      offer: offerExpr,
      matchedServiceId: needsServiceMatch ? matchedExpr : sql<string | null>`null`,
      total: sql<number>`count(*) over()`,
    })
    .from(salons)
    .innerJoin(salonLocations, eq(salonLocations.salonId, salons.id))
    .where(and(...where))
    .orderBy(order);

  // In availability mode we shortlist more and filter after the engine runs.
  const rows = availabilityMode ? await base.limit(60) : await base.limit(pageSize).offset((page - 1) * pageSize);

  const matchedIds = rows.map((r) => r.matchedServiceId).filter(Boolean) as string[];
  const matched = matchedIds.length
    ? await db.select({ id: services.id, name: services.name, price: services.price, durationMinutes: services.durationMinutes }).from(services).where(inArray(services.id, matchedIds))
    : [];

  let cards: SalonCard[] = rows.map((r) => {
    const km = r.distanceKm == null ? null : Number(r.distanceKm);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      citySlug: r.citySlug,
      tagline: r.tagline,
      area: r.area,
      city: r.city,
      lat: r.lat,
      lng: r.lng,
      ratingAvg: Number(r.ratingAvg),
      ratingCount: r.ratingCount,
      coverUrl: r.coverUrl,
      logoUrl: r.logoUrl,
      brandColor: r.brandColor,
      genderType: r.genderType,
      startingPrice: r.startingPrice == null ? null : Number(r.startingPrice),
      distanceKm: km,
      travelMinutes: km == null ? null : approxTravelMinutes(km),
      openNow: !!r.openNow,
      offer: r.offer,
      matchedService: matched.find((m) => m.id === r.matchedServiceId) ?? null,
      availability: null,
    };
  });

  if (!availabilityMode) return { items: cards, total: Number(rows[0]?.total ?? 0), page, pageSize };

  // ---- real availability around the requested time (±60 min)
  const now = Date.now();
  const evaluated = await Promise.all(
    cards.map(async (c) => {
      const serviceId = c.matchedService?.id ?? (await cheapestService(c.id));
      if (!serviceId) return { ...c, availability: { requestedAvailable: false, nearestMinute: null, message: "No bookable services" } };
      try {
        const sel = await loadServiceSelection(db, c.id, serviceId, []);
        const { ctx, staffLoad, toInstant, toMinute } = await loadDayContext(db, c.id, f.date!);
        const exact = evaluateSlot(ctx, sel.spec, toInstant(f.time!), { now, staffLoad });
        if (exact.available) return { ...c, availability: { requestedAvailable: true, nearestMinute: f.time!, message: null } };
        const slots = listSlots(ctx, sel.spec, toInstant, toMinute, { now, staffLoad }).filter((s) => s.available && Math.abs(s.minute - f.time!) <= 60);
        slots.sort((a, b) => Math.abs(a.minute - f.time!) - Math.abs(b.minute - f.time!));
        return { ...c, availability: { requestedAvailable: false, nearestMinute: slots[0]?.minute ?? null, message: exact.message } };
      } catch {
        return { ...c, availability: { requestedAvailable: false, nearestMinute: null, message: "Unavailable" } };
      }
    }),
  );
  cards = evaluated.filter((c) => c.availability?.requestedAvailable || c.availability?.nearestMinute != null);
  if (f.sort === "availability" || !f.sort || f.sort === "relevance") {
    cards.sort((a, b) => Number(b.availability!.requestedAvailable) - Number(a.availability!.requestedAvailable));
  }
  const total = cards.length;
  return { items: cards.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

async function cheapestService(salonId: string) {
  const s = await db.query.services.findFirst({ where: and(eq(services.salonId, salonId), eq(services.active, true)), orderBy: asc(services.price), columns: { id: true } });
  return s?.id ?? null;
}

export async function suggest(q: string) {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return { salons: [], services: [], areas: [], categories: [] };
  const like = `%${term}%`;
  const statuses = await publicStatuses();
  const [salonRows, serviceRows, areaRows, catRows] = await Promise.all([
    db
      .select({ id: salons.id, name: salons.name, slug: salons.slug, citySlug: salons.citySlug, area: salonLocations.area })
      .from(salons)
      .innerJoin(salonLocations, eq(salonLocations.salonId, salons.id))
      .where(and(inArray(salons.status, [...statuses]), sql`lower(${salons.name}) like ${like}`))
      .orderBy(desc(salons.ratingAvg))
      .limit(5),
    db.selectDistinct({ name: services.name }).from(services).where(and(eq(services.active, true), sql`lower(${services.name}) like ${like}`)).limit(5),
    db.select({ name: areas.name, city: areas.city, lat: areas.lat, lng: areas.lng }).from(areas).where(sql`lower(${areas.name}) like ${like}`).limit(5),
    db.select({ slug: serviceCategories.slug, name: serviceCategories.name }).from(serviceCategories).where(sql`lower(${serviceCategories.name}) like ${like}`).limit(4),
  ]);
  return { salons: salonRows, services: serviceRows.map((s) => s.name), areas: areaRows, categories: catRows };
}

export async function listCategories() {
  return db.select().from(serviceCategories).orderBy(asc(serviceCategories.sort));
}

export async function listAreas(city?: string) {
  return db.select().from(areas).where(city ? eq(areas.city, city) : undefined).orderBy(asc(areas.name));
}

/* ------------------------------------------------------------ profile */

export async function getSalonIdBySlug(citySlug: string, slug: string) {
  const s = await db.query.salons.findFirst({ where: and(eq(salons.citySlug, citySlug), eq(salons.slug, slug)), columns: { id: true, status: true } });
  return s ?? null;
}

export async function getSalonProfile(salonId: string) {
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, salonId) });
  if (!salon) return null;
  const [location, images, hours, specialDays, svcRows, cats, staffRows, offers, reviewRows, policy, groups] = await Promise.all([
    db.query.salonLocations.findFirst({ where: eq(salonLocations.salonId, salonId) }),
    db.query.salonImages.findMany({ where: eq(salonImages.salonId, salonId), orderBy: asc(salonImages.sort) }),
    db.query.businessHours.findMany({ where: eq(businessHours.salonId, salonId), orderBy: [asc(businessHours.weekday), asc(businessHours.openMinute)] }),
    db.query.holidays.findMany({
      where: and(eq(holidays.salonId, salonId), sql`${holidays.date} >= current_date`, sql`${holidays.date} <= current_date + 30`),
      orderBy: asc(holidays.date),
    }),
    db.query.services.findMany({ where: and(eq(services.salonId, salonId), eq(services.active, true)), orderBy: [asc(services.sort), asc(services.price)] }),
    db.select().from(serviceCategories).orderBy(asc(serviceCategories.sort)),
    db.query.staff.findMany({ where: and(eq(staff.salonId, salonId), eq(staff.active, true)), orderBy: desc(staff.ratingAvg) }),
    db.query.coupons.findMany({
      where: and(eq(coupons.salonId, salonId), eq(coupons.active, true), lt(coupons.validFrom, new Date()), gt(coupons.validTo, new Date())),
      orderBy: desc(coupons.value),
    }),
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        ownerReply: reviews.ownerReply,
        createdAt: reviews.createdAt,
        customerName: users.name,
        serviceName: services.name,
        staffName: staff.name,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.customerId))
      .leftJoin(services, eq(services.id, reviews.serviceId))
      .leftJoin(staff, eq(staff.id, reviews.staffId))
      .where(and(eq(reviews.salonId, salonId), eq(reviews.status, "PUBLISHED")))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
    getPolicy(db, salonId),
    svcIdsGroups(salonId),
  ]);
  const skills = staffRows.length ? await db.select().from(staffServices).where(inArray(staffServices.staffId, staffRows.map((s) => s.id))) : [];
  const resourceSummary = await db
    .select({ name: resourceTypes.name, count: sql<number>`count(${resources.id})::int` })
    .from(resourceTypes)
    .leftJoin(resources, and(eq(resources.resourceTypeId, resourceTypes.id), eq(resources.active, true)))
    .where(eq(resourceTypes.salonId, salonId))
    .groupBy(resourceTypes.name);

  return {
    salon,
    location: location ?? null,
    images,
    hours,
    specialDays,
    services: svcRows.map((s) => ({
      ...s,
      category: cats.find((c) => c.id === s.categoryId) ?? null,
      optionGroups: groups.filter((g) => g.serviceId === s.id),
      staffIds: skills.filter((k) => k.serviceId === s.id).map((k) => k.staffId),
    })),
    categories: cats,
    staff: staffRows.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      avatarUrl: s.avatarUrl,
      specialization: s.specialization,
      experienceYears: s.experienceYears,
      ratingAvg: s.ratingAvg,
      ratingCount: s.ratingCount,
      serviceIds: skills.filter((k) => k.staffId === s.id).map((k) => k.serviceId),
    })),
    offers,
    reviews: reviewRows,
    policy,
    resourceSummary,
  };
}

async function svcIdsGroups(salonId: string) {
  const groups = await db
    .select({ id: serviceOptionGroups.id, serviceId: serviceOptionGroups.serviceId, name: serviceOptionGroups.name, multiSelect: serviceOptionGroups.multiSelect, required: serviceOptionGroups.required, sort: serviceOptionGroups.sort })
    .from(serviceOptionGroups)
    .innerJoin(services, eq(services.id, serviceOptionGroups.serviceId))
    .where(eq(services.salonId, salonId))
    .orderBy(asc(serviceOptionGroups.sort));
  const opts = groups.length ? await db.select().from(serviceOptions).where(inArray(serviceOptions.groupId, groups.map((g) => g.id))).orderBy(asc(serviceOptions.sort)) : [];
  return groups.map((g) => ({ ...g, options: opts.filter((o) => o.groupId === g.id) }));
}

export type SalonProfile = NonNullable<Awaited<ReturnType<typeof getSalonProfile>>>;

/* -------------------------------------------------------- availability */

export async function getAvailability(input: { salonId: string; serviceId: string; date: string; optionIds?: string[]; staffPreference?: string | null }) {
  const sel = await loadServiceSelection(db, input.salonId, input.serviceId, input.optionIds ?? []);
  const { ctx, staffLoad, toInstant, toMinute } = await loadDayContext(db, input.salonId, input.date);
  const slots = listSlots(ctx, sel.spec, toInstant, toMinute, { now: Date.now(), staffLoad, staffPreference: input.staffPreference });
  return {
    date: input.date,
    timezone: ctx.timezone,
    closed: ctx.open.length === 0,
    closedReason: ctx.closedReason,
    bookable: ctx.bookable,
    durationMinutes: sel.spec.durationMinutes,
    bufferMinutes: sel.spec.bufferMinutes,
    slots,
  };
}

/** Next few dates with at least one free slot — powers "Available today/tomorrow" badges. */
export async function nextAvailableToday(salonId: string) {
  const s = await db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { timezone: true } });
  if (!s) return null;
  const svc = await cheapestService(salonId);
  if (!svc) return null;
  const date = toDateKey(new Date(), s.timezone);
  const a = await getAvailability({ salonId, serviceId: svc, date });
  const first = a.slots.find((x) => x.available);
  return first ? first.minute : null;
}

export function currentMinute(tz: string) {
  return minutesOfDay(new Date(), tz);
}

export { zonedToUtc };

/** Landing-page data. "Trending" is ranked by real bookings in the last 14 days — no fake popularity. */
export async function getLandingData() {
  const statuses = await publicStatuses();
  const trendingRows = await db.execute<{ salon_id: string; n: number }>(sql`
    select b.salon_id, count(*)::int as n from bookings b join salons s on s.id = b.salon_id
    where b.created_at > now() - interval '14 days' and b.status not in ('FAILED','PAYMENT_PENDING','CANCELLED') and s.status in ${sql.raw(`(${statuses.map((x) => `'${x}'`).join(",")})`)}
    group by 1 order by n desc limit 8`);
  const trendingIds = trendingRows.rows.map((r) => r.salon_id);
  const [categories, topRated, trending, offers] = await Promise.all([
    listCategories(),
    searchSalons({ sort: "rating", pageSize: 8 }),
    trendingIds.length ? searchSalons({ ids: trendingIds, pageSize: 8 }) : Promise.resolve({ items: [] as SalonCard[] }),
    db
      .select({ id: coupons.id, code: coupons.code, title: coupons.title, description: coupons.description, validTo: coupons.validTo, kind: coupons.kind, salonName: salons.name, salonSlug: salons.slug, citySlug: salons.citySlug, brandColor: salons.brandColor, salonId: salons.id })
      .from(coupons)
      .innerJoin(salons, eq(salons.id, coupons.salonId))
      .where(and(eq(coupons.active, true), lt(coupons.validFrom, new Date()), gt(coupons.validTo, new Date()), inArray(salons.status, [...statuses])))
      .orderBy(desc(coupons.value))
      .limit(12),
  ]);
  const order = new Map(trendingIds.map((id, i) => [id, i]));
  return {
    categories,
    topRated: topRated.items,
    trending: [...trending.items].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((s) => ({ ...s, recentBookings: trendingRows.rows.find((r) => r.salon_id === s.id)?.n ?? 0 })),
    offers,
  };
}

export async function getPlatformOffers() {
  return db.query.coupons.findMany({ where: and(sql`${coupons.salonId} is null`, eq(coupons.active, true), gt(coupons.validTo, new Date())) });
}
