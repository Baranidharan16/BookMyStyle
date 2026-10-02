import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { Errors } from "./errors";

/**
 * Fixed-window rate limiter stored in Postgres so limits hold across
 * multiple app instances. Single atomic upsert per check.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => ${windowSeconds}) else rate_limits.reset_at end
    returning count
  `);
  if ((res.rows[0]?.count ?? 0) > limit) throw Errors.rateLimited();
}
