-- Product recipe / BOM / labour foundations
DO $$ BEGIN
  CREATE TYPE labour_unit AS ENUM ('hour', 'setup', 'item');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE recipe_component_type AS ENUM ('material', 'labour');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE recipe_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS catalog.labour_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  unit labour_unit NOT NULL DEFAULT 'hour',
  cost_rate numeric(12,2) NOT NULL DEFAULT 0,
  sell_rate numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labour_rates_tenant_name_idx ON catalog.labour_rates (tenant_id, name);

CREATE TABLE IF NOT EXISTS catalog.product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status recipe_status NOT NULL DEFAULT 'draft',
  yield_qty numeric(12,2) NOT NULL DEFAULT 1,
  yield_uom varchar(50) NOT NULL DEFAULT 'item',
  notes varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_recipes_tenant_product_idx ON catalog.product_recipes (tenant_id, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS catalog.product_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES catalog.product_recipes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  component_type recipe_component_type NOT NULL,
  material_id uuid,
  labour_rate_id uuid,
  supplier_id uuid,
  name varchar(200) NOT NULL,
  qty numeric(12,4) NOT NULL DEFAULT 0,
  uom varchar(50) NOT NULL,
  waste_percent numeric(8,2) NOT NULL DEFAULT 0,
  cost_override numeric(12,2),
  notes varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_recipe_components_recipe_idx ON catalog.product_recipe_components (recipe_id, sort_order, created_at);
