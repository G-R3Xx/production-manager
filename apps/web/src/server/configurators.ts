import "server-only";

import { pool } from "@production-manager/db";

export type ConfiguratorTemplateRecord = {
  id: string;
  tenantId: string;
  name: string;
  department: string;
  productFamily: string;
  version: number;
  status: string;
  definitionJson: Record<string, unknown>;
  pricingJson: Record<string, unknown>;
  constraintsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ConfiguratorTemplateCreateInput = {
  tenantId: string;
  name: string;
  department: string;
  productFamily: string;
  status: string;
  definitionJson: Record<string, unknown>;
  pricingJson: Record<string, unknown>;
  constraintsJson: Record<string, unknown>;
};

export async function listConfiguratorTemplatesForTenant(
  tenantId: string
): Promise<ConfiguratorTemplateRecord[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const result = await pool.query<ConfiguratorTemplateRecord>(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        name,
        department,
        product_family AS "productFamily",
        version,
        status,
        definition_json AS "definitionJson",
        pricing_json AS "pricingJson",
        constraints_json AS "constraintsJson",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM catalog.configurator_templates
      WHERE tenant_id = $1
      ORDER BY name ASC, created_at DESC
    `,
    [tenantId]
  );

  return result.rows;
}

export async function createConfiguratorTemplate(
  input: ConfiguratorTemplateCreateInput
): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await pool.query(
    `
      INSERT INTO catalog.configurator_templates (
        tenant_id,
        name,
        department,
        product_family,
        status,
        definition_json,
        pricing_json,
        constraints_json
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)
    `,
    [
      input.tenantId,
      input.name,
      input.department,
      input.productFamily,
      input.status,
      JSON.stringify(input.definitionJson),
      JSON.stringify(input.pricingJson),
      JSON.stringify(input.constraintsJson)
    ]
  );
}


export async function listConfiguratorTemplatesByTenantId(tenantId: string): Promise<ConfiguratorTemplateRecord[]> {
  return listConfiguratorTemplatesForTenant(tenantId);
}
