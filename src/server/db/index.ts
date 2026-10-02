import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle (same query API as `db`). */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __bmsPool?: Pool; __bmsDb?: DB };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  return new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10) });
}

// Reuse one pool per process (also across dev hot-reloads).
export const pool = globalForDb.__bmsPool ?? (globalForDb.__bmsPool = createPool());
export const db: DB = globalForDb.__bmsDb ?? (globalForDb.__bmsDb = drizzle(pool, { schema }));

export { schema };
