import { z } from "zod";

export const departmentSchema = z.enum([
  "signage",
  "small_format",
  "installation",
  "general"
]);

export const productFamilySchema = z.enum([
  "rigid_signage",
  "roll_media",
  "banners",
  "stickers_labels",
  "window_wall_graphics",
  "vehicle_graphics",
  "display_products",
  "small_format_print"
]);

export const productStatusSchema = z.enum(["draft", "active", "archived"]);

export const calculatorTypeSchema = z.enum(["configurator_template"]);

export const materialTypeSchema = z.enum([
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

export const productSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sku: z.string().max(100).nullable(),
  name: z.string().min(1).max(200),
  department: departmentSchema,
  productFamily: productFamilySchema,
  status: productStatusSchema,
  calculatorType: calculatorTypeSchema,
  defaultTemplateId: z.string().uuid().nullable(),
  taxCode: z.string().max(50).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const materialSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: materialTypeSchema,
  name: z.string().min(1).max(200),
  supplierId: z.string().uuid().nullable(),
  stockUom: z.string().min(1).max(20),
  purchaseUom: z.string().min(1).max(20),
  purchaseToStockFactor: z.number().positive(),
  widthMm: z.number().nullable(),
  heightMm: z.number().nullable(),
  depthMicrons: z.number().nullable(),
  gsm: z.number().nullable(),
  finish: z.string().max(100).nullable(),
  costJson: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Department = z.infer<typeof departmentSchema>;
export type ProductFamily = z.infer<typeof productFamilySchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type CalculatorType = z.infer<typeof calculatorTypeSchema>;
export type MaterialType = z.infer<typeof materialTypeSchema>;
export type Product = z.infer<typeof productSchema>;
export type Material = z.infer<typeof materialSchema>;
