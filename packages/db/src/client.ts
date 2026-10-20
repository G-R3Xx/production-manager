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

export const pool = new Pool({
  connectionString,
  // Keep the Vercel pool deliberately small, but do not throw away every warm
  // database connection after only 10 seconds. Quote configuration commonly takes
  // longer than that, and reopening TLS/Postgres connections was making the Save
  // Quote Line path pay cold-connection latency almost every time.
  max: process.env.VERCEL ? 2 : 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: process.env.VERCEL ? 120_000 : 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: true
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
