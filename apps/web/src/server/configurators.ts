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
  definitionJson: Record<string, any>;
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

function parseJson(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function normalizeFields(definitionJson: Record<string, any>) {
  return Array.isArray(definitionJson.fields) ? definitionJson.fields : [];
}

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

  return result.rows.map((row) => ({
    ...row,
    definitionJson: parseJson(row.definitionJson),
    pricingJson: parseJson(row.pricingJson),
    constraintsJson: parseJson(row.constraintsJson)
  }));
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
      VALUES ($1,$2,$3::department,$4::product_family,$5::product_status,$6::jsonb,$7::jsonb,$8::jsonb)
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

export async function addConfiguratorField(input: {
  tenantId: string;
  templateId: string;
  label: string;
  key: string;
  type: string;
  required: boolean;
  options: Array<{ id: string; label: string; value: string; priceAdjustment: number; costAdjustment: number }>;
}) {
  const result = await pool.query<{ definitionJson: Record<string, any> }>(
    `
      SELECT definition_json AS "definitionJson"
      FROM catalog.configurator_templates
      WHERE id = $1::uuid AND tenant_id = $2::uuid
      LIMIT 1
    `,
    [input.templateId, input.tenantId]
  );

  const existing = result.rows[0]?.definitionJson ? parseJson(result.rows[0].definitionJson) : {};
  const fields = normalizeFields(existing);
  const next = {
    ...existing,
    version: typeof existing.version === "number" ? existing.version : 1,
    fields: [
      ...fields,
      {
        id: `${input.key}-${Date.now()}`,
        key: input.key,
        label: input.label,
        type: input.type,
        required: input.required,
        options: input.type === "select" ? input.options : undefined,
        defaultValue: input.type === "quantity" ? 1 : undefined
      }
    ]
  };

  await pool.query(
    `
      UPDATE catalog.configurator_templates
      SET definition_json = $3::jsonb,
          updated_at = now()
      WHERE id = $1::uuid AND tenant_id = $2::uuid
    `,
    [input.templateId, input.tenantId, JSON.stringify(next)]
  );
}

export async function listConfiguratorTemplatesByTenantId(tenantId: string): Promise<ConfiguratorTemplateRecord[]> {
  return listConfiguratorTemplatesForTenant(tenantId);
}
