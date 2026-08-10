-- V26.08.10.09 artwork revision proof tracking
ALTER TABLE sales.artwork_approval_pages
  ADD COLUMN IF NOT EXISTS proof_revision varchar(40);

UPDATE sales.artwork_approval_pages p
SET proof_revision = aa.revision
FROM sales.artwork_approvals aa
WHERE p.approval_id = aa.id
  AND p.proof_revision IS NULL
  AND p.image_url NOT LIKE 'data:image/svg+xml%';
