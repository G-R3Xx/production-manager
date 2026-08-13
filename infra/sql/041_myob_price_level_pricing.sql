-- Production Manager V26.08.13.02
-- MYOB Price Level A-F becomes the single persistent customer pricing class.
-- PM calculated work can apply one factor per MYOB price level.

ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS myob_price_level_factors_json jsonb NOT NULL
  DEFAULT '{"Level A":"1","Level B":"1","Level C":"1","Level D":"1","Level E":"1","Level F":"1"}'::jsonb;

-- Retire the old permanent Production Manager customer discount model.
-- Quote-level discount values are intentionally NOT changed, so existing/historical
-- quotes preserve their agreed pricing and can continue to act as one-off discounts.
UPDATE app.customers
SET payload_json = COALESCE(payload_json, '{}'::jsonb)
  - 'defaultDiscountPercent'
  - 'discountRules'
  - 'discountRulesText'
WHERE COALESCE(payload_json, '{}'::jsonb) ?| ARRAY['defaultDiscountPercent', 'discountRules', 'discountRulesText'];
