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
  // Vercel can run several server functions concurrently. Keeping each function's
  // local pool small prevents a burst of page/poll requests from exhausting the
  // Supabase/Postgres connection limit and leaving route streams waiting forever.
  max: process.env.VERCEL ? 4 : 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
