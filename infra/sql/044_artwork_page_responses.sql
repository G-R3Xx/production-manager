-- V26.08.19.16 per-page artwork approval decisions
ALTER TABLE sales.artwork_approval_pages
  ADD COLUMN IF NOT EXISTS client_response_status varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS client_response_notes text,
  ADD COLUMN IF NOT EXISTS client_responded_at timestamptz;

CREATE INDEX IF NOT EXISTS artwork_approval_pages_client_response_idx
  ON sales.artwork_approval_pages (approval_id, client_response_status);

-- Artwork approvals created before per-page decisions were already accepted as a
-- complete set. Preserve that decision when the new columns are introduced.
UPDATE sales.artwork_approval_pages p
SET client_response_status = 'approved',
    client_responded_at = COALESCE(p.client_responded_at, aa.approved_at, aa.updated_at)
FROM sales.artwork_approvals aa
WHERE p.approval_id = aa.id
  AND aa.status = 'approved'
  AND COALESCE(p.client_response_status, 'pending') = 'pending';
