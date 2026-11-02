-- Internal confidential quote cost breakdown visibility, granted per workspace member.
-- Deploy BEFORE saving the new Staff checkbox. Default-deny for all existing users.
-- Idempotent and scoped to the existing membership row; no global/profile flag.
ALTER TABLE app.memberships
  ADD COLUMN IF NOT EXISTS quote_cost_breakdown_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app.memberships.quote_cost_breakdown_enabled IS
  'Allows viewing internal itemised quote costing for this tenant only. Granted by an active owner or manager.';
