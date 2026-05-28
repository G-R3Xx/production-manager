import { z } from "zod";

export const integrationSystemSchema = z.enum(["myob"]);
export const myobEnvironmentSchema = z.enum(["sandbox", "live"]);
export const myobConnectionStatusSchema = z.enum(["disconnected", "connected", "error"]);
export const externalEntityTypeSchema = z.enum([
  "customer",
  "supplier",
  "product",
  "invoice",
  "tax_code",
  "account",
  "quote",
  "order"
]);
export const syncStateSchema = z.enum(["pending", "synced", "stale", "error"]);
export const syncRunJobTypeSchema = z.enum([
  "full_import",
  "incremental_import",
  "push_customers",
  "push_products",
  "push_invoices",
  "reconcile"
]);
export const syncRunStatusSchema = z.enum(["queued", "running", "success", "error"]);

export const myobConnectionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  environment: myobEnvironmentSchema,
  companyFileId: z.string().nullable(),
  companyName: z.string().nullable(),
  status: myobConnectionStatusSchema,
  connectedAt: z.string().datetime().nullable(),
  disconnectedAt: z.string().datetime().nullable(),
  lastSuccessfulSyncAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const myobOauthTokenSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string().nullable(),
  scope: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const externalMappingSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  system: integrationSystemSchema,
  entityType: externalEntityTypeSchema,
  localId: z.string().uuid(),
  externalId: z.string(),
  syncState: syncStateSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  payloadJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const syncRunSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  integrationName: integrationSystemSchema,
  jobType: syncRunJobTypeSchema,
  status: syncRunStatusSchema,
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  summaryJson: z.record(z.string(), z.unknown()).default({}),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type MyobConnection = z.infer<typeof myobConnectionSchema>;
export type MyobOauthToken = z.infer<typeof myobOauthTokenSchema>;
export type ExternalMapping = z.infer<typeof externalMappingSchema>;
export type SyncRun = z.infer<typeof syncRunSchema>;
