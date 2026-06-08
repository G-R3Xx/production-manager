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

function parseDefinition(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { version: 2, fields: [], components: [] };
  const obj = value as Record<string, any>;
  return {
    ...obj,
    version: typeof obj.version === 'number' ? obj.version : 2,
    fields: Array.isArray(obj.fields) ? obj.fields : [],
    components: Array.isArray(obj.components) ? obj.components : []
  };
}

export async function listConfiguratorTemplatesForTenant(
  tenantId: string
): Promise<ConfiguratorTemplateRecord[]> {
  if (!process.env.DATABASE_URL) return [];

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

  return result.rows.map((row) => ({ ...row, definitionJson: parseDefinition(row.definitionJson) }));
}

export async function getConfiguratorTemplateById(
  tenantId: string,
  templateId: string
): Promise<ConfiguratorTemplateRecord | null> {
  if (!process.env.DATABASE_URL) return null;

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
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
    `,
    [tenantId, templateId]
  );

  const row = result.rows[0];
  return row ? { ...row, definitionJson: parseDefinition(row.definitionJson) } : null;
}

export async function createConfiguratorTemplate(
  input: ConfiguratorTemplateCreateInput
): Promise<{ id: string }> {
  if (!process.env.DATABASE_URL) return { id: "" };

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

  return result.rows[0];
}

export async function updateConfiguratorDefinitionJson(
  tenantId: string,
  templateId: string,
  definitionJson: Record<string, unknown>
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(
    `
      UPDATE catalog.configurator_templates
      SET
        definition_json = $3::jsonb,
        updated_at = now()
      WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, templateId, JSON.stringify(definitionJson)]
  );
}

export async function ensureProductEditorTemplate(input: {
  tenantId: string;
  productId: string;
  currentTemplateId: string | null;
  productName: string;
  department: string;
  productFamily: string;
}): Promise<ConfiguratorTemplateRecord> {
  if (input.currentTemplateId) {
    const existing = await getConfiguratorTemplateById(input.tenantId, input.currentTemplateId);
    if (existing) return existing;
  }

  const created = await createConfiguratorTemplate({
    tenantId: input.tenantId,
    name: `${input.productName} setup`,
    department: input.department,
    productFamily: input.productFamily,
    status: "draft",
    definitionJson: { version: 1, fields: [], components: [] },
    pricingJson: { currency: "AUD" },
    constraintsJson: {}
  });

  await pool.query(
    `UPDATE catalog.products SET default_template_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, input.productId, created.id]
  );

  const template = await getConfiguratorTemplateById(input.tenantId, created.id);
  if (!template) throw new Error("Failed to create product editor template");
  return template;
}

export async function listConfiguratorTemplatesByTenantId(tenantId: string): Promise<ConfiguratorTemplateRecord[]> {
  return listConfiguratorTemplatesForTenant(tenantId);
}
