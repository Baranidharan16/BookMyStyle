/**
 * Zod schemas shared by client forms and API handlers — the same rules run
 * in the browser (instant feedback) and on the server (authoritative).
 */
import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"));

export const optionalPhone = z
  .union([z.literal(""), phoneSchema])
  .optional()
  .nullable()
  .transform((v) => v || null);

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
export const uuid = z.string().uuid("Invalid id");
export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
export const minuteOfDay = z.coerce.number().int().min(0).max(1440);
export const paise = z.coerce.number().int("Price must be a whole number of paise").min(0, "Price can't be negative").max(10_000_000);
export const hhmm = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/, "Use HH:MM");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(["CUSTOMER", "OWNER"]).default("CUSTOMER"),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(128) });

export const holdSchema = z.object({
  salonId: uuid,
  serviceId: uuid,
  optionIds: z.array(uuid).max(20).default([]),
  date: dateKey,
  startMinute: minuteOfDay,
  staffPreference: uuid.nullable().optional(),
  couponCode: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  requirements: z.string().trim().max(1000).nullable().optional(),
});

export const quoteSchema = holdSchema.pick({ salonId: true, serviceId: true, optionIds: true, date: true, startMinute: true, couponCode: true });

export const rescheduleSchema = z.object({ date: dateKey, startMinute: minuteOfDay, staffPreference: uuid.nullable().optional() });
export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  serviceRating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  staffRating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  comment: z.string().trim().max(1500).optional().nullable(),
});

export const deskBookingSchema = z.object({
  source: z.enum(["WALK_IN", "OWNER"]).default("WALK_IN"),
  customerName: z.string().trim().min(2, "Enter the customer's name").max(80),
  customerPhone: optionalPhone,
  serviceId: uuid,
  optionIds: z.array(uuid).max(20).optional(),
  staffId: uuid.nullable().optional(),
  resourceId: uuid.nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(720).nullable().optional(),
  price: paise.nullable().optional(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "OTHER", "PAY_AT_SALON"]),
  paymentCollected: z.boolean().default(false),
  notes: z.string().trim().max(500).nullable().optional(),
  override: z.boolean().optional(),
});

export const transitionSchema = z.object({
  action: z.enum(["CHECK_IN", "WAIT", "READY", "START", "COMPLETE", "NO_SHOW", "COLLECT_PAYMENT"]),
  estimatedStartAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().trim().max(300).optional(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "OTHER"]).optional(),
  checkInToken: z.string().max(100).optional(),
});

export const moveSchema = z.object({ startsAt: z.string().datetime({ offset: true }), resourceId: uuid.nullable().optional(), staffId: uuid.nullable().optional() });

const shift = z.object({ start: minuteOfDay, end: minuteOfDay }).refine((s) => s.start < s.end, "Start must be before end");

function noOverlap(list: { start: number; end: number }[]) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  return sorted.every((s, i) => i === 0 || s.start >= sorted[i - 1]!.end);
}

export const weeklyHoursSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), shifts: z.array(shift).max(4) }))
  .max(7)
  .refine((days) => days.every((d) => noOverlap(d.shifts)), "Shifts on the same day can't overlap");

export const staffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(60),
  phone: optionalPhone,
  specialization: z.string().trim().max(120).optional().nullable(),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
  bio: z.string().trim().max(600).optional().nullable(),
  avatarUrl: z.string().max(500).optional().nullable(),
  serviceIds: z.array(uuid).default([]),
  schedule: weeklyHoursSchema.default([]),
  breaks: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: minuteOfDay, end: minuteOfDay })).max(30).default([]),
  permissions: z.array(z.enum(["CHECK_IN", "WALK_IN", "MANAGE_BOOKINGS", "VIEW_CUSTOMERS"])).default(["CHECK_IN", "WALK_IN"]),
  loginEmail: z.union([z.literal(""), emailSchema]).optional().nullable(),
  active: z.boolean().default(true),
  availability: z.enum(["AVAILABLE", "BUSY", "ON_BREAK", "OFF_DUTY"]).optional(),
});

export const leaveSchema = z
  .object({ startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), reason: z.string().trim().max(200).optional() })
  .refine((l) => new Date(l.startsAt) < new Date(l.endsAt), "Leave must end after it starts");

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  categoryId: uuid.nullable().optional(),
  description: z.string().trim().max(600).optional().nullable(),
  price: paise,
  durationMinutes: z.coerce.number().int().min(5, "Minimum 5 minutes").max(720),
  prepMinutes: z.coerce.number().int().min(0).max(120).default(0),
  bufferMinutes: z.coerce.number().int().min(0).max(120).default(0),
  staffRequired: z.coerce.number().int().min(0).max(5).default(1),
  gender: z.enum(["UNISEX", "MEN", "WOMEN", "KIDS"]).default("UNISEX"),
  imageUrl: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
  requirements: z.array(z.object({ resourceTypeId: uuid, quantity: z.coerce.number().int().min(1).max(10) })).max(5).default([]),
  staffIds: z.array(uuid).default([]),
  optionGroups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        multiSelect: z.boolean().default(false),
        required: z.boolean().default(false),
        options: z.array(z.object({ name: z.string().trim().min(1).max(60), priceDelta: paise.default(0), durationDelta: z.coerce.number().int().min(0).max(240).default(0) })).min(1).max(12),
      }),
    )
    .max(6)
    .default([]),
});

export const resourceTypeSchema = z.object({ name: z.string().trim().min(2).max(60), area: z.string().trim().max(60).optional().nullable(), count: z.coerce.number().int().min(0, "Count can't be negative").max(50).default(1) });
export const resourceSchema = z.object({ name: z.string().trim().min(1).max(60), resourceTypeId: uuid, active: z.boolean().default(true) });
export const blockSchema = z
  .object({ resourceId: uuid, startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), reason: z.string().trim().max(200).optional() })
  .refine((b) => new Date(b.startsAt) < new Date(b.endsAt), "Block must end after it starts");

