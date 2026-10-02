import "dotenv/config";
import { Client } from "pg";

/** Reset rate-limit buckets on the (development) database so repeated E2E logins aren't throttled. */
export default async function globalSetup() {
  if (process.env.NODE_ENV === "production") return;
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("delete from rate_limits");
  await c.end();
}
