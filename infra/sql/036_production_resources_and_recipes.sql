CREATE TABLE IF NOT EXISTS catalog.machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  machine_type varchar(50) NOT NULL DEFAULT 'other',
  max_width_mm numeric(12,2),
  speed_value numeric(12,4) NOT NULL DEFAULT 0,
  speed_uom varchar(40) NOT NULL DEFAULT 'sqm_per_hour',
  hourly_cost numeric(12,2) NOT NULL DEFAULT 0,
  setup_minutes numeric(12,2) NOT NULL DEFAULT 0,
  ink_cost_per_sqm numeric(12,2) NOT NULL DEFAULT 0,
  capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS machines_tenant_active_idx ON catalog.machines(tenant_id, active, name);

CREATE TABLE IF NOT EXISTS catalog.labour_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  department varchar(50) NOT NULL DEFAULT 'general',
  hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
  calculation_basis varchar(40) NOT NULL DEFAULT 'fixed_minutes',
  calculation_value numeric(12,4) NOT NULL DEFAULT 0,
  minimum_minutes numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labour_operations_tenant_active_idx ON catalog.labour_operations(tenant_id, active, name);

CREATE TABLE IF NOT EXISTS catalog.production_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  department varchar(50) NOT NULL DEFAULT 'general',
  material_id uuid REFERENCES catalog.materials(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES catalog.machines(id) ON DELETE SET NULL,
  labour_operation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  waste_percent numeric(8,4) NOT NULL DEFAULT 0,
  markup_multiplier numeric(8,4) NOT NULL DEFAULT 1.5,
  profit_multiplier numeric(8,4) NOT NULL DEFAULT 1.2,
  recipe_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_recipes_tenant_active_idx ON catalog.production_recipes(tenant_id, active, name);

ALTER TABLE catalog.products ADD COLUMN IF NOT EXISTS production_recipe_id uuid REFERENCES catalog.production_recipes(id) ON DELETE SET NULL;
