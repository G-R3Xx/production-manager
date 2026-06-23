-- Controlled MYOB open job/order sync for accepted quotes.
-- Production Manager remains the workflow system; MYOB receives accepted jobs as Orders.

ALTER TABLE sales.quote_drafts
  ADD COLUMN IF NOT EXISTS myob_order_uid varchar(120),
  ADD COLUMN IF NOT EXISTS myob_order_number varchar(120),
  ADD COLUMN IF NOT EXISTS myob_order_status varchar(50) NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS myob_order_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS myob_order_sync_error text,
  ADD COLUMN IF NOT EXISTS myob_order_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS quote_drafts_myob_order_status_idx
  ON sales.quote_drafts (tenant_id, myob_order_status, updated_at DESC);
