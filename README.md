# BookMyStyle

**Real-time salon discovery, booking, payments and salon management.** Customers find salons near them, see seats and stylists that are *actually* free, choose exactly the service they want, pay in advance and check in with a QR ticket. Salon owners run online bookings and walk-ins on one live board, with staff rosters, offers, policies and analytics.

> Built with Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Drizzle ORM · Server-Sent Events over Postgres LISTEN/NOTIFY · Razorpay-compatible payment layer.

---

## Contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Folder structure](#3-folder-structure)
4. [Database schema](#4-database-schema)
5. [Authentication & authorisation](#5-authentication--authorisation)
6. [Booking engine](#6-booking-engine)
7. [Real-time synchronisation](#7-real-time-synchronisation)
8. [Payment architecture](#8-payment-architecture)
9. [Environment variables](#9-environment-variables)
10. [Running locally](#10-running-locally)
11. [Demo credentials](#11-demo-credentials)
12. [Tests](#12-tests)
13. [Known limitations](#13-known-limitations)
14. [Production deployment](#14-production-deployment)

---

## 1. Project overview

| Area | What's included |
| --- | --- |
| **Customer** | Landing page (search by what/where/when, 22 categories, *available now*, nearby, trending based on real bookings, offers, recently viewed), search with filters (distance, price, rating, service, duration, gender, open now, offers, date/time availability), sorting, pagination, list/map view, SEO salon pages (`/salons/{city}/{slug}` with JSON-LD), booking wizard with service customisation, staff preference, live slots, coupons, waitlist, checkout with hold countdown, digital e-ticket with QR, live status timeline, cancel (with policy-based refund preview), reschedule, reviews, disputes, favourites, notification centre, profile (saved locations, preferences, payments, account deletion), PWA install and offline shell, dark mode. |
| **Salon owner** | Dashboard KPIs, **live resource board**, bookings list, day/week/month calendar with drag-and-drop moves, walk-in/phone booking desk with conflict detection and owner override, seats and resources, staff (shifts, breaks, leave, skills, permissions, logins), services (price, duration, prep, buffer, required resources, multi-staff, option groups), offers, analytics, customers, reviews (reply/report), settings (profile, location pin, hours with multiple shifts, holidays and special hours, policies, payouts, audit log), 10-step onboarding with verification. |
| **Staff** | "My day", QR / booking-ID check-in, waiting queue, start/complete service, walk-ins, board and bookings, all gated by per-staff permissions. |
| **Super admin** | Platform KPIs (users, salons, bookings today, GMV, commission), salon verification (pending → under review → approved/rejected/suspended), plans, featured listings and commission overrides, user blocking, bookings, payments, refund retries, review moderation, disputes, platform settings (GST, plan commission/fees), categories, audit log. |

**Seed data:** 11 salons in Chennai and Bengaluru (10 live, 1 pending verification), 42 staff, 120+ services with options, ~7,200 bookings over the last 60 days plus the next 7 (online and walk-in, completed, cancelled, no-show, in service today), ~2,000 verified reviews, coupons, holidays, a staff leave and a seat under maintenance. Every seeded booking was allocated **through the real availability engine**, so the data obeys the same constraints as live bookings.

---

## 2. Architecture

```
 Browser (React 19, TanStack Query, EventSource)
   │  REST (JSON)                    ▲ SSE hints ("availability changed")
   ▼                                 │
 Next.js 16 server (Node runtime)
   ├─ proxy.ts ─ optimistic auth gate for protected areas
   ├─ app/api/** ─ route handlers: CSRF origin check → auth/RBAC/tenant → zod → domain
   ├─ server/booking ─ availability engine (pure) + transactional booking engine
   ├─ server/payments ─ provider abstraction (Razorpay | Sandbox), verify + webhooks
   ├─ server/realtime ─ publish (pg_notify in-txn) / hub (one LISTEN per process)
   ├─ server/notifications ─ in-app + outbox for email/SMS/WhatsApp/push adapters
   └─ instrumentation.ts ─ sweeper: expire holds, reminders, auto no-show, outbox
   │
   ▼
 PostgreSQL 16 ─ exclusion constraints (btree_gist), advisory locks, pg_trgm, LISTEN/NOTIFY
```

Key decisions:

* **The database is the final authority on double booking.** Every reservation of a seat or stylist is a row in `booking_resources` / `booking_staff`, and an `EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` constraint makes overlapping active rows impossible, even across racing transactions.
* **Server components for first paint, client components with TanStack Query for interactive and live data.** Server state lives in Query, UI state in components, auth in an httpOnly session cookie, and booking state on the server (holds).
* **No extra infrastructure for real time.** Postgres `NOTIFY` (sent inside the transaction, so it is delivered only on commit) fans out to every app instance's SSE subscribers. You can swap in Redis or a managed pub/sub later without touching callers.
* **The business model is data.** GST, commission per plan, plan fees and featured-listing fees live in `platform_settings`, editable by admins. Per-salon commission overrides are supported.

---

## 3. Folder structure

```
src/
  app/
    (site)/            customer-facing pages: home, search, salons/[city]/[slug](/book), checkout, customer/*, offers, notifications
    (auth)/            login, register
    business/(app)/    owner dashboard, board, calendar, bookings, walk-in, resources, staff, services, offers, analytics, customers, reviews, settings
    business/onboarding 10-step salon setup wizard
    staff/             staff portal
    admin/             super-admin console
    pay/sandbox/       dev-only hosted payment page (sandbox gateway)
    api/               REST API (see §8 and the route tree)
    manifest.ts, robots.ts, sitemap.ts, icon.svg, not-found, error, offline
  components/
    ui/                design system (button, form, card, badge, dialog, states, logo…)
    layout/            site header/footer, mobile nav, location picker, bell, user menu
    customer/          salon card/cover/rail, hero search, service menu, favourites
    booking/           status badges, booking card
    business/          board, calendar, bookings view, walk-in form, booking actions, settings sections, schedule editor, service dialog
    map/               map provider abstraction (Leaflet + OSM by default)
  hooks/               use-realtime (SSE), use-salon-live, use-countdown, use-debounce
  lib/                 client-safe: validation (zod, shared by client & server), time (tz-safe), utils, api-client
  server/
    db/                Drizzle schema + pooled client
    auth/              sessions, password hashing, tenant/permission checks
    booking/           engine-core.ts (pure availability), context.ts (loader), engine.ts (transactions), policy-core.ts (pricing, coupons, refunds)
    payments/          provider interface, razorpay.ts, sandbox.ts, service.ts
    realtime/          publish.ts, hub.ts
    notifications/     in-app + channel adapters (outbox)
    domain/            read models: salons/search, bookings/board/calendar, analytics, catalog, admin
    http/              route wrappers, errors, rate limiter
    jobs.ts, audit.ts, settings.ts, storage.ts
drizzle/               SQL migrations (incl. 0002_constraints.sql — exclusion constraints)
scripts/               migrate, seed, worker
tests/                 unit/, integration/ (real Postgres), e2e/ (Playwright)
```

---

## 4. Database schema

41 tables, normalised, with foreign keys, CHECK constraints, partial indexes and timestamps. Money is stored as **integer paise**; instants are `timestamptz`; recurring wall-clock times (hours, shifts) are minutes-from-midnight in the salon's IANA time zone.

| Domain | Tables |
| --- | --- |
| Identity | `users` (role enum: CUSTOMER / OWNER / STAFF / ADMIN), `sessions`, `customer_profiles`, `push_subscriptions` |
| Salons | `salons` (status, plan, featured, commission, onboarding step, payout details), `salon_locations`, `salon_images`, `salon_policies`, `business_hours` (multiple shifts/day, non-overlapping), `holidays` (closures and special hours) |
| Catalogue | `service_categories`, `services`, `service_option_groups`, `service_options`, `service_resource_requirements` (resource assignments), `resource_types`, `resources`, `resource_blocks` |
| Staff | `staff` (permissions, availability), `staff_services`, `staff_schedules` (non-overlapping), `staff_breaks`, `staff_leaves` |
| Bookings | `bookings`, `booking_items`, **`booking_resources`**, **`booking_staff`** (exclusion-constrained), `booking_status_history`, `walk_in_customers`, `waiting_queue`, `waitlist_entries` |
| Money | `payments`, `payment_events` (webhook idempotency), `refunds`, `coupons`, `coupon_usage` |
| Engagement | `reviews` (unique per booking), `favorites`, `notifications` (with outbox marker) |
| Platform | `audit_logs`, `platform_settings`, `disputes`, `areas`, `rate_limits`, `sandbox_gateway_*` (dev gateway state) |

The schema source is `src/server/db/schema.ts`. Migrations live in `drizzle/`; the custom SQL in `0002_constraints.sql` adds the exclusion constraints and trigram indexes.

---

## 5. Authentication & authorisation

* **Sessions:** a 256-bit random token in an `httpOnly`, `SameSite=Lax` (and `Secure` in production) cookie. Only its SHA-256 hash is stored in `sessions`. Passwords use bcrypt (cost 12). Login runs at constant cost for unknown emails, to prevent account enumeration.
* **CSRF:** every cookie-authenticated mutation checks `Origin` against the host; SameSite=Lax is the second layer. Webhooks are authenticated by HMAC instead of cookies.
* **Rate limiting:** Postgres-backed fixed windows (shared by all instances) on login, registration, holds, payment creation and uploads.
* **RBAC:** `requireUser([roles])` in every handler; pages use `requirePageUser`; `proxy.ts` only does an optimistic cookie check.
* **Tenant isolation:** every `/api/business/salons/{salonId}/**` call goes through `requireSalonAccess`. Owners reach only salons they own, staff only their salon and only the permissions granted to them (`CHECK_IN`, `WALK_IN`, `MANAGE_BOOKINGS`, `VIEW_CUSTOMERS`), admins everything. "Not yours" and "doesn't exist" return the same 404, so other tenants can't be probed. Staff without `VIEW_CUSTOMERS` see masked phone numbers.
* **Other protections:** zod validation (the same schemas client- and server-side), parameterised SQL via Drizzle (no string-built queries from user input), React escaping (JSON-LD is `<`-escaped), image uploads validated by magic bytes (JPG/PNG/WebP only, 5 MB), security headers (HSTS, `nosniff`, frame denial, referrer and permissions policies), and an audit log for money, booking, schedule, service and admin actions.

---

## 6. Booking engine

### 6.1 Availability (pure, unit-tested) — `server/booking/engine-core.ts`

For a salon-day the loader (`context.ts`) builds, in a handful of indexed queries:
open intervals (business hours, holiday closures and special hours), active resources by type, active reservations (bookings, walk-ins and **unexpired** checkout holds), resource blocks, and each staff member's skills, shifts, breaks, leave and reservations. Everything is converted to UTC epoch ms using the salon's time zone, so it is DST-safe.

`evaluateSlot(ctx, service, start)` checks, in order:

1. the salon is bookable (approved);
2. the duration (incl. option add-ons) is within the salon's max;
3. min-advance / booking-window rules (skipped at the walk-in desk);
4. prep + service fits inside a single open interval (cleanup buffer may run past close);
5. **every** required resource type has enough free resources for `[start − prep, end + buffer)`, so buffers block back-to-back bookings;
6. enough eligible staff are free: they have the skill, are in shift, not on break or leave, and have no overlapping reservation. The preferred stylist is honoured, otherwise the least-loaded staff are picked.

It returns either the concrete `staffIds` + `resourceIds` plus the reserved window, or a reason (`CLOSED`, `OUTSIDE_HOURS`, `NO_RESOURCE`, `NO_STAFF`, `STAFF_UNAVAILABLE`, `TOO_SOON`, …) with a human message. `listSlots` produces the day's slot grid.

### 6.2 Transactions — `server/booking/engine.ts`

| Operation | Guarantees |
| --- | --- |
| **holdSlot** (`POST /api/bookings/lock`) | One transaction: per-salon advisory lock → expire stale holds → drop the customer's abandoned holds → reload context → evaluate → price (coupon + GST) → insert booking `PAYMENT_PENDING` with `lock_expires_at` (configurable, default 5 min) and its reservation rows. The exclusion constraint is the final guard; `23P01` maps to *"…the selected slot was just taken."* |
| **confirmPaidBooking** | Runs only after server-side payment verification. Idempotent. If the hold expired it tries to re-acquire the *same* reservations; if someone else took them, the booking fails and a full refund is issued automatically. |
| **cancelBooking** | Policy refund (tiers / refundable / non-refundable / transferable); salon-initiated cancellations always refund 100%. Releases reservations, notifies the waitlist, refunds via the provider *after* commit. |
| **rescheduleBooking** | Re-validates staff, resources, hours, conflicts and policy (allowed? limit? cut-off?), excluding the booking's own reservations, then atomically swaps them. |
| **moveBooking** | Calendar drag-and-drop by owner/staff, with the same re-validation (optionally forcing a resource or stylist). |
| **createDeskBooking** | Walk-ins and phone bookings use the same engine and constraints, so the seat disappears from online availability instantly. On a conflict, staff get the clashing bookings; only an **owner** can override (`allow_overlap`, audited). |
| **transitionBooking** | `CONFIRMED → CHECKED_IN → WAITING → (ready) → IN_SERVICE → COMPLETED`, plus `NO_SHOW` (only after the grace period) and offline payment collection. QR check-in verifies a per-booking secret. Late arrivals keep their booking and see the configurable late-arrival message; if their seat or stylist is still busy they go to `WAITING` with an ETA. Finishing early frees the remaining time immediately. |

Status history, audit entries, notifications and realtime events are written in the same transaction.

---

## 7. Real-time synchronisation

* **Publish:** `publish(tx, events)` runs `pg_notify('bms_events', …)` inside the business transaction, so events are delivered only if it commits. Payloads are tiny hints with no PII on public channels.
* **Fan-out:** each Node process holds one `LISTEN` connection (`server/realtime/hub.ts`) and forwards to subscribers.
* **Transport:** `GET /api/realtime?ch=…` is a Server-Sent Events stream with heartbeats and automatic browser reconnects. Channels are authorised per subscriber:
  * `salon:{id}`: public "availability changed" hints for slot pickers;
  * `ops:{salonId}`: board, calendar and bookings for that salon's team;
  * `booking:{id}`: live status for the customer and the salon;
  * `user:{id}`: notification inbox.
* **Clients** refetch through the normal authorised APIs (TanStack Query invalidation) instead of polling. If customer A has 5:00 PM selected and customer B books it, or the desk adds a walk-in, A immediately sees *"5:00 PM is no longer available."* and the slot is struck through. Stale state still can't double-book, because holds are re-validated in the database.

---

## 8. Payment architecture

```
Review → POST /api/bookings/lock (hold)
       → POST /api/payments/create  → provider.createOrder()            [payments: INITIATED]
       → provider checkout (Razorpay Checkout / sandbox hosted page)
       → POST /api/payments/verify  → HMAC(order|payment) check
                                     → provider.fetchPayment() (amount, status, order match)
                                     → confirmPaidBooking()              [booking: CONFIRMED]
       ↘ POST /api/payments/webhook → HMAC(raw body) check → idempotency ledger → same confirmation path
```

* **Never trusts the browser:** a booking is confirmed only after signature verification **and** an authoritative fetch from the provider. Forged signatures, failed payments and amount mismatches are rejected (see `tests/integration/payments.test.ts`).
* **Providers:** `PaymentProvider` interface with:
  * **`RazorpayProvider`**: Orders API, Checkout (UPI, cards, net banking, wallets), signature and webhook verification, refunds.
  * **`SandboxProvider`** (development only, refused in production unless explicitly allowed): a local stand-in that implements the *same* contract (signed checkout result, signed asynchronous webhooks, refunds). The hosted page at `/pay/sandbox/{orderId}` is clearly labelled TEST MODE and lets you simulate success or failure.
* **Refunds:** created in the DB transaction and executed with the provider after commit. Failures are recorded and retryable from the admin console. `refund.processed` webhooks settle the totals (`REFUNDED` / `PARTIALLY_REFUNDED`).
* **Statuses:** payments go `INITIATED → PENDING → SUCCESSFUL | FAILED → REFUNDED | PARTIALLY_REFUNDED`. Offline (cash/UPI/card at the counter) payments are recorded with provider `offline`.

---

## 9. Environment variables

See `.env.example` (copy to `.env`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `TEST_DATABASE_URL` | tests | Disposable database for integration tests |
| `APP_URL` | ✅ | Public base URL (links, SEO, sandbox webhooks) |
| `PAYMENT_PROVIDER` | ✅ | `sandbox` (dev) or `razorpay` |
| `SANDBOX_KEY_SECRET`, `SANDBOX_WEBHOOK_SECRET` | sandbox | HMAC secrets for the dev gateway |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | razorpay | Live/test keys; the secret never reaches the browser |
| `RUN_SWEEPER` | | `false` if you run `npm run worker` separately |
| `STORAGE_DRIVER`, `S3_*` | | `local` (dev) or S3-compatible storage |
| `SMTP_URL`, `SMS_PROVIDER_API_KEY`, `WHATSAPP_PROVIDER_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | | Enable external notification channels |
| `SEED_DEMO_PASSWORD` | | Override the dev demo password |
| `SHOW_DEMO_ACCOUNTS` | | Show demo logins on `/login` outside development |

---

## 10. Running locally

Prerequisites: Node.js ≥ 20.9 (22 recommended) and PostgreSQL 16 (with the `btree_gist` and `pg_trgm` contrib extensions, included in standard packages).

```bash
# 1. database (example for a local Postgres)
createuser -P bms            # password: bms_dev_password
createdb -O bms bookmystyle
createdb -O bms bookmystyle_test

# 2. app
cp .env.example .env         # then set SANDBOX_* secrets (openssl rand -hex 32)
npm install
npm run db:migrate           # applies drizzle/ migrations (+ exclusion constraints)
npm run db:seed              # resets and loads demo data (~35 s)
npm run dev                  # http://localhost:3000
```

Or with Docker: `docker compose up --build` (then run `npm run db:seed` with `DATABASE_URL=postgres://bms:bms_dev_password@localhost:5433/bookmystyle`).

Useful scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run worker`, `npm run build && npm start`.

---

## 11. Demo credentials

> **Development only.** These accounts are created by `npm run db:seed`, which refuses to run with `NODE_ENV=production`. All of them use the password **`Password@123`**.

| Role | Email | What to try |
| --- | --- | --- |
| Customer | `customer@example.com` (Priya Sharma) | Upcoming booking tomorrow at Urban Cuts, a past visit to review, favourites, notifications |
| Salon owner | `owner@example.com` | Owns **Urban Cuts** and **Glow Beauty Studio** (switch salons in the sidebar) |
| Staff | `staff@example.com` (Arun Kumar, Urban Cuts) | My day, QR check-in, walk-ins |
| Admin | `admin@example.com` | Approve **Velvet Touch Studio** (pending), moderation, settings |

Other owners are `owner3@…` to `owner11@example.com` (one per salon) and other customers are `customer2@…` to `customer25@example.com`. Coupons to try: `GROOM20`, `SPA20` (11 AM–2 PM, hair spa), `FIRST100`, `WEEKEND15`, `WELCOME50` (platform-wide, first booking).

---

## 12. Tests

```bash
npm test          # unit + integration (Vitest; integration uses TEST_DATABASE_URL)
npm run test:e2e  # Playwright against a running, seeded app (mobile + desktop projects)
```

* **Unit** (`tests/unit`): availability engine (capacity, buffers, staff double-booking, breaks, leave, hours, split shifts, closed days, min-advance/window, multi-resource + multi-staff), coupons, GST, refund tiers and types, time-zone conversion incl. DST.
* **Integration** (`tests/integration`, real PostgreSQL):
  * **20 customers racing for one chair → exactly one hold**; 3 chairs / 10 customers → 3 holds;
  * raw overlapping inserts rejected by the exclusion constraint (`23P01`);
  * holds hide slots and expiry releases them; holidays, past times, hours and blocks are enforced;
  * walk-ins remove online capacity; conflicting walk-ins need an owner override (audited);
  * tenant isolation; cancel/refund; reschedule rules; late check-in message; no-show only after grace; early completion frees capacity; required options;
  * payment verification (valid, forged, failed, idempotent), webhook signature and idempotency, payment-after-expiry auto-refund, cross-customer access.
* **E2E** (`tests/e2e`): full booking → sandbox payment → verified ticket on mobile and desktop; customers blocked from owner routes and APIs; owner live board.

Also verified manually during development: a 12-way concurrent HTTP race for one spa room (one winner), live slot invalidation between two browser sessions, a 360–1440 px horizontal-overflow and HTTP-status scan of all 41 major pages for every role, `next build`, ESLint and `tsc`.

---

## 13. Known limitations

* **Payments:** Razorpay is implemented against its documented API but was only exercised through the sandbox provider here (no live keys). Payouts to salons (Razorpay Route / settlements) and subscription billing for plans are modelled in settings, not automated.
* **Notifications:** in-app and real-time delivery work end to end. Email, SMS, WhatsApp and web-push go through an outbox with adapter stubs; plug in providers in `server/notifications/channels.ts`.
* **Maps:** Leaflet with OpenStreetMap tiles (no key). For heavy production traffic use a commercial tile or geocoding provider. Manual area selection uses a curated list of localities; free-text geocoding isn't wired up. Travel time is a rough distance-based estimate, labelled "approx.".
* **Search at scale:** filters and sorting run in SQL with indexes, but the "available at date/time" filter evaluates the engine for a shortlist of up to 60 salons. At thousands of salons per city, add a precomputed availability cache (e.g. per-salon free-capacity bitmaps refreshed on booking events).
* **Multi-service carts:** a booking is one service plus its options. Combos are modelled as package services.
* **Staff requirements** are "N staff with the skill", not role-specific (e.g. exactly one makeup artist plus one hair stylist).
* **Storage:** the local-disk driver is for development. The S3 driver interface exists but isn't implemented.
* **Rate limiting** is per-IP/per-account fixed windows in Postgres. Put a CDN/WAF in front for volumetric abuse.
* **Docker image** is provided but wasn't built in this environment.

---

## 14. Production deployment

1. **Database:** managed PostgreSQL 16 (RDS, Cloud SQL, Neon, Supabase, Aiven…) with `btree_gist` and `pg_trgm` available. Run `node scripts/migrate.mjs` (or `npm run db:migrate`) on deploy; never run the seed.
2. **App:** `npm run build` produces a standalone server (`output: "standalone"`). Run `node .next/standalone/server.js` behind HTTPS on any Node host (ECS/Fargate, Cloud Run, Fly.io, Railway, Render, a VM), or use the Dockerfile. Serverless platforms work for the API, but SSE and the in-process LISTEN hub need long-lived Node instances (or replace the hub with a managed pub/sub).
3. **Background jobs:** keep `RUN_SWEEPER=true` on app instances (safe on several), or set it to `false` and run `npm run worker` as a separate process.
4. **Payments:** `PAYMENT_PROVIDER=razorpay` with live keys, and a webhook at `https://<domain>/api/payments/webhook` for `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed` using `RAZORPAY_WEBHOOK_SECRET`.
5. **Config:** set `APP_URL` to the public origin (canonical URLs, sitemap, QR links). Keep secrets in your platform's secret manager. Set `STORAGE_DRIVER=s3` once the S3 driver is wired.
6. **Scale:** horizontal app instances share Postgres for sessions, rate limits, holds and realtime. Add read replicas for discovery queries and a CDN for static assets.
