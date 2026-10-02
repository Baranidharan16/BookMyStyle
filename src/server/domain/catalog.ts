import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Tx } from "../db";
import { db } from "../db";
import {
  resourceTypes,
  serviceOptionGroups,
  serviceOptions,
  serviceResourceRequirements,
  services,
  staff,
  staffBreaks,
  staffLeaves,
  staffSchedules,
  staffServices,
  users,
} from "../db/schema";
import { hashPassword } from "../auth/password";
import { Errors } from "../http/errors";
import type { serviceSchema, staffSchema } from "@/lib/validation";

export async function listStaff(salonId: string) {
  const rows = await db.query.staff.findMany({ where: eq(staff.salonId, salonId), orderBy: [asc(staff.name)] });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [skills, sched, brk, leaves, logins] = await Promise.all([
    db.select().from(staffServices).where(inArray(staffServices.staffId, ids)),
    db.select().from(staffSchedules).where(inArray(staffSchedules.staffId, ids)).orderBy(staffSchedules.weekday, staffSchedules.startMinute),
    db.select().from(staffBreaks).where(inArray(staffBreaks.staffId, ids)),
    db.select().from(staffLeaves).where(and(inArray(staffLeaves.staffId, ids), sql`${staffLeaves.endsAt} > now()`)).orderBy(staffLeaves.startsAt),
    db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, rows.map((r) => r.userId).filter(Boolean) as string[])),
  ]);
  return rows.map((r) => ({
    ...r,
    loginEmail: logins.find((l) => l.id === r.userId)?.email ?? null,
    serviceIds: skills.filter((k) => k.staffId === r.id).map((k) => k.serviceId),
    schedule: [0, 1, 2, 3, 4, 5, 6]
      .map((weekday) => ({ weekday, shifts: sched.filter((x) => x.staffId === r.id && x.weekday === weekday).map((x) => ({ start: x.startMinute, end: x.endMinute })) }))
      .filter((d) => d.shifts.length),
    breaks: brk.filter((b) => b.staffId === r.id).map((b) => ({ weekday: b.weekday, start: b.startMinute, end: b.endMinute })),
    leaves: leaves.filter((l) => l.staffId === r.id),
  }));
}

type StaffInput = z.infer<typeof staffSchema>;

/** Create or update a staff member with skills, weekly schedule, breaks and optional login. */
export async function saveStaff(tx: Tx, salonId: string, input: StaffInput, staffId?: string) {
  const svcIds = input.serviceIds.length
    ? (await tx.select({ id: services.id }).from(services).where(and(eq(services.salonId, salonId), inArray(services.id, input.serviceIds)))).map((s) => s.id)
    : [];
  if (svcIds.length !== input.serviceIds.length) throw Errors.validation("Some selected services don't belong to this salon.");
  for (const b of input.breaks) {
    const day = input.schedule.find((d) => d.weekday === b.weekday);
    if (!day || !day.shifts.some((s) => s.start <= b.start && s.end >= b.end)) throw Errors.validation("Breaks must fall within the staff member's working hours.");
    if (b.start >= b.end) throw Errors.validation("Break end must be after its start.");
  }

  let tempPassword: string | null = null;
  let userId: string | null | undefined = undefined;
  if (input.loginEmail) {
    const email = input.loginEmail.toLowerCase();
    const existing = await tx.query.users.findFirst({ where: eq(sql`lower(${users.email})`, email) });
    if (existing) {
      if (existing.role !== "STAFF") throw Errors.conflict("EMAIL_IN_USE", "That email belongs to a non-staff account.");
      const linked = await tx.query.staff.findFirst({ where: eq(staff.userId, existing.id) });
      if (linked && linked.id !== staffId) throw Errors.conflict("EMAIL_IN_USE", "That login is already linked to another staff profile.");
      userId = existing.id;
    } else {
      tempPassword = `${randomBytes(4).toString("hex")}A1`;
      const [u] = await tx.insert(users).values({ email, name: input.name, phone: input.phone, role: "STAFF", passwordHash: await hashPassword(tempPassword) }).returning({ id: users.id });
      userId = u!.id;
    }
  } else if (input.loginEmail === "") {
    userId = null;
  }

  const values = {
    name: input.name,
    title: input.title,
    phone: input.phone,
    specialization: input.specialization ?? null,
    experienceYears: input.experienceYears,
    bio: input.bio ?? null,
    avatarUrl: input.avatarUrl ?? null,
    permissions: input.permissions,
    active: input.active,
    ...(input.availability ? { availability: input.availability } : {}),
    ...(userId !== undefined ? { userId } : {}),
  };
  let id = staffId;
  if (id) {
    const res = await tx.update(staff).set(values).where(and(eq(staff.id, id), eq(staff.salonId, salonId))).returning({ id: staff.id });
    if (!res.length) throw Errors.notFound("Staff member");
    await tx.delete(staffServices).where(eq(staffServices.staffId, id));
    await tx.delete(staffSchedules).where(eq(staffSchedules.staffId, id));
    await tx.delete(staffBreaks).where(eq(staffBreaks.staffId, id));
  } else {
    const [row] = await tx.insert(staff).values({ ...values, salonId }).returning({ id: staff.id });
    id = row!.id;
  }
  if (svcIds.length) await tx.insert(staffServices).values(svcIds.map((serviceId) => ({ staffId: id!, serviceId })));
  const shifts = input.schedule.flatMap((d) => d.shifts.map((s) => ({ staffId: id!, weekday: d.weekday, startMinute: s.start, endMinute: s.end })));
  if (shifts.length) await tx.insert(staffSchedules).values(shifts);
  if (input.breaks.length) await tx.insert(staffBreaks).values(input.breaks.map((b) => ({ staffId: id!, weekday: b.weekday, startMinute: b.start, endMinute: b.end })));
  await tx.execute(sql`update salons set onboarding_step = greatest(onboarding_step, 7) where id = ${salonId}`);
  return { id: id!, tempPassword };
}

