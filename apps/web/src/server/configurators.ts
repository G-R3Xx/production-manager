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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

  return result.rows;
}

export async function createConfiguratorTemplate(
  input: ConfiguratorTemplateCreateInput
): Promise<string> {
  if (!process.env.DATABASE_URL) {
    return "";
  }

  const result = await pool.query<{ id: string }>(
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
      RETURNING id
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

  return result.rows[0]?.id ?? "";
}

export async function addConfiguratorField(input: {
  tenantId: string;
  templateId: string;
  label: string;
  key: string;
  type: string;
  required: boolean;
  defaultValue?: string | null;
  optionsCsv?: string | null;
}): Promise<void> {
  const currentResult = await pool.query<{ definitionJson: unknown }>(
    `SELECT definition_json AS "definitionJson" FROM catalog.configurator_templates WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [input.tenantId, input.templateId]
  );

  const current = asObject(currentResult.rows[0]?.definitionJson);
  const existingFields = Array.isArray(current.fields) ? current.fields : [];

  const parsedOptions = (input.optionsCsv ?? "")
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean)
    .map((option, index) => ({
      id: `${input.key}-opt-${index + 1}`,
      label: option,
      value: option,
      priceAdjustment: 0,
      costAdjustment: 0
    }));

  const nextField = {
    id: `${input.key}-${existingFields.length + 1}`,
    key: input.key,
    label: input.label,
    type: input.type,
    required: input.required,
    defaultValue: input.defaultValue ?? undefined,
    options: input.type === "select" ? parsedOptions : undefined
  };

  const nextDefinition = {
    ...current,
    version: Number(current.version ?? 1),
    fields: [...existingFields, nextField]
  };

  await pool.query(
    `UPDATE catalog.configurator_templates SET definition_json = $3::jsonb, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [input.tenantId, input.templateId, JSON.stringify(nextDefinition)]
  );
}

export async function listConfiguratorTemplatesByTenantId(tenantId: string): Promise<ConfiguratorTemplateRecord[]> {
  return listConfiguratorTemplatesForTenant(tenantId);
}
