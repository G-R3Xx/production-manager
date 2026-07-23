import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  timestamp,
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
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
  name: varchar("name", { length: 200 }).notNull(),
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
