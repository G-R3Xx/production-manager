import "server-only";

import { pool } from "@production-manager/db";

export type ProductRecord = {
  id: string;
  tenantId: string;
  sku: string | null;
  name: string;
  department: string;
  productFamily: string;
  status: string;
  calculatorType: string;
  defaultTemplateId: string | null;
  taxCode: string | null;
  createdAt: string;
  updatedAt: string;
  templateName: string | null;
  myobUid: string | null;
};

export type ProductCreateInput = {
  tenantId: string;
  sku: string | null;
  name: string;
  department: string;
  productFamily: string;
  status: string;
  calculatorType: string;
  defaultTemplateId: string | null;
  taxCode: string | null;
};

export async function listProductsForTenant(tenantId: string): Promise<ProductRecord[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const result = await pool.query<ProductRecord>(
    `
      SELECT
        p.id,
        p.tenant_id AS "tenantId",
        p.sku,
        p.name,
        p.department,
        p.product_family AS "productFamily",
        p.status,
        p.calculator_type AS "calculatorType",
        p.default_template_id AS "defaultTemplateId",
        p.tax_code AS "taxCode",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        ct.name AS "templateName",
        p.myob_uid AS "myobUid"
      FROM catalog.products p
      LEFT JOIN catalog.configurator_templates ct ON ct.id = p.default_template_id
      WHERE p.tenant_id = $1
      ORDER BY p.name ASC, p.created_at DESC
    `,
    [tenantId]
  );

  return result.rows;
}

export async function createProduct(input: ProductCreateInput): Promise<{ id: string }> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.products (
        tenant_id,
        sku,
        name,
        department,
        product_family,
        status,
        calculator_type,
        default_template_id,
        tax_code
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `,
    [
      input.tenantId,
      input.sku,
      input.name,
      input.department,
      input.productFamily,
      input.status,
      input.calculatorType,
      input.defaultTemplateId,
      input.taxCode
    ]
  );

  return result.rows[0] ?? { id: '' };
}

export async function upsertImportedProduct(tenantId: string, input: {
  myobUid: string;
  sku?: string | null;
  name: string;
  taxCode?: string | null;
  status?: string;
  department?: string;
  productFamily?: string;
  calculatorType?: string;
  payloadJson?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.products (
        tenant_id,
        myob_uid,
        sku,
        name,
        department,
        product_family,
        status,
        calculator_type,
        default_template_id,
        tax_code,
        payload_json,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::varchar,
        $3::varchar,
        $4::varchar,
        $5::varchar,
        $6::varchar,
        $7::varchar,
        $8::varchar,
        null,
        $9::varchar,
        $10::jsonb,
        now(),
        now()
      )
      ON CONFLICT (tenant_id, myob_uid)
      DO UPDATE SET
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        department = EXCLUDED.department,
        product_family = EXCLUDED.product_family,
        status = EXCLUDED.status,
        calculator_type = EXCLUDED.calculator_type,
        tax_code = EXCLUDED.tax_code,
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
      RETURNING id
    `,
    [
      tenantId,
      input.myobUid,
      input.sku ?? null,
      input.name,
      input.department ?? "general",
      input.productFamily ?? "display_products",
      input.status ?? "active",
      input.calculatorType ?? "configurator_template",
      input.taxCode ?? null,
      JSON.stringify(input.payloadJson ?? {})
    ]
  );

  return result.rows[0] ?? { id: "" };
}

export async function getProductById(tenantId: string, productId: string): Promise<ProductRecord | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const result = await pool.query<ProductRecord>(
    `
      SELECT
        p.id,
        p.tenant_id AS "tenantId",
        p.sku,
        p.name,
        p.department,
        p.product_family AS "productFamily",
        p.status,
        p.calculator_type AS "calculatorType",
        p.default_template_id AS "defaultTemplateId",
        p.tax_code AS "taxCode",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        ct.name AS "templateName",
        p.myob_uid AS "myobUid"
      FROM catalog.products p
      LEFT JOIN catalog.configurator_templates ct ON ct.id = p.default_template_id
      WHERE p.tenant_id = $1 AND p.id = $2
      LIMIT 1
    `,
    [tenantId, productId]
  );

  return result.rows[0] ?? null;
}

export async function updateProduct(tenantId: string, productId: string, input: {
  sku: string | null;
  name: string;
  department: string;
  productFamily: string;
  status: string;
  defaultTemplateId: string | null;
  taxCode: string | null;
}): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await pool.query(
    `
      UPDATE catalog.products
      SET
        sku = $3,
        name = $4,
        department = $5,
        product_family = $6,
        status = $7,
        default_template_id = $8,
        tax_code = $9,
        updated_at = now()
      WHERE tenant_id = $1 AND id = $2
    `,
    [
      tenantId,
      productId,
      input.sku,
      input.name,
      input.department,
      input.productFamily,
      input.status,
      input.defaultTemplateId,
      input.taxCode
    ]
  );
}

export async function listProductsByTenantId(tenantId: string): Promise<ProductRecord[]> {
  return listProductsForTenant(tenantId);
}
