import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/session";
import { addDaysKey, toDateKey } from "@/lib/time";

export const TZ = "Asia/Kolkata";
export const H = (h: number, m = 0) => h * 60 + m;
/** A date safely in the future (within the booking window). */
export const futureDate = () => addDaysKey(toDateKey(new Date(), TZ), 3);

export async function resetDb() {
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname='public' and tablename <> '__drizzle_migrations'`);
  await db.execute(sql.raw(`truncate ${tables.rows.map((t) => `"${t.tablename}"`).join(",")} restart identity cascade`));
}

export async function makeUser(role: SessionUser["role"], name = `${role} ${randomUUID().slice(0, 4)}`): Promise<SessionUser> {
  const [u] = await db.insert(s.users).values({ email: `${randomUUID()}@test.dev`, name, role, passwordHash: "x", phone: "9876543210" }).returning();
  return { id: u!.id, email: u!.email, name: u!.name, role: u!.role, phone: u!.phone, avatarUrl: null };
}

/** One salon: `chairs` haircut chairs, `staffCount` barbers working 09:00–21:00 every day. */
export async function makeSalon(opts: { chairs?: number; staffCount?: number; owner?: SessionUser; policy?: Partial<typeof s.salonPolicies.$inferInsert> } = {}) {
  const owner = opts.owner ?? (await makeUser("OWNER"));
  const [salon] = await db.insert(s.salons).values({ ownerId: owner.id, name: "Test Salon", slug: `t-${randomUUID().slice(0, 8)}`, status: "APPROVED" }).returning();
  await db.insert(s.salonPolicies).values({ salonId: salon!.id, minAdvanceMinutes: 0, ...opts.policy });
  for (let d = 0; d < 7; d++) await db.insert(s.businessHours).values({ salonId: salon!.id, weekday: d, openMinute: H(9), closeMinute: H(21) });
  const [type] = await db.insert(s.resourceTypes).values({ salonId: salon!.id, name: "Haircut Chair" }).returning();
  const chairs = await db
    .insert(s.resources)
    .values(Array.from({ length: opts.chairs ?? 1 }, (_, i) => ({ salonId: salon!.id, resourceTypeId: type!.id, name: `Chair ${i + 1}`, sort: i })))
    .returning();
  const [svc] = await db
    .insert(s.services)
    .values({ salonId: salon!.id, name: "Haircut", price: 25000, durationMinutes: 30, bufferMinutes: 10 })
    .returning();
  await db.insert(s.serviceResourceRequirements).values({ serviceId: svc!.id, resourceTypeId: type!.id, quantity: 1 });
  const staff = [];
  for (let i = 0; i < (opts.staffCount ?? 3); i++) {
    const [st] = await db.insert(s.staff).values({ salonId: salon!.id, name: `Barber ${i + 1}` }).returning();
    await db.insert(s.staffServices).values({ staffId: st!.id, serviceId: svc!.id });
    for (let d = 0; d < 7; d++) await db.insert(s.staffSchedules).values({ staffId: st!.id, weekday: d, startMinute: H(9), endMinute: H(21) });
    staff.push(st!);
  }
  return { salon: salon!, owner, chairs, service: svc!, staff };
}