export const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "3–20 letters/numbers, no spaces"),
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(300).optional().nullable(),
    kind: z.enum(["GENERAL", "FIRST_BOOKING", "WEEKEND", "FESTIVAL", "NEW_CUSTOMER", "SERVICE", "TIME", "MIN_PURCHASE"]).default("GENERAL"),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.coerce.number().int().positive("Value must be positive"),
    maxDiscount: paise.nullable().optional(),
    minAmount: paise.default(0),
    validFrom: z.string().datetime({ offset: true }),
    validTo: z.string().datetime({ offset: true }),
    startMinute: minuteOfDay.nullable().optional(),
    endMinute: minuteOfDay.nullable().optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    serviceIds: z.array(uuid).nullable().optional(),
    firstBookingOnly: z.boolean().default(false),
    newCustomerOnly: z.boolean().default(false),
    usageLimit: z.coerce.number().int().positive().nullable().optional(),
    perUserLimit: z.coerce.number().int().min(1).max(50).default(1),
    active: z.boolean().default(true),
  })
  .refine((c) => c.type !== "PERCENT" || c.value <= 100, { message: "Percentage can't exceed 100", path: ["value"] })
  .refine((c) => new Date(c.validFrom) < new Date(c.validTo), { message: "End date must be after start date", path: ["validTo"] })
  .refine((c) => (c.startMinute == null) === (c.endMinute == null) && (c.startMinute == null || c.startMinute < c.endMinute!), { message: "Invalid time window", path: ["endMinute"] });

export const policySchema = z.object({
  bookingWindowDays: z.coerce.number().int().min(1).max(365),
  minAdvanceMinutes: z.coerce.number().int().min(0).max(10_080),
  maxBookingMinutes: z.coerce.number().int().min(15).max(720),
  slotIntervalMinutes: z.coerce.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), "Choose 5, 10, 15, 20, 30 or 60"),
  lockMinutes: z.coerce.number().int().min(2).max(30),
  graceMinutes: z.coerce.number().int().min(0).max(120),
  noShowAfterMinutes: z.coerce.number().int().min(0).max(480),
  lateArrivalMessage: z.string().trim().max(400).nullable().optional(),
  refundType: z.enum(["REFUNDABLE", "PARTIAL", "NON_REFUNDABLE", "TRANSFERABLE"]),
  cancellationTiers: z
    .array(z.object({ hoursBefore: z.coerce.number().min(0).max(720), refundPercent: z.coerce.number().int().min(0).max(100) }))
    .max(5)
    .refine((t) => new Set(t.map((x) => x.hoursBefore)).size === t.length, "Tiers must have different hour thresholds"),
  noShowRefundPercent: z.coerce.number().int().min(0).max(100),
  allowReschedule: z.boolean(),
  rescheduleMinHours: z.coerce.number().int().min(0).max(168),
  maxReschedules: z.coerce.number().int().min(0).max(10),
  walkInPriority: z.enum(["BOOKED_FIRST", "ARRIVAL_ORDER"]),
  waitlistNotifyStrategy: z.enum(["FIFO", "BROADCAST"]),
  notificationPrefs: z.object({ newBooking: z.boolean(), cancellations: z.boolean(), reviews: z.boolean(), dailySummary: z.boolean() }),
  policyText: z.string().trim().max(2000).nullable().optional(),
});

export const salonProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  phone: optionalPhone,
  email: z.union([z.literal(""), emailSchema]).optional().nullable(),
  genderType: z.enum(["UNISEX", "MEN", "WOMEN", "KIDS"]),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c3aed"),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  parkingInfo: z.string().trim().max(300).optional().nullable(),
  accessibilityInfo: z.string().trim().max(300).optional().nullable(),
  logoUrl: z.string().max(500).optional().nullable(),
  coverUrl: z.string().max(500).optional().nullable(),
});

export const locationSchema = z.object({
  addressLine: z.string().trim().min(5, "Enter the street address").max(200),
  area: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const payoutSchema = z.object({
  accountName: z.string().trim().min(2).max(100),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a valid account number"),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code"),
  upiId: z.union([z.literal(""), z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID")]).optional(),
  gstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid GSTIN")]).optional(),
  pan: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN")]).optional(),
});

export const holidaySchema = z
  .object({ date: dateKey, isClosed: z.boolean().default(true), openMinute: minuteOfDay.nullable().optional(), closeMinute: minuteOfDay.nullable().optional(), reason: z.string().trim().max(100).optional() })
  .refine((h) => h.isClosed || (h.openMinute != null && h.closeMinute != null && h.openMinute < h.closeMinute), "Special hours need a valid open and close time");

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  dateOfBirth: z.union([z.literal(""), dateKey]).optional().nullable(),
  avatarUrl: z.string().max(500).optional().nullable(),
  savedLocations: z.array(z.object({ label: z.string().trim().min(1).max(30), lat: z.number(), lng: z.number(), address: z.string().max(200).optional() })).max(10).optional(),
  preferences: z.object({ genderPreference: z.string().max(20).optional(), notifyEmail: z.boolean().optional(), notifySms: z.boolean().optional(), notifyWhatsapp: z.boolean().optional(), marketing: z.boolean().optional() }).optional(),
});

export const waitlistSchema = z.object({ salonId: uuid, serviceId: uuid, date: dateKey, fromMinute: minuteOfDay, toMinute: minuteOfDay }).refine((w) => w.fromMinute < w.toMinute, "Invalid time window");
