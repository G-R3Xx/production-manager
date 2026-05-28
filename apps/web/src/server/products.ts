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
        ct.name AS "templateName"
      FROM catalog.products p
      LEFT JOIN catalog.configurator_templates ct ON ct.id = p.default_template_id
      WHERE p.tenant_id = $1
      ORDER BY p.name ASC, p.created_at DESC
    `,
    [tenantId]
  );

  return result.rows;
}

export async function createProduct(input: ProductCreateInput): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await pool.query(
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
}


export async function listProductsByTenantId(tenantId: string): Promise<ProductRecord[]> {
  return listProductsForTenant(tenantId);
}
