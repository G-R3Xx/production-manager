import {
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { tenants } from "./app";

export const integrationSchema = pgSchema("integration");

export const myobEnvironmentEnum = pgEnum("myob_environment", ["sandbox", "live"]);
export const myobConnectionStatusEnum = pgEnum("myob_connection_status", [
  "disconnected",
  "connected",
  "error"
]);
export const integrationSystemEnum = pgEnum("integration_system", ["myob"]);
export const externalEntityTypeEnum = pgEnum("external_entity_type", [
  "customer",
  "supplier",
  "product",
  "invoice",
  "tax_code",
  "account",
  "quote",
  "order",
  "material",
  "purchase_order"
]);
export const syncStateEnum = pgEnum("sync_state", ["pending", "synced", "stale", "error"]);
export const syncRunJobTypeEnum = pgEnum("sync_run_job_type", [
  "full_import",
  "incremental_import",
  "push_customers",
  "push_products",
  "push_invoices",
  "reconcile"
]);
export const syncRunStatusEnum = pgEnum("sync_run_status", ["queued", "running", "success", "error"]);

export const myobConnections = integrationSchema.table("myob_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  environment: myobEnvironmentEnum("environment").notNull().default("sandbox"),
  companyFileId: varchar("company_file_id", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  companyFileUsername: varchar("company_file_username", { length: 255 }),
  companyFileAuthToken: text("company_file_auth_token"),
  status: myobConnectionStatusEnum("status").notNull().default("disconnected"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const myobOauthTokens = integrationSchema.table("myob_oauth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenType: varchar("token_type", { length: 100 }),
  scope: text("scope"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const externalMappings = integrationSchema.table("external_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  system: integrationSystemEnum("system").notNull().default("myob"),
  entityType: externalEntityTypeEnum("entity_type").notNull(),
  localId: uuid("local_id").notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  syncState: syncStateEnum("sync_state").notNull().default("pending"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const syncRuns = integrationSchema.table("sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  integrationName: integrationSystemEnum("integration_name").notNull().default("myob"),
  jobType: syncRunJobTypeEnum("job_type").notNull(),
  status: syncRunStatusEnum("status").notNull().default("queued"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  summaryJson: jsonb("summary_json").notNull().default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
