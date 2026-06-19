-- Adds tenant-level quote pricing multipliers.
-- All product/material/labour/supplier values entered in the app are treated as cost prices.
-- Quote sell price = calculated cost × global_markup_multiplier × global_profit_multiplier.

ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS global_markup_multiplier numeric(8,4) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS global_profit_multiplier numeric(8,4) NOT NULL DEFAULT 1.2;
