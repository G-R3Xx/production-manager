import "server-only";

import { pool } from "@production-manager/db";

export type PurchaseOrderStatus = "draft" | "ordered" | "received" | "cancelled";

export type PurchaseOrderRecord = {
  id: string;
  tenantId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  myobUid: string | null;
  myobNumber: string | null;
  myobSyncStatus: "not_synced" | "synced" | "failed" | "pending";
  myobLastError: string | null;
  myobSyncedAt: string | null;
  emailTo: string | null;
  emailStatus: "not_sent" | "sent" | "failed" | "pending";
  emailSentAt: string | null;
  emailLastError: string | null;
  emailMessageId: string | null;
  sentAt: string | null;
  orderDate: string;
  promisedDate: string | null;
  shipToAddress: string | null;
  notes: string | null;
  isTaxInclusive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderLineRecord = {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  sortOrder: number;
  materialId: string;
  materialName: string;
  materialSku: string | null;
  materialMyobUid: string | null;
  materialMyobPayloadJson: Record<string, unknown>;
  quantity: string;
  unitCost: string;
  lineTotal: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchasingDefaults = {
  expenseAccountUid: string | null;
  expenseAccountName: string | null;
  expenseAccountDisplayId: string | null;
  taxCodeUid: string | null;
  taxCode: string | null;
};

let purchasingSchemaReady = false;
export async function ensurePurchasingSchema(): Promise<void> {
  if (purchasingSchemaReady || !process.env.DATABASE_URL) return;
  await pool.query(`
    ALTER TYPE external_entity_type ADD VALUE IF NOT EXISTS 'material';
    ALTER TYPE external_entity_type ADD VALUE IF NOT EXISTS 'purchase_order';
    CREATE SCHEMA IF NOT EXISTS purchasing;

    ALTER TABLE app.tenant_settings
      ADD COLUMN IF NOT EXISTS myob_purchase_expense_account_uid varchar(255),
      ADD COLUMN IF NOT EXISTS myob_purchase_expense_account_name varchar(255),
      ADD COLUMN IF NOT EXISTS myob_purchase_expense_account_display_id varchar(30),
      ADD COLUMN IF NOT EXISTS myob_purchase_tax_code_uid varchar(255),
      ADD COLUMN IF NOT EXISTS myob_purchase_tax_code varchar(20);

    ALTER TABLE catalog.materials
      ADD COLUMN IF NOT EXISTS myob_uid varchar(255),
      ADD COLUMN IF NOT EXISTS myob_display_id varchar(30),
      ADD COLUMN IF NOT EXISTS myob_sync_state varchar(30),
      ADD COLUMN IF NOT EXISTS myob_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE UNIQUE INDEX IF NOT EXISTS materials_tenant_myob_uid_uq
      ON catalog.materials (tenant_id, myob_uid) WHERE myob_uid IS NOT NULL;

    CREATE TABLE IF NOT EXISTS purchasing.purchase_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      po_number varchar(50) NOT NULL,
      supplier_id uuid NOT NULL REFERENCES app.suppliers(id) ON DELETE RESTRICT,
      status varchar(30) NOT NULL DEFAULT 'draft',
      myob_uid varchar(255),
      myob_number varchar(50),
      order_date date NOT NULL DEFAULT CURRENT_DATE,
      promised_date date,
      ship_to_address text,
      notes text,
      is_tax_inclusive boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, po_number)
    );

    ALTER TABLE purchasing.purchase_orders
      ADD COLUMN IF NOT EXISTS myob_sync_status varchar(30) NOT NULL DEFAULT 'not_synced',
      ADD COLUMN IF NOT EXISTS myob_last_error text,
      ADD COLUMN IF NOT EXISTS myob_synced_at timestamptz,
      ADD COLUMN IF NOT EXISTS email_to varchar(320),
      ADD COLUMN IF NOT EXISTS email_status varchar(30) NOT NULL DEFAULT 'not_sent',
      ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS email_last_error text,
      ADD COLUMN IF NOT EXISTS email_message_id varchar(255),
      ADD COLUMN IF NOT EXISTS sent_at timestamptz;

    CREATE TABLE IF NOT EXISTS purchasing.purchase_order_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      purchase_order_id uuid NOT NULL REFERENCES purchasing.purchase_orders(id) ON DELETE CASCADE,
      sort_order integer NOT NULL DEFAULT 0,
      material_id uuid NOT NULL REFERENCES catalog.materials(id) ON DELETE RESTRICT,
      quantity numeric(13,6) NOT NULL DEFAULT 1,
      unit_cost numeric(13,6) NOT NULL DEFAULT 0,
      description text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS purchasing.purchase_order_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      purchase_order_id uuid NOT NULL REFERENCES purchasing.purchase_orders(id) ON DELETE CASCADE,
      document_type varchar(40) NOT NULL DEFAULT 'purchase_order_pdf',
      file_name varchar(255) NOT NULL,
      content_type varchar(100) NOT NULL DEFAULT 'application/pdf',
      file_bytes bytea NOT NULL,
      recipient_email varchar(320),
      message_id varchar(255),
      metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS purchasing.purchase_order_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      purchase_order_id uuid NOT NULL REFERENCES purchasing.purchase_orders(id) ON DELETE CASCADE,
      event_type varchar(60) NOT NULL,
      message text,
      payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS purchase_order_documents_order_idx
      ON purchasing.purchase_order_documents (tenant_id, purchase_order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS purchase_order_events_order_idx
      ON purchasing.purchase_order_events (tenant_id, purchase_order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS purchase_orders_tenant_updated_idx
      ON purchasing.purchase_orders (tenant_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS purchase_order_lines_order_idx
      ON purchasing.purchase_order_lines (tenant_id, purchase_order_id, sort_order, created_at);

    -- V26.08.14.03: purchase orders created/synced before the explicit sync-status
    -- columns existed already have a MYOB UID, but PostgreSQL gave the new status
    -- column its default of 'not_synced'. Backfill only that legacy/default state;
    -- never overwrite a real pending/failed state.
    UPDATE purchasing.purchase_orders
    SET myob_sync_status='synced',
        myob_synced_at=COALESCE(myob_synced_at,updated_at),
        updated_at=updated_at
    WHERE myob_uid IS NOT NULL
      AND myob_sync_status='not_synced';
  `);
  purchasingSchemaReady = true;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getPurchasingDefaults(tenantId: string): Promise<PurchasingDefaults> {
  await ensurePurchasingSchema();
  const result = await pool.query<PurchasingDefaults>(`
    SELECT myob_purchase_expense_account_uid AS "expenseAccountUid",
      myob_purchase_expense_account_name AS "expenseAccountName",
      myob_purchase_expense_account_display_id AS "expenseAccountDisplayId",
      myob_purchase_tax_code_uid AS "taxCodeUid",
      myob_purchase_tax_code AS "taxCode"
    FROM app.tenant_settings WHERE tenant_id=$1::uuid LIMIT 1
  `,[tenantId]);
  return result.rows[0] ?? { expenseAccountUid:null, expenseAccountName:null, expenseAccountDisplayId:null, taxCodeUid:null, taxCode:null };
}

export async function savePurchasingDefaults(tenantId: string, input: PurchasingDefaults): Promise<void> {
  await ensurePurchasingSchema();
  await pool.query(`
    INSERT INTO app.tenant_settings (tenant_id,myob_purchase_expense_account_uid,myob_purchase_expense_account_name,
      myob_purchase_expense_account_display_id,myob_purchase_tax_code_uid,myob_purchase_tax_code,created_at,updated_at)
    VALUES ($1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::varchar,$6::varchar,now(),now())
    ON CONFLICT (tenant_id) DO UPDATE SET
      myob_purchase_expense_account_uid=EXCLUDED.myob_purchase_expense_account_uid,
      myob_purchase_expense_account_name=EXCLUDED.myob_purchase_expense_account_name,
      myob_purchase_expense_account_display_id=EXCLUDED.myob_purchase_expense_account_display_id,
      myob_purchase_tax_code_uid=EXCLUDED.myob_purchase_tax_code_uid,
      myob_purchase_tax_code=EXCLUDED.myob_purchase_tax_code,
      updated_at=now()
  `,[tenantId,input.expenseAccountUid,input.expenseAccountName,input.expenseAccountDisplayId,input.taxCodeUid,input.taxCode]);
}

async function nextPoNumber(tenantId: string): Promise<string> {
  const result = await pool.query<{ next: string }>(`
    SELECT (COALESCE(MAX(NULLIF(regexp_replace(po_number,'\\D','','g'),'' )::bigint),0)+1)::text AS next
    FROM purchasing.purchase_orders WHERE tenant_id=$1::uuid
  `,[tenantId]);
  const serial = String(result.rows[0]?.next ?? "1").padStart(5,"0");
  return `PO-${serial}`;
}

export async function createPurchaseOrder(tenantId: string, input: {
  supplierId: string; materialId?: string | null; shipToAddress?: string | null; notes?: string | null;
}): Promise<{ id: string; poNumber: string }> {
  await ensurePurchasingSchema();
  const poNumber = await nextPoNumber(tenantId);
  const result = await pool.query<{ id:string }>(`
    INSERT INTO purchasing.purchase_orders (tenant_id,po_number,supplier_id,status,ship_to_address,notes,created_at,updated_at)
    VALUES ($1::uuid,$2::varchar,$3::uuid,'draft',$4::text,$5::text,now(),now()) RETURNING id
  `,[tenantId,poNumber,input.supplierId,input.shipToAddress??null,input.notes??null]);
  const id=result.rows[0].id;
  if (input.materialId) {
    const material = await pool.query<{ purchaseCost:string }>(`
      SELECT purchase_cost::text AS "purchaseCost" FROM catalog.materials WHERE tenant_id=$1::uuid AND id=$2::uuid LIMIT 1
    `,[tenantId,input.materialId]);
    await addPurchaseOrderLine(tenantId,id,{materialId:input.materialId,quantity:"1",unitCost:material.rows[0]?.purchaseCost??"0"});
  }
  return { id, poNumber };
}

export async function listPurchaseOrders(tenantId: string): Promise<PurchaseOrderRecord[]> {
  await ensurePurchasingSchema();
  const result=await pool.query<PurchaseOrderRecord>(`
    SELECT po.id,po.tenant_id AS "tenantId",po.po_number AS "poNumber",po.supplier_id AS "supplierId",
      s.display_name AS "supplierName",po.status,po.myob_uid AS "myobUid",po.myob_number AS "myobNumber",
      CASE WHEN po.myob_sync_status='not_synced' AND po.myob_uid IS NOT NULL THEN 'synced' ELSE po.myob_sync_status END AS "myobSyncStatus",
      po.myob_last_error AS "myobLastError",po.myob_synced_at AS "myobSyncedAt",
      po.email_to AS "emailTo",po.email_status AS "emailStatus",po.email_sent_at AS "emailSentAt",
      po.email_last_error AS "emailLastError",po.email_message_id AS "emailMessageId",po.sent_at AS "sentAt",
      po.order_date::text AS "orderDate",po.promised_date::text AS "promisedDate",po.ship_to_address AS "shipToAddress",
      po.notes,po.is_tax_inclusive AS "isTaxInclusive",po.created_at AS "createdAt",po.updated_at AS "updatedAt"
    FROM purchasing.purchase_orders po JOIN app.suppliers s ON s.id=po.supplier_id
    WHERE po.tenant_id=$1::uuid ORDER BY po.updated_at DESC,po.created_at DESC LIMIT 100
  `,[tenantId]);
  return result.rows;
}

export async function getPurchaseOrder(tenantId: string, id: string | null | undefined): Promise<PurchaseOrderRecord|null> {
  if (!id) return null;
  const list=await listPurchaseOrders(tenantId);
  return list.find((row)=>row.id===id)??null;
}

export async function listPurchaseOrderLines(tenantId: string, purchaseOrderId: string): Promise<PurchaseOrderLineRecord[]> {
  await ensurePurchasingSchema();
  const result=await pool.query<Omit<PurchaseOrderLineRecord,"materialMyobPayloadJson"> & { materialMyobPayloadJson:unknown }>(`
    SELECT l.id,l.tenant_id AS "tenantId",l.purchase_order_id AS "purchaseOrderId",l.sort_order AS "sortOrder",
      l.material_id AS "materialId",m.name AS "materialName",m.sku AS "materialSku",m.myob_uid AS "materialMyobUid",
      m.myob_payload_json AS "materialMyobPayloadJson",l.quantity::text AS quantity,l.unit_cost::text AS "unitCost",
      (l.quantity*l.unit_cost)::text AS "lineTotal",l.description,l.created_at AS "createdAt",l.updated_at AS "updatedAt"
    FROM purchasing.purchase_order_lines l JOIN catalog.materials m ON m.id=l.material_id
    WHERE l.tenant_id=$1::uuid AND l.purchase_order_id=$2::uuid ORDER BY l.sort_order,l.created_at
  `,[tenantId,purchaseOrderId]);
  return result.rows.map((row)=>({...row,materialMyobPayloadJson:asObject(row.materialMyobPayloadJson)}));
}

export async function addPurchaseOrderLine(tenantId:string,purchaseOrderId:string,input:{materialId:string;quantity:string;unitCost:string;description?:string|null}):Promise<void>{
  await ensurePurchasingSchema();
  const sort=await pool.query<{next:number}>(`SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM purchasing.purchase_order_lines WHERE tenant_id=$1::uuid AND purchase_order_id=$2::uuid`,[tenantId,purchaseOrderId]);
  await pool.query(`INSERT INTO purchasing.purchase_order_lines (tenant_id,purchase_order_id,sort_order,material_id,quantity,unit_cost,description,created_at,updated_at)
    VALUES ($1::uuid,$2::uuid,$3::int,$4::uuid,$5::numeric,$6::numeric,$7::text,now(),now())`,[tenantId,purchaseOrderId,sort.rows[0]?.next??0,input.materialId,input.quantity,input.unitCost,input.description??null]);
  await pool.query(`UPDATE purchasing.purchase_orders SET updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,purchaseOrderId]);
}

export async function updatePurchaseOrderLine(tenantId:string,lineId:string,input:{quantity:string;unitCost:string;description?:string|null}):Promise<void>{
  await ensurePurchasingSchema();
  const result = await pool.query<{purchaseOrderId:string}>(`UPDATE purchasing.purchase_order_lines SET quantity=$3::numeric,unit_cost=$4::numeric,description=$5::text,updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING purchase_order_id AS "purchaseOrderId"`,[tenantId,lineId,input.quantity,input.unitCost,input.description??null]);
  if(result.rows[0]?.purchaseOrderId) await pool.query(`UPDATE purchasing.purchase_orders SET updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,result.rows[0].purchaseOrderId]);
}

export async function deletePurchaseOrderLine(tenantId:string,lineId:string):Promise<void>{
  await ensurePurchasingSchema();
  const result=await pool.query<{purchaseOrderId:string}>(`DELETE FROM purchasing.purchase_order_lines WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING purchase_order_id AS "purchaseOrderId"`,[tenantId,lineId]);
  if(result.rows[0]?.purchaseOrderId) await pool.query(`UPDATE purchasing.purchase_orders SET updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,result.rows[0].purchaseOrderId]);
}

export async function updatePurchaseOrderHeader(tenantId:string,id:string,input:{promisedDate?:string|null;shipToAddress?:string|null;notes?:string|null}):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET promised_date=$3::date,ship_to_address=$4::text,notes=$5::text,updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,input.promisedDate??null,input.shipToAddress??null,input.notes??null]);
}

export async function markPurchaseOrderMyobSynced(tenantId:string,id:string,input:{myobUid:string;myobNumber?:string|null}):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET myob_uid=$3::varchar,myob_number=$4::varchar,status='ordered',
      myob_sync_status='synced',myob_last_error=NULL,myob_synced_at=now(),sent_at=COALESCE(sent_at,now()),updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,input.myobUid,input.myobNumber??null]);
  await addPurchaseOrderEvent(tenantId,id,"myob_synced",input.myobNumber ? `Synced to MYOB as ${input.myobNumber}` : "Synced to MYOB",{myobUid:input.myobUid,myobNumber:input.myobNumber??null});
}

export async function markPurchaseOrderMyobPending(tenantId:string,id:string):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET myob_sync_status='pending',myob_last_error=NULL,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id]);
}

export async function markPurchaseOrderMyobFailed(tenantId:string,id:string,errorMessage:string):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET myob_sync_status='failed',myob_last_error=$3::text,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,errorMessage]);
  await addPurchaseOrderEvent(tenantId,id,"myob_failed",errorMessage);
}

export async function markPurchaseOrderEmailPending(tenantId:string,id:string,emailTo:string):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET email_to=$3::varchar,email_status='pending',email_last_error=NULL,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,emailTo]);
}

export async function markPurchaseOrderEmailSent(tenantId:string,id:string,input:{emailTo:string;messageId?:string|null}):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET email_to=$3::varchar,email_status='sent',email_sent_at=now(),email_last_error=NULL,
      email_message_id=$4::varchar,sent_at=COALESCE(sent_at,now()),status=CASE WHEN status='draft' THEN 'ordered' ELSE status END,updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,input.emailTo,input.messageId??null]);
  await addPurchaseOrderEvent(tenantId,id,"email_sent",`Purchase order emailed to ${input.emailTo}`,{emailTo:input.emailTo,messageId:input.messageId??null});
}

export async function markPurchaseOrderEmailFailed(tenantId:string,id:string,input:{emailTo?:string|null;errorMessage:string}):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET email_to=COALESCE($3::varchar,email_to),email_status='failed',email_last_error=$4::text,updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,input.emailTo??null,input.errorMessage]);
  await addPurchaseOrderEvent(tenantId,id,"email_failed",input.errorMessage,{emailTo:input.emailTo??null});
}

export async function archivePurchaseOrderPdf(tenantId:string,purchaseOrderId:string,input:{fileName:string;bytes:Uint8Array;recipientEmail?:string|null;messageId?:string|null;metadata?:Record<string,unknown>}):Promise<{id:string}>{
  await ensurePurchasingSchema();
  const result=await pool.query<{id:string}>(`INSERT INTO purchasing.purchase_order_documents
    (tenant_id,purchase_order_id,document_type,file_name,content_type,file_bytes,recipient_email,message_id,metadata_json,created_at)
    VALUES ($1::uuid,$2::uuid,'purchase_order_pdf',$3::varchar,'application/pdf',$4::bytea,$5::varchar,$6::varchar,$7::jsonb,now()) RETURNING id`,
    [tenantId,purchaseOrderId,input.fileName,Buffer.from(input.bytes),input.recipientEmail??null,input.messageId??null,JSON.stringify(input.metadata??{})]);
  return result.rows[0];
}

export async function getLatestPurchaseOrderPdf(tenantId:string,purchaseOrderId:string):Promise<{fileName:string;bytes:Buffer;createdAt:string}|null>{
  await ensurePurchasingSchema();
  const result=await pool.query<{fileName:string;bytes:Buffer;createdAt:string}>(`SELECT file_name AS "fileName",file_bytes AS bytes,created_at AS "createdAt"
    FROM purchasing.purchase_order_documents WHERE tenant_id=$1::uuid AND purchase_order_id=$2::uuid AND document_type='purchase_order_pdf'
    ORDER BY created_at DESC LIMIT 1`,[tenantId,purchaseOrderId]);
  return result.rows[0]??null;
}

export async function getPurchaseOrderPdfById(tenantId:string,purchaseOrderId:string,documentId:string):Promise<{fileName:string;bytes:Buffer;createdAt:string}|null>{
  await ensurePurchasingSchema();
  const result=await pool.query<{fileName:string;bytes:Buffer;createdAt:string}>(`SELECT file_name AS "fileName",file_bytes AS bytes,created_at AS "createdAt"
    FROM purchasing.purchase_order_documents WHERE tenant_id=$1::uuid AND purchase_order_id=$2::uuid AND id=$3::uuid AND document_type='purchase_order_pdf' LIMIT 1`,[tenantId,purchaseOrderId,documentId]);
  return result.rows[0]??null;
}

export async function listPurchaseOrderDocuments(tenantId:string,purchaseOrderId:string):Promise<Array<{id:string;fileName:string;recipientEmail:string|null;messageId:string|null;createdAt:string}>>{
  await ensurePurchasingSchema();
  const result=await pool.query<{id:string;fileName:string;recipientEmail:string|null;messageId:string|null;createdAt:string}>(`SELECT id,file_name AS "fileName",recipient_email AS "recipientEmail",message_id AS "messageId",created_at AS "createdAt"
    FROM purchasing.purchase_order_documents WHERE tenant_id=$1::uuid AND purchase_order_id=$2::uuid AND document_type='purchase_order_pdf' ORDER BY created_at DESC LIMIT 25`,[tenantId,purchaseOrderId]);
  return result.rows;
}

export async function listPurchaseOrderEvents(tenantId:string,purchaseOrderId:string):Promise<Array<{id:string;eventType:string;message:string|null;payloadJson:Record<string,unknown>;createdAt:string}>>{
  await ensurePurchasingSchema();
  const result=await pool.query<{id:string;eventType:string;message:string|null;payloadJson:unknown;createdAt:string}>(`SELECT id,event_type AS "eventType",message,payload_json AS "payloadJson",created_at AS "createdAt"
    FROM purchasing.purchase_order_events WHERE tenant_id=$1::uuid AND purchase_order_id=$2::uuid ORDER BY created_at DESC LIMIT 50`,[tenantId,purchaseOrderId]);
  return result.rows.map(row=>({...row,payloadJson:asObject(row.payloadJson)}));
}

export async function addPurchaseOrderEvent(tenantId:string,purchaseOrderId:string,eventType:string,message?:string|null,payload?:Record<string,unknown>):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`INSERT INTO purchasing.purchase_order_events (tenant_id,purchase_order_id,event_type,message,payload_json,created_at) VALUES ($1::uuid,$2::uuid,$3::varchar,$4::text,$5::jsonb,now())`,
    [tenantId,purchaseOrderId,eventType,message??null,JSON.stringify(payload??{})]);
}

export async function setPurchaseOrderStatus(tenantId:string,id:string,status:PurchaseOrderStatus):Promise<void>{
  await ensurePurchasingSchema();
  await pool.query(`UPDATE purchasing.purchase_orders SET status=$3::varchar,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,status]);
}