export async function listServices(salonId: string) {
  const rows = await db.query.services.findMany({ where: eq(services.salonId, salonId), orderBy: [asc(services.sort), asc(services.name)] });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [reqs, skills, groups] = await Promise.all([
    db.select({ serviceId: serviceResourceRequirements.serviceId, resourceTypeId: serviceResourceRequirements.resourceTypeId, quantity: serviceResourceRequirements.quantity, name: resourceTypes.name }).from(serviceResourceRequirements).innerJoin(resourceTypes, eq(resourceTypes.id, serviceResourceRequirements.resourceTypeId)).where(inArray(serviceResourceRequirements.serviceId, ids)),
    db.select().from(staffServices).where(inArray(staffServices.serviceId, ids)),
    db.select().from(serviceOptionGroups).where(inArray(serviceOptionGroups.serviceId, ids)).orderBy(serviceOptionGroups.sort),
  ]);
  const opts = groups.length ? await db.select().from(serviceOptions).where(inArray(serviceOptions.groupId, groups.map((g) => g.id))).orderBy(serviceOptions.sort) : [];
  return rows.map((r) => ({
    ...r,
    requirements: reqs.filter((q) => q.serviceId === r.id),
    staffIds: skills.filter((k) => k.serviceId === r.id).map((k) => k.staffId),
    optionGroups: groups.filter((g) => g.serviceId === r.id).map((g) => ({ ...g, options: opts.filter((o) => o.groupId === g.id) })),
  }));
}

type ServiceInput = z.infer<typeof serviceSchema>;

export async function saveService(tx: Tx, salonId: string, input: ServiceInput, serviceId?: string) {
  if (input.requirements.length) {
    const types = await tx.select({ id: resourceTypes.id }).from(resourceTypes).where(and(eq(resourceTypes.salonId, salonId), inArray(resourceTypes.id, input.requirements.map((r) => r.resourceTypeId))));
    if (types.length !== new Set(input.requirements.map((r) => r.resourceTypeId)).size) throw Errors.validation("Select resource types that exist in this salon.");
  }
  if (input.staffIds.length) {
    const st = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.salonId, salonId), inArray(staff.id, input.staffIds)));
    if (st.length !== input.staffIds.length) throw Errors.validation("Some selected staff don't belong to this salon.");
    if (input.staffRequired > input.staffIds.length) throw Errors.validation(`This service needs ${input.staffRequired} staff, but only ${input.staffIds.length} can perform it.`);
  } else if (input.staffRequired > 0 && serviceId === undefined) {
    // allowed during onboarding: staff can be assigned later from the staff screen
  }
  const values = {
    name: input.name,
    categoryId: input.categoryId ?? null,
    description: input.description ?? null,
    price: input.price,
    durationMinutes: input.durationMinutes,
    prepMinutes: input.prepMinutes,
    bufferMinutes: input.bufferMinutes,
    staffRequired: input.staffRequired,
    gender: input.gender,
    imageUrl: input.imageUrl ?? null,
    active: input.active,
  };
  let id = serviceId;
  if (id) {
    const res = await tx.update(services).set(values).where(and(eq(services.id, id), eq(services.salonId, salonId))).returning({ id: services.id });
    if (!res.length) throw Errors.notFound("Service");
    await tx.delete(serviceResourceRequirements).where(eq(serviceResourceRequirements.serviceId, id));
    await tx.delete(staffServices).where(eq(staffServices.serviceId, id));
    // options referenced by past bookings must survive: detach groups instead of hard delete when used
    const used = await tx.execute<{ id: string }>(sql`select distinct o.group_id as id from service_options o join booking_items bi on bi.option_id = o.id join service_option_groups g on g.id = o.group_id where g.service_id = ${id}`);
    if (used.rows.length) {
      await tx.execute(sql`update booking_items set option_id = null where option_id in (select o.id from service_options o join service_option_groups g on g.id = o.group_id where g.service_id = ${id})`);
    }
    await tx.delete(serviceOptionGroups).where(eq(serviceOptionGroups.serviceId, id));
  } else {
    const [row] = await tx.insert(services).values({ ...values, salonId }).returning({ id: services.id });
    id = row!.id;
  }
  if (input.requirements.length) await tx.insert(serviceResourceRequirements).values(input.requirements.map((r) => ({ serviceId: id!, ...r })));
  if (input.staffIds.length) await tx.insert(staffServices).values(input.staffIds.map((staffId) => ({ staffId, serviceId: id! })));
  for (const [gi, g] of input.optionGroups.entries()) {
    const [grp] = await tx.insert(serviceOptionGroups).values({ serviceId: id!, name: g.name, multiSelect: g.multiSelect, required: g.required, sort: gi }).returning({ id: serviceOptionGroups.id });
    await tx.insert(serviceOptions).values(g.options.map((o, oi) => ({ groupId: grp!.id, ...o, sort: oi })));
  }
  await tx.execute(sql`update salons set starting_price = (select min(price) from services where salon_id = ${salonId} and active), onboarding_step = greatest(onboarding_step, 8) where id = ${salonId}`);
  return id!;
}
