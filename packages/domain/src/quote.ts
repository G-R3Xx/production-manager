import { z } from "zod";
import {
  configuratorSnapshotSchema,
  resolvedConfigSchema
} from "./configurator";

export const quoteStatusSchema = z.enum([
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
  "converted"
]);

export const invoiceStatusSchema = z.enum([
  "draft",
  "issued",
  "part_paid",
  "paid",
  "void"
]);

export const quoteSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  quoteNumber: z.string().min(1).max(50),
  customerId: z.string().uuid().nullable(),
  status: quoteStatusSchema,
  title: z.string().max(200).nullable(),
  attentionName: z.string().max(200).nullable(),
  siteAddress: z.string().max(500).nullable(),
  validUntil: z.string().datetime().nullable(),
  requestedInstallDate: z.string().datetime().nullable(),
  subtotal: z.number(),
  taxTotal: z.number(),
  grandTotal: z.number(),
  createdBy: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const quoteLineSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  quoteId: z.string().uuid(),
  sortOrder: z.number().int().nonnegative(),
  productId: z.string().uuid().nullable(),
  qty: z.number().positive(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  costTotal: z.number(),
  displayTitle: z.string(),
  displaySubtitle: z.string().nullable(),
  selectionSummary: z.string(),
  configuratorSnapshot: configuratorSnapshotSchema,
  resolvedConfig: resolvedConfigSchema,
  pricingBreakdown: z.array(z.record(z.string(), z.unknown())).default([]),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type QuoteStatus = z.infer<typeof quoteStatusSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type QuoteLine = z.infer<typeof quoteLineSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;


export const invoiceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  quoteId: z.string().uuid().nullable(),
  invoiceNumber: z.string().min(1).max(50),
  status: invoiceStatusSchema,
  issueDate: z.string().datetime().nullable(),
  dueDate: z.string().datetime().nullable(),
  subtotal: z.number(),
  taxTotal: z.number(),
  grandTotal: z.number(),
  myobUid: z.string().nullable(),
  payloadJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const invoiceLineSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  quoteLineId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonnegative(),
  qty: z.number().positive(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  displayTitle: z.string(),
  displaySubtitle: z.string().nullable(),
  selectionSummary: z.string().nullable(),
  payloadJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
