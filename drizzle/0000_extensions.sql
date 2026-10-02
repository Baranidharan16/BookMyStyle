-- btree_gist: lets exclusion constraints combine "=" on uuid with "&&" on ranges
-- pg_trgm:    fuzzy / autocomplete search on salon and service names
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
