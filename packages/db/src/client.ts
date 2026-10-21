import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as appSchema from "./schema/app";
import * as catalogSchema from "./schema/catalog";
import * as integrationSchema from "./schema/integration";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL is not set yet. Database connections will fail until it is configured."
  );
}

const schema = {
  ...appSchema,
  ...catalogSchema,
  ...integrationSchema
};

function positiveInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const usesManagedPooler = /pooler\.supabase\.com|pooler/i.test(connectionString ?? "");
const configuredPoolMax = positiveInteger(process.env.PM_DB_POOL_MAX);
// A two-connection pool was safe but forced pages with several independent
// reads to execute in waves. Supabase's managed pooler is specifically designed
// to multiplex serverless connections, so use six concurrent connections there
// while retaining the conservative limit for a direct Postgres URL. Operators
// can override this with PM_DB_POOL_MAX without a code change.
const poolMax = configuredPoolMax ?? (process.env.VERCEL ? (usesManagedPooler ? 6 : 2) : 10);

export const pool = new Pool({
  connectionString,
  // Keep the Vercel pool deliberately small, but do not throw away every warm
  // database connection after only 10 seconds. Quote configuration commonly takes
  // longer than that, and reopening TLS/Postgres connections was making the Save
  // Quote Line path pay cold-connection latency almost every time.
  max: poolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: process.env.VERCEL ? 120_000 : 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: true
});

const slowQueryThresholdMs = positiveInteger(process.env.PM_DB_SLOW_QUERY_MS)
  ?? (process.env.NODE_ENV === "production" ? 750 : 1_500);
const instrumentedClient = Symbol("pmInstrumentedClient");

pool.on("connect", (client) => {
  const mutableClient = client as typeof client & { [instrumentedClient]?: boolean; query: (...args: any[]) => any };
  if (mutableClient[instrumentedClient]) return;
  mutableClient[instrumentedClient] = true;
  const originalQuery = mutableClient.query.bind(client);

  mutableClient.query = (...args: any[]) => {
    // pg also supports callback-style queries. Production Manager uses promises,
    // but leave callback calls untouched so instrumentation cannot change pg's
    // public behaviour for a library/internal call.
    if (typeof args[args.length - 1] === "function") return originalQuery(...args);

    const startedAt = performance.now();
    const pending = originalQuery(...args);
    if (!pending || typeof pending.then !== "function") return pending;

    return pending.finally(() => {
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (elapsedMs < slowQueryThresholdMs) return;
      const firstArg = args[0];
      const text = typeof firstArg === "string"
        ? firstArg
        : firstArg && typeof firstArg === "object" && typeof firstArg.text === "string"
          ? firstArg.text
          : "";
      console.warn("[db-slow-query]", {
        elapsedMs,
        sql: text.replace(/\s+/g, " ").trim().slice(0, 220),
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount,
        vercelRegion: process.env.VERCEL_REGION ?? null
      });
    });
  };
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
