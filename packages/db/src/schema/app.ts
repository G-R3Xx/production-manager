import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app");

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",
  "archived"
]);

export const globalRoleEnum = pgEnum("global_role", [
  "platform_admin",
  "user"
]);

export const tenantRoleEnum = pgEnum("tenant_role", [
  "owner",
  "manager",
  "staff",
  "sales",
  "installer",
  "accounts"
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "invited",
  "disabled"
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
  "converted"
]);

export const tenants = appSchema.table("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  status: tenantStatusEnum("status").notNull().default("active"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("Australia/Sydney"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const userProfiles = appSchema.table("user_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  shortName: varchar("short_name", { length: 50 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  globalRole: globalRoleEnum("global_role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const memberships = appSchema.table("memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userProfileId: uuid("user_profile_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  tenantRole: tenantRoleEnum("tenant_role").notNull(),
  status: membershipStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const tenantSettings = appSchema.table("tenant_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  companyLegalName: varchar("company_legal_name", { length: 200 }),
  tradingName: varchar("trading_name", { length: 200 }),
  abn: varchar("abn", { length: 50 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  defaultCurrency: varchar("default_currency", { length: 3 }).notNull().default("AUD"),
  quoteTerms: text("quote_terms"),
  proofTerms: text("proof_terms"),
  jobTerms: text("job_terms"),
  myobEnabled: boolean("myob_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const quotes = appSchema.table("quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  quoteNumber: varchar("quote_number", { length: 50 }).notNull(),
  customerId: uuid("customer_id"),
  status: quoteStatusEnum("status").notNull().default("draft"),
  title: varchar("title", { length: 200 }),
  attentionName: varchar("attention_name", { length: 200 }),
  siteAddress: text("site_address"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  requestedInstallDate: timestamp("requested_install_date", { withTimezone: true }),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 12, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 12, scale: 2 }).notNull().default("0"),
  createdBy: uuid("created_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const quoteLines = appSchema.table("quote_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  productId: uuid("product_id"),
  qty: numeric("qty", { precision: 12, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
  costTotal: numeric("cost_total", { precision: 12, scale: 2 }).notNull().default("0"),
  displayTitle: varchar("display_title", { length: 255 }).notNull(),
  displaySubtitle: text("display_subtitle"),
  selectionSummary: text("selection_summary").notNull(),
  configuratorSnapshot: jsonb("configurator_snapshot").notNull().default({}),
  resolvedConfig: jsonb("resolved_config").notNull().default({}),
  pricingBreakdown: jsonb("pricing_breakdown").notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
