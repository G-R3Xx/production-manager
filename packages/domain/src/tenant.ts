import { z } from "zod";

export const tenantStatusSchema = z.enum(["active", "suspended", "archived"]);

export const tenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(2).max(120),
  name: z.string().min(1).max(200),
  status: tenantStatusSchema,
  timezone: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type TenantStatus = z.infer<typeof tenantStatusSchema>;
export type Tenant = z.infer<typeof tenantSchema>;

export const tenantSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  companyLegalName: z.string().max(200).nullable(),
  tradingName: z.string().max(200).nullable(),
  abn: z.string().max(50).nullable(),
  phone: z.string().max(50).nullable(),
  email: z.string().email().nullable(),
  address: z.string().max(500).nullable(),
  defaultCurrency: z.string().length(3).default("AUD"),
  quoteTerms: z.string().nullable(),
  proofTerms: z.string().nullable(),
  jobTerms: z.string().nullable(),
  myobEnabled: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type TenantSettings = z.infer<typeof tenantSettingsSchema>;
