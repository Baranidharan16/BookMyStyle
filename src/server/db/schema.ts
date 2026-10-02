/**
 * BookMyStyle database schema (PostgreSQL).
 *
 * Conventions
 * - All money is stored as integer paise (₹1 = 100 paise) to avoid float errors.
 * - All instants are `timestamptz` (stored as UTC). Recurring wall-clock values
 *   (business hours, staff shifts) are minutes-from-midnight in the salon's
 *   IANA time zone (`salons.timezone`, default Asia/Kolkata).
 * - Double-booking protection lives in the database: see the exclusion
 *   constraints on booking_resources / booking_staff in drizzle/0002_constraints.sql.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date());
const id = () => uuid("id").primaryKey().defaultRandom();

/* ------------------------------------------------------------------ enums */

export const userRole = pgEnum("user_role", ["CUSTOMER", "OWNER", "STAFF", "ADMIN"]);
export const userStatus = pgEnum("user_status", ["ACTIVE", "BLOCKED", "DELETED"]);
export const salonStatus = pgEnum("salon_status", [
  "DRAFT",
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
]);
export const genderType = pgEnum("gender_type", ["UNISEX", "MEN", "WOMEN", "KIDS"]);
export const salonPlan = pgEnum("salon_plan", ["FREE", "PRO", "PREMIUM"]);
export const bookingStatus = pgEnum("booking_status", [
  "PENDING",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "WAITING",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "FAILED",
]);
export const bookingSource = pgEnum("booking_source", ["ONLINE", "WALK_IN", "OWNER"]);
export const paymentStatus = pgEnum("payment_status", [
  "INITIATED",
  "PENDING",
  "SUCCESSFUL",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export const paymentMode = pgEnum("payment_mode", ["ONLINE", "CASH", "UPI", "CARD", "OTHER", "PAY_AT_SALON"]);
export const refundStatus = pgEnum("refund_status", ["PENDING", "PROCESSED", "FAILED"]);
export const refundType = pgEnum("refund_type", ["REFUNDABLE", "PARTIAL", "NON_REFUNDABLE", "TRANSFERABLE"]);
export const couponType = pgEnum("coupon_type", ["PERCENT", "FLAT"]);
export const notificationCategory = pgEnum("notification_category", [
  "BOOKING",
  "PAYMENT",
  "OFFER",
  "SYSTEM",
  "SALON",
]);
export const reviewStatus = pgEnum("review_status", ["PUBLISHED", "HIDDEN", "FLAGGED"]);
export const queueStatus = pgEnum("queue_status", ["WAITING", "READY", "SERVED", "LEFT"]);
export const waitlistStatus = pgEnum("waitlist_status", ["ACTIVE", "NOTIFIED", "BOOKED", "EXPIRED", "CANCELLED"]);
export const disputeStatus = pgEnum("dispute_status", ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"]);
export const staffAvailability = pgEnum("staff_availability", ["AVAILABLE", "BUSY", "ON_BREAK", "OFF_DUTY"]);

/* ------------------------------------------------------------ identities */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("CUSTOMER"),
    status: userStatus("status").notNull().default("ACTIVE"),
    avatarUrl: text("avatar_url"),
    dateOfBirth: date("date_of_birth"),
    lastLoginAt: ts("last_login_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`), index("users_role_idx").on(t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    // sha256(token) — the raw token only ever lives in the httpOnly cookie
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export type SavedLocation = { label: string; lat: number; lng: number; address?: string };
export type CustomerPreferences = { genderPreference?: string; notifyEmail?: boolean; notifySms?: boolean; notifyWhatsapp?: boolean; marketing?: boolean };

export const customerProfiles = pgTable("customer_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  savedLocations: jsonb("saved_locations").$type<SavedLocation[]>().notNull().default([]),
  preferences: jsonb("preferences").$type<CustomerPreferences>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------------------------------------------------------------- salons */

export type PayoutDetails = { accountName?: string; accountNumberLast4?: string; ifsc?: string; upiId?: string; gstin?: string; pan?: string };

export const salons = pgTable(
  "salons",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    citySlug: text("city_slug").notNull().default("chennai"),
    tagline: text("tagline"),
    description: text("description"),
    phone: text("phone"),
    email: text("email"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    brandColor: text("brand_color").notNull().default("#7c3aed"),
    genderType: genderType("gender_type").notNull().default("UNISEX"),
    amenities: text("amenities").array().notNull().default(sql`'{}'::text[]`),
    parkingInfo: text("parking_info"),
    accessibilityInfo: text("accessibility_info"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    status: salonStatus("status").notNull().default("DRAFT"),
    verificationNotes: text("verification_notes"),
    onboardingStep: integer("onboarding_step").notNull().default(1),
    ratingAvg: real("rating_avg").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    startingPrice: integer("starting_price"),
    plan: salonPlan("plan").notNull().default("FREE"),
    featured: boolean("featured").notNull().default(false),
    commissionPercent: real("commission_percent"),
    payoutDetails: jsonb("payout_details").$type<PayoutDetails>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("salons_city_slug_uq").on(t.citySlug, t.slug),
    index("salons_owner_idx").on(t.ownerId),
    index("salons_status_idx").on(t.status),
    index("salons_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

export const salonLocations = pgTable(
  "salon_locations",
  {
    salonId: uuid("salon_id")
      .primaryKey()
      .references(() => salons.id, { onDelete: "cascade" }),
    addressLine: text("address_line").notNull(),
    area: text("area").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull().default("Tamil Nadu"),
    pincode: text("pincode"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    mapUrl: text("map_url"),
  },
  (t) => [index("salon_locations_latlng_idx").on(t.lat, t.lng), index("salon_locations_city_idx").on(t.city)],
);

export const salonImages = pgTable(
  "salon_images",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    caption: text("caption"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("salon_images_salon_idx").on(t.salonId)],
);

/** A cancellation tier: cancelling at least `hoursBefore` hours ahead refunds `refundPercent`. */
export type CancellationTier = { hoursBefore: number; refundPercent: number };
export type NotificationPrefs = { newBooking: boolean; cancellations: boolean; reviews: boolean; dailySummary: boolean };

export const salonPolicies = pgTable("salon_policies", {
  salonId: uuid("salon_id")
    .primaryKey()
    .references(() => salons.id, { onDelete: "cascade" }),
  bookingWindowDays: integer("booking_window_days").notNull().default(30),
  minAdvanceMinutes: integer("min_advance_minutes").notNull().default(30),
  maxBookingMinutes: integer("max_booking_minutes").notNull().default(480),
  slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(15),
  lockMinutes: integer("lock_minutes").notNull().default(5),
  graceMinutes: integer("grace_minutes").notNull().default(10),
  noShowAfterMinutes: integer("no_show_after_minutes").notNull().default(30),
  lateArrivalMessage: text("late_arrival_message"),
  refundType: refundType("refund_type").notNull().default("PARTIAL"),
  cancellationTiers: jsonb("cancellation_tiers")
    .$type<CancellationTier[]>()
    .notNull()
    .default([
      { hoursBefore: 24, refundPercent: 100 },
      { hoursBefore: 6, refundPercent: 50 },
    ]),
  noShowRefundPercent: integer("no_show_refund_percent").notNull().default(0),
  allowReschedule: boolean("allow_reschedule").notNull().default(true),
  rescheduleMinHours: integer("reschedule_min_hours").notNull().default(2),
  maxReschedules: integer("max_reschedules").notNull().default(2),
  walkInPriority: text("walk_in_priority").notNull().default("BOOKED_FIRST"), // BOOKED_FIRST | ARRIVAL_ORDER
  allowPayAtSalon: boolean("allow_pay_at_salon").notNull().default(false),
  waitlistNotifyStrategy: text("waitlist_notify_strategy").notNull().default("FIFO"), // FIFO | BROADCAST
  notificationPrefs: jsonb("notification_prefs")
    .$type<NotificationPrefs>()
    .notNull()
    .default({ newBooking: true, cancellations: true, reviews: true, dailySummary: false }),
  policyText: text("policy_text"),
  updatedAt: updatedAt(),
});

export const businessHours = pgTable(
  "business_hours",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0 = Sunday
    openMinute: integer("open_minute").notNull(),
    closeMinute: integer("close_minute").notNull(),
  },
  (t) => [
    index("business_hours_salon_idx").on(t.salonId, t.weekday),
    check("business_hours_valid", sql`${t.weekday} between 0 and 6 and ${t.openMinute} >= 0 and ${t.closeMinute} <= 1440 and ${t.openMinute} < ${t.closeMinute}`),
  ],
);

/** Holidays, temporary closures and special/festival hours for a specific date. */
export const holidays = pgTable(
  "holidays",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    isClosed: boolean("is_closed").notNull().default(true),
    openMinute: integer("open_minute"),
    closeMinute: integer("close_minute"),
    reason: text("reason"),
  },
  (t) => [
    index("holidays_salon_date_idx").on(t.salonId, t.date),
    check("holidays_hours_valid", sql`${t.isClosed} or (${t.openMinute} is not null and ${t.closeMinute} is not null and ${t.openMinute} < ${t.closeMinute})`),
  ],
);

/* ------------------------------------------------------ services/resources */

export const serviceCategories = pgTable("service_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("scissors"),
  sort: integer("sort").notNull().default(0),
});

export const resourceTypes = pgTable(
  "resource_types",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    area: text("area"), // e.g. "Haircut Area" — used to group the live board
  },
  (t) => [uniqueIndex("resource_types_salon_name_uq").on(t.salonId, t.name)],
);

export const resources = pgTable(
  "resources",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    resourceTypeId: uuid("resource_type_id")
      .notNull()
      .references(() => resourceTypes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("resources_salon_type_idx").on(t.salonId, t.resourceTypeId)],
);

export const resourceBlocks = pgTable(
  "resource_blocks",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("resource_blocks_lookup_idx").on(t.salonId, t.startsAt),
    check("resource_blocks_valid", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

export const services = pgTable(
  "services",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => serviceCategories.id),
    name: text("name").notNull(),
    description: text("description"),
    price: integer("price").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    prepMinutes: integer("prep_minutes").notNull().default(0),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    staffRequired: integer("staff_required").notNull().default(1),
    gender: genderType("gender").notNull().default("UNISEX"),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("services_salon_idx").on(t.salonId, t.active),
    index("services_category_idx").on(t.categoryId),
    check(
      "services_valid",
      sql`${t.price} >= 0 and ${t.durationMinutes} between 5 and 720 and ${t.prepMinutes} >= 0 and ${t.bufferMinutes} >= 0 and ${t.staffRequired} between 0 and 5`,
    ),
  ],
);

/** Which resource types (and how many of each) a service occupies. ("resource_assignments") */
export const serviceResourceRequirements = pgTable(
  "service_resource_requirements",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    resourceTypeId: uuid("resource_type_id")
      .notNull()
      .references(() => resourceTypes.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.resourceTypeId] }), check("srr_qty", sql`${t.quantity} between 1 and 10`)],
);

export const serviceOptionGroups = pgTable(
  "service_option_groups",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    multiSelect: boolean("multi_select").notNull().default(false),
    required: boolean("required").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("sog_service_idx").on(t.serviceId)],
);

export const serviceOptions = pgTable(
  "service_options",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => serviceOptionGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceDelta: integer("price_delta").notNull().default(0),
    durationDelta: integer("duration_delta").notNull().default(0),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("so_group_idx").on(t.groupId), check("so_valid", sql`${t.priceDelta} >= 0 and ${t.durationDelta} >= 0`)],
);

/* ------------------------------------------------------------------ staff */

export const staff = pgTable(
  "staff",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    title: text("title").notNull().default("Stylist"),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    specialization: text("specialization"),
    experienceYears: integer("experience_years").notNull().default(0),
    bio: text("bio"),
    ratingAvg: real("rating_avg").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    // fine-grained permissions for staff logins: CHECK_IN, WALK_IN, MANAGE_BOOKINGS, VIEW_CUSTOMERS
    permissions: text("permissions").array().notNull().default(sql`'{CHECK_IN,WALK_IN}'::text[]`),
    availability: staffAvailability("availability").notNull().default("AVAILABLE"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("staff_salon_idx").on(t.salonId), uniqueIndex("staff_user_uq").on(t.userId)],
);

export const staffServices = pgTable(
  "staff_services",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] }), index("staff_services_service_idx").on(t.serviceId)],
);

