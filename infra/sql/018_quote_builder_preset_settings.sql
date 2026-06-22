ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS quote_labour_rate numeric(10,2) NOT NULL DEFAULT 66,
  ADD COLUMN IF NOT EXISTS quote_ink_rate_per_sqm numeric(10,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS quote_mono_rate_per_sqm numeric(10,2) NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS quote_signage_size_presets_json jsonb NOT NULL DEFAULT '[
    {"label":"450 × 600 mm","width":"450","height":"600"},
    {"label":"600 × 900 mm","width":"600","height":"900"},
    {"label":"900 × 1200 mm","width":"900","height":"1200"},
    {"label":"1200 × 2400 mm","width":"1200","height":"2400"}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS quote_small_size_presets_json jsonb NOT NULL DEFAULT '[
    {"label":"Business card 90 × 55","width":"90","height":"55"},
    {"label":"DL 99 × 210","width":"99","height":"210"},
    {"label":"A6 105 × 148","width":"105","height":"148"},
    {"label":"A5 148 × 210","width":"148","height":"210"},
    {"label":"A4 210 × 297","width":"210","height":"297"},
    {"label":"A3 297 × 420","width":"297","height":"420"}
  ]'::jsonb;
