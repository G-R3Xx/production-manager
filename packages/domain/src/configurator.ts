import { z } from "zod";
import { departmentSchema, productFamilySchema } from "./catalog";

export const configuratorFieldTypeSchema = z.enum([
  "select",
  "multiselect",
  "text",
  "number",
  "boolean",
  "dimensions",
  "quantity",
  "notes"
]);

export const configuratorOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  priceAdjustment: z.number().default(0),
  costAdjustment: z.number().default(0),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const configuratorFieldSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  type: configuratorFieldTypeSchema,
  required: z.boolean().default(false),
  options: z.array(configuratorOptionSchema).default([]),
  defaultValue: z.unknown().optional(),
  helpText: z.string().optional(),
  multiplierKey: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const configuratorTemplateDefinitionSchema = z.object({
  version: z.number().int().positive(),
  fields: z.array(configuratorFieldSchema),
  displayRules: z.array(z.record(z.string(), z.unknown())).default([]),
  pricingRules: z.array(z.record(z.string(), z.unknown())).default([]),
  materialRules: z.array(z.record(z.string(), z.unknown())).default([])
});

export const configuratorTemplateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  department: departmentSchema,
  productFamily: productFamilySchema,
  version: z.number().int().positive(),
  status: z.enum(["draft", "active", "archived"]),
  definitionJson: configuratorTemplateDefinitionSchema,
  pricingJson: z.record(z.string(), z.unknown()).default({}),
  constraintsJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const configuratorSnapshotSchema = z.record(z.string(), z.unknown());

export const resolvedConfigSchema = z.object({
  selections: z.record(z.string(), z.unknown()),
  displayTitle: z.string(),
  displaySubtitle: z.string().nullable(),
  selectionSummary: z.string(),
  unitPrice: z.number(),
  costTotal: z.number(),
  priceBreakdown: z.array(z.record(z.string(), z.unknown())).default([]),
  materialRequirements: z.array(z.record(z.string(), z.unknown())).default([])
});

export type ConfiguratorFieldType = z.infer<typeof configuratorFieldTypeSchema>;
export type ConfiguratorOption = z.infer<typeof configuratorOptionSchema>;
export type ConfiguratorField = z.infer<typeof configuratorFieldSchema>;
export type ConfiguratorTemplateDefinition = z.infer<
  typeof configuratorTemplateDefinitionSchema
>;
export type ConfiguratorTemplate = z.infer<typeof configuratorTemplateSchema>;
export type ConfiguratorSnapshot = z.infer<typeof configuratorSnapshotSchema>;
export type ResolvedConfig = z.infer<typeof resolvedConfigSchema>;