export const staffSchedules = pgTable(
  "staff_schedules",
  {
    id: id(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [
    index("staff_schedules_idx").on(t.staffId, t.weekday),
    check("staff_schedules_valid", sql`${t.weekday} between 0 and 6 and ${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`),
  ],
);

export const staffBreaks = pgTable(
  "staff_breaks",
  {
    id: id(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    label: text("label").notNull().default("Break"),
  },
  (t) => [
    index("staff_breaks_idx").on(t.staffId, t.weekday),
    check("staff_breaks_valid", sql`${t.weekday} between 0 and 6 and ${t.startMinute} < ${t.endMinute}`),
  ],
);

export const staffLeaves = pgTable(
  "staff_leaves",
  {
    id: id(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("staff_leaves_idx").on(t.staffId, t.startsAt), check("staff_leaves_valid", sql`${t.startsAt} < ${t.endsAt}`)],
);

/* --------------------------------------------------------------- bookings */

export const walkInCustomers = pgTable(
  "walk_in_customers",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    visits: integer("visits").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("walk_in_salon_phone_uq").on(t.salonId, t.phone)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: id(),
    salonId: uuid("salon_id").references(() => salons.id, { onDelete: "cascade" }), // null = platform-wide
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("GENERAL"), // GENERAL | FIRST_BOOKING | WEEKEND | FESTIVAL | NEW_CUSTOMER | SERVICE | TIME | MIN_PURCHASE
    type: couponType("type").notNull(),
    value: integer("value").notNull(), // percent (1-100) or paise
    maxDiscount: integer("max_discount"),
    minAmount: integer("min_amount").notNull().default(0),
    validFrom: ts("valid_from").notNull(),
    validTo: ts("valid_to").notNull(),
    startMinute: integer("start_minute"), // optional time-of-day window (salon local)
    endMinute: integer("end_minute"),
    weekdays: integer("weekdays").array(), // null = every day
    serviceIds: uuid("service_ids").array(), // null = every service
    firstBookingOnly: boolean("first_booking_only").notNull().default(false),
    newCustomerOnly: boolean("new_customer_only").notNull().default(false),
    usageLimit: integer("usage_limit"),
    perUserLimit: integer("per_user_limit").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("coupons_code_uq").on(sql`coalesce(${t.salonId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`upper(${t.code})`),
    check(
      "coupons_valid",
      sql`${t.value} > 0 and (${t.type} <> 'PERCENT' or ${t.value} <= 100) and ${t.validFrom} < ${t.validTo} and ${t.minAmount} >= 0`,
    ),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    code: text("code").notNull().unique(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id),
    customerId: uuid("customer_id").references(() => users.id),
    walkInCustomerId: uuid("walk_in_customer_id").references(() => walkInCustomers.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    source: bookingSource("source").notNull().default("ONLINE"),
    status: bookingStatus("status").notNull().default("PENDING"),
    // customer-facing service window
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    // window actually reserved on resources/staff (prep + service + buffer)
    occupiedFrom: ts("occupied_from").notNull(),
    occupiedUntil: ts("occupied_until").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull(),
    couponId: uuid("coupon_id").references(() => coupons.id),
    paymentStatus: paymentStatus("payment_status").notNull().default("INITIATED"),
    paymentMode: paymentMode("payment_mode").notNull().default("ONLINE"),
    staffPreference: uuid("staff_preference"),
    customerNotes: text("customer_notes"),
    requirements: text("requirements"),
    lockExpiresAt: ts("lock_expires_at"),
    checkedInAt: ts("checked_in_at"),
    lateMinutes: integer("late_minutes"),
    estimatedStartAt: ts("estimated_start_at"),
    serviceStartedAt: ts("service_started_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    overrideConflict: boolean("override_conflict").notNull().default(false),
    checkInToken: text("check_in_token").notNull(),
    reminderSentAt: ts("reminder_sent_at"),
    reviewRequestedAt: ts("review_requested_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_salon_time_idx").on(t.salonId, t.startsAt),
    index("bookings_customer_idx").on(t.customerId, t.startsAt),
    index("bookings_status_idx").on(t.status),
    index("bookings_lock_idx").on(t.lockExpiresAt).where(sql`${t.status} = 'PAYMENT_PENDING'`),
    check(
      "bookings_valid",
      sql`${t.startsAt} < ${t.endsAt} and ${t.occupiedFrom} <= ${t.startsAt} and ${t.occupiedUntil} >= ${t.endsAt} and ${t.total} >= 0 and ${t.discount} >= 0`,
    ),
  ],
);

export const bookingItems = pgTable(
  "booking_items",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // SERVICE | OPTION
    name: text("name").notNull(),
    groupName: text("group_name"),
    price: integer("price").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    serviceId: uuid("service_id").references(() => services.id),
    optionId: uuid("option_id").references(() => serviceOptions.id),
  },
  (t) => [index("booking_items_booking_idx").on(t.bookingId)],
);

/**
 * One row per resource held by a booking. `active` is true while the booking
 * holds the resource (checkout lock or confirmed). The exclusion constraint
 * (see 0002_constraints.sql) makes overlapping active rows for the same
 * resource impossible, even under concurrent transactions.
 */
export const bookingResources = pgTable(
  "booking_resources",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    active: boolean("active").notNull().default(true),
    allowOverlap: boolean("allow_overlap").notNull().default(false),
  },
  (t) => [
    index("booking_resources_lookup_idx").on(t.salonId, t.startsAt).where(sql`${t.active}`),
    index("booking_resources_booking_idx").on(t.bookingId),
  ],
);

export const bookingStaff = pgTable(
  "booking_staff",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    active: boolean("active").notNull().default(true),
    allowOverlap: boolean("allow_overlap").notNull().default(false),
  },
  (t) => [
    index("booking_staff_lookup_idx").on(t.salonId, t.startsAt).where(sql`${t.active}`),
    index("booking_staff_booking_idx").on(t.bookingId),
  ],
);

export const bookingStatusHistory = pgTable(
  "booking_status_history",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: bookingStatus("from_status"),
    toStatus: bookingStatus("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("bsh_booking_idx").on(t.bookingId, t.createdAt)],
);

export const waitingQueue = pgTable(
  "waiting_queue",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id),
    status: queueStatus("status").notNull().default("WAITING"),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    estimatedStartAt: ts("estimated_start_at"),
    note: text("note"),
    updatedAt: updatedAt(),
  },
  (t) => [index("waiting_queue_salon_idx").on(t.salonId, t.status)],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    fromMinute: integer("from_minute").notNull(),
    toMinute: integer("to_minute").notNull(),
    status: waitlistStatus("status").notNull().default("ACTIVE"),
    notifiedAt: ts("notified_at"),
    createdAt: createdAt(),
  },
  (t) => [index("waitlist_lookup_idx").on(t.salonId, t.date, t.status)],
);

/* --------------------------------------------------------------- payments */

export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    provider: text("provider").notNull(), // razorpay | sandbox | offline
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: paymentStatus("status").notNull().default("INITIATED"),
    method: text("method"), // upi | card | netbanking | wallet | cash
    failureReason: text("failure_reason"),
    verifiedAt: ts("verified_at"),
    raw: jsonb("raw"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_order_uq").on(t.provider, t.providerOrderId),
    index("payments_booking_idx").on(t.bookingId),
    index("payments_status_idx").on(t.status, t.createdAt),
  ],
);

/** Idempotency ledger for provider webhooks. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: ts("processed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_uq").on(t.provider, t.eventId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    amount: integer("amount").notNull(),
    status: refundStatus("status").notNull().default("PENDING"),
    reason: text("reason"),
    providerRefundId: text("provider_refund_id"),
    failureReason: text("failure_reason"),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("refunds_booking_idx").on(t.bookingId), check("refunds_amount", sql`${t.amount} > 0`)],
);

export const couponUsage = pgTable(
  "coupon_usage",
  {
    id: id(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    discount: integer("discount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("coupon_usage_user_idx").on(t.couponId, t.userId)],
);

/* ------------------------------------------------------ social / engagement */

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique() // one review per completed booking
      .references(() => bookings.id),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    serviceId: uuid("service_id").references(() => services.id),
    staffId: uuid("staff_id").references(() => staff.id),
    rating: integer("rating").notNull(),
    serviceRating: integer("service_rating"),
    staffRating: integer("staff_rating"),
    comment: text("comment"),
    ownerReply: text("owner_reply"),
    repliedAt: ts("replied_at"),
    status: reviewStatus("status").notNull().default("PUBLISHED"),
    moderationNote: text("moderation_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reviews_salon_idx").on(t.salonId, t.createdAt),
    check(
      "reviews_rating",
      sql`${t.rating} between 1 and 5 and (${t.serviceRating} is null or ${t.serviceRating} between 1 and 5) and (${t.staffRating} is null or ${t.staffRating} between 1 and 5)`,
    ),
  ],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.salonId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategory("category").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: ts("read_at"),
    // outbox marker for external channels (email/SMS/WhatsApp/push)
    externalDeliveredAt: ts("external_delivered_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    index("notifications_outbox_idx").on(t.createdAt).where(sql`${t.externalDeliveredAt} is null`),
  ],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------- platform */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    salonId: uuid("salon_id").references(() => salons.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_salon_idx").on(t.salonId, t.createdAt), index("audit_actor_idx").on(t.actorId, t.createdAt)],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

export const disputes = pgTable(
  "disputes",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    raisedBy: uuid("raised_by")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    status: disputeStatus("status").notNull().default("OPEN"),
    resolution: text("resolution"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("disputes_status_idx").on(t.status)],
);

/**
 * State of the built-in *sandbox* payment gateway (development only). This
 * plays the role of the external provider's systems; the merchant side never
 * reads it directly — it goes through the same provider interface as Razorpay.
 */
export const sandboxGatewayPayments = pgTable("sandbox_gateway_payments", {
  id: text("id").primaryKey(), // pay_sbx_...
  orderId: text("order_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull(), // captured | failed | refunded | partially_refunded
  method: text("method").notNull(),
  refundedAmount: integer("refunded_amount").notNull().default(0),
  createdAt: createdAt(),
});

export const sandboxGatewayOrders = pgTable("sandbox_gateway_orders", {
  id: text("id").primaryKey(), // order_sbx_...
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  receipt: text("receipt").notNull(),
  status: text("status").notNull().default("created"), // created | paid
  createdAt: createdAt(),
});

/** Known localities used for manual location search / autocomplete. */
export const areas = pgTable(
  "areas",
  {
    id: id(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
  },
  (t) => [uniqueIndex("areas_name_city_uq").on(t.name, t.city)],
);

/** Fixed-window rate limiter buckets (shared across app instances). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ts("reset_at").notNull(),
});
