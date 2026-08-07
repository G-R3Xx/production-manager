import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  timestamp,
  text,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { tenants } from "./app";

export const catalogSchema = pgSchema("catalog");

export const departmentEnum = pgEnum("department", [
  "signage",
  "small_format",
  "plan_printing",
  "poster_printing",
  "installation",
  "general"
]);

export const productFamilyEnum = pgEnum("product_family", [
  "rigid_signage",
  "roll_media",
  "banners",
  "stickers_labels",
  "window_wall_graphics",
  "vehicle_graphics",
  "display_products",
  "small_format_print"
]);

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
  "deleted"
]);

export const calculatorTypeEnum = pgEnum("calculator_type", [
  "configurator_template"
]);

export const materialTypeEnum = pgEnum("material_type", [
  "sheet_media",
  "roll_media",
  "roll_laminate",
  "card_stock",
  "paper_stock",
  "cello_stock",
  "binding",
  "finishing",
  "fixing",
  "item",
  "other"
]);

export const templateStatusEnum = pgEnum("template_status", [
  "draft",
  "active",
  "archived"
]);

export const products = catalogSchema.table("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 100 }),
  name: varchar("name", { length: 200 }).notNull(),
  department: departmentEnum("department").notNull(),
  productFamily: productFamilyEnum("product_family").notNull(),
  status: productStatusEnum("status").notNull().default("draft"),
  calculatorType: calculatorTypeEnum("calculator_type")
    .notNull()
    .default("configurator_template"),
  defaultTemplateId: uuid("default_template_id"),
  taxCode: varchar("tax_code", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  productionRecipeId: uuid("production_recipe_id"),
  websiteEnabled: boolean("website_enabled").notNull().default(false),
  websiteMode: varchar("website_mode", { length: 30 }).notNull().default("quote_only"),
  websiteSlug: varchar("website_slug", { length: 200 }),
  websiteCategory: varchar("website_category", { length: 200 }),
  websiteShortDescription: text("website_short_description"),
  websiteDescription: text("website_description"),
  websiteImageUrl: text("website_image_url"),
  websiteConfigJson: jsonb("website_config_json").notNull().default({}),
  websiteSyncVersion: integer("website_sync_version").notNull().default(1),
  websitePublishedAt: timestamp("website_published_at", { withTimezone: true })
});

export const configuratorTemplates = catalogSchema.table("configurator_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  department: departmentEnum("department").notNull(),
  productFamily: productFamilyEnum("product_family").notNull(),
  version: integer("version").notNull().default(1),
  status: templateStatusEnum("status").notNull().default("draft"),
  definitionJson: jsonb("definition_json").notNull().default({}),
  pricingJson: jsonb("pricing_json").notNull().default({}),
  constraintsJson: jsonb("constraints_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const materials = catalogSchema.table("materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  type: materialTypeEnum("type").notNull(),
  materialGroup: varchar("material_group", { length: 50 }),
  minimumBillableSheetFraction: numeric("minimum_billable_sheet_fraction", {
    precision: 6,
    scale: 4
  }),
  rollBillingIncrementMetres: numeric("roll_billing_increment_metres", {
    precision: 6,
    scale: 4
  }),
  reversePrintable: boolean("reverse_printable").notNull().default(false),
  name: varchar("name", { length: 200 }).notNull(),
  customerFacingName: varchar("customer_facing_name", { length: 200 }),
  supplierId: uuid("supplier_id"),
  stockUom: varchar("stock_uom", { length: 20 }).notNull(),
  purchaseUom: varchar("purchase_uom", { length: 20 }).notNull(),
  purchaseToStockFactor: numeric("purchase_to_stock_factor", {
    precision: 12,
    scale: 4
  }).notNull().default("1"),
  widthMm: integer("width_mm"),
  heightMm: integer("height_mm"),
  depthMicrons: integer("depth_microns"),
  gsm: integer("gsm"),
  finish: varchar("finish", { length: 100 }),
  costJson: jsonb("cost_json").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const machines = catalogSchema.table("machines", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  machineType: varchar("machine_type", { length: 50 }).notNull().default("other"),
  maxWidthMm: numeric("max_width_mm", { precision: 12, scale: 2 }),
  speedValue: numeric("speed_value", { precision: 12, scale: 4 }).notNull().default("0"),
  speedUom: varchar("speed_uom", { length: 40 }).notNull().default("sqm_per_hour"),
  hourlyCost: numeric("hourly_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  setupMinutes: numeric("setup_minutes", { precision: 12, scale: 2 }).notNull().default("0"),
  inkCostPerSqm: numeric("ink_cost_per_sqm", { precision: 12, scale: 2 }).notNull().default("0"),
  capabilitiesJson: jsonb("capabilities_json").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const labourOperations = catalogSchema.table("labour_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  department: varchar("department", { length: 50 }).notNull().default("general"),
  hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  calculationBasis: varchar("calculation_basis", { length: 40 }).notNull().default("fixed_minutes"),
  calculationValue: numeric("calculation_value", { precision: 12, scale: 4 }).notNull().default("0"),
  minimumMinutes: numeric("minimum_minutes", { precision: 12, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const productionRecipes = catalogSchema.table("production_recipes", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  department: varchar("department", { length: 50 }).notNull().default("general"),
  materialId: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
  machineId: uuid("machine_id").references(() => machines.id, { onDelete: "set null" }),
  labourOperationIds: jsonb("labour_operation_ids").notNull().default([]),
  wastePercent: numeric("waste_percent", { precision: 8, scale: 4 }).notNull().default("0"),
  markupMultiplier: numeric("markup_multiplier", { precision: 8, scale: 4 }).notNull().default("1.5"),
  profitMultiplier: numeric("profit_multiplier", { precision: 8, scale: 4 }).notNull().default("1.2"),
  recipeJson: jsonb("recipe_json").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
