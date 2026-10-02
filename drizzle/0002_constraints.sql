-- =====================================================================
-- Double-booking protection enforced by PostgreSQL itself.
--
-- A resource (chair, bed, room) or a staff member can never hold two
-- overlapping, active reservations. Because this is an exclusion
-- constraint, it holds even when two transactions race: the second
-- insert fails with SQLSTATE 23P01 (exclusion_violation), which the
-- booking engine translates into "this slot was just taken".
--
-- `allow_overlap` is only ever true for an owner-approved conflict
-- override on a walk-in (see business rule 11).
-- =====================================================================
ALTER TABLE booking_resources
  ADD CONSTRAINT booking_resources_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (active AND NOT allow_overlap);
--> statement-breakpoint
ALTER TABLE booking_staff
  ADD CONSTRAINT booking_staff_no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (active AND NOT allow_overlap);
--> statement-breakpoint
ALTER TABLE booking_resources ADD CONSTRAINT booking_resources_valid CHECK (starts_at < ends_at);
--> statement-breakpoint
ALTER TABLE booking_staff ADD CONSTRAINT booking_staff_valid CHECK (starts_at < ends_at);
--> statement-breakpoint
-- A staff member cannot have overlapping shifts / breaks on the same weekday.
ALTER TABLE staff_schedules
  ADD CONSTRAINT staff_schedules_no_overlap
  EXCLUDE USING gist (staff_id WITH =, weekday WITH =, int4range(start_minute, end_minute) WITH &&);
--> statement-breakpoint
ALTER TABLE business_hours
  ADD CONSTRAINT business_hours_no_overlap
  EXCLUDE USING gist (salon_id WITH =, weekday WITH =, int4range(open_minute, close_minute) WITH &&);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS services_name_trgm_idx ON services USING gin (lower(name) gin_trgm_ops);
