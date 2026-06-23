-- Product housekeeping delete compatibility.
-- The original product_status enum only included draft/active/archived.
-- Housekeeping uses a real deleted status so deleted products can be hidden/restored safely.

ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'deleted';
