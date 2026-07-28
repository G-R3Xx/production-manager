CREATE TABLE IF NOT EXISTS catalog.processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  department varchar(50) NOT NULL DEFAULT 'general',
  process_type varchar(50) NOT NULL DEFAULT 'other',
  labour_operation_id uuid REFERENCES catalog.labour_operations(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS processes_tenant_active_idx ON catalog.processes(tenant_id,active,name);

CREATE TABLE IF NOT EXISTS catalog.machine_processes (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES catalog.machines(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES catalog.processes(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(machine_id,process_id)
);
CREATE INDEX IF NOT EXISTS machine_processes_process_idx ON catalog.machine_processes(tenant_id,process_id,priority);

CREATE TABLE IF NOT EXISTS catalog.recipe_processes (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES catalog.production_recipes(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES catalog.processes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(recipe_id,process_id)
);
CREATE INDEX IF NOT EXISTS recipe_processes_recipe_idx ON catalog.recipe_processes(tenant_id,recipe_id,position);
