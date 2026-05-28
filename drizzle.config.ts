import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  console.warn(
    "[drizzle] DATABASE_URL is not set. Generate and migrate commands will require it."
  );
}

export default defineConfig({
  out: "infra/sql/drizzle",
  schema: [
    "./packages/db/src/schema/app.ts",
    "./packages/db/src/schema/catalog.ts"
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  },
  strict: true,
  verbose: true
});
