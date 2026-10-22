-- Fast authenticated equipment editor RPCs.
-- Machine writes go directly from the signed-in browser session to Supabase,
-- avoiding a Vercel function cold start + duplicate auth/DB connection setup.

CREATE OR REPLACE FUNCTION public.pm_machine_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.memberships m
    JOIN app.user_profiles p ON p.id = m.user_profile_id
    WHERE m.tenant_id = p_tenant_id
      AND m.status = 'active'
      AND p.auth_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.pm_machine_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_machine_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pm_create_machine(
  p_tenant_id uuid,
  p_values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, catalog
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(p_values->>'name', ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.pm_machine_member(p_tenant_id) THEN
    RAISE EXCEPTION 'You do not have access to this workspace.' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Machine name is required.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO catalog.machines (
    tenant_id, name, machine_type, max_width_mm, speed_value, speed_uom,
    hourly_cost, setup_minutes, ink_cost_per_sqm, capabilities_json, active
  ) VALUES (
    p_tenant_id,
    v_name,
    COALESCE(NULLIF(p_values->>'machineType', ''), 'other'),
    NULLIF(p_values->>'maxWidthMm', '')::numeric,
    COALESCE(NULLIF(p_values->>'speedValue', '')::numeric, 0),
    COALESCE(NULLIF(p_values->>'speedUom', ''), 'sqm_per_hour'),
    COALESCE(NULLIF(p_values->>'hourlyCost', '')::numeric, 0),
    COALESCE(NULLIF(p_values->>'setupMinutes', '')::numeric, 0),
    COALESCE(NULLIF(p_values->>'inkCostPerSqm', '')::numeric, 0),
    jsonb_build_object(
      'colourImpressionCost', COALESCE(NULLIF(p_values->>'colourImpressionCost', '')::numeric, 0),
      'monoImpressionCost', COALESCE(NULLIF(p_values->>'monoImpressionCost', '')::numeric, 0),
      'maxStackSheets', COALESCE(NULLIF(p_values->>'maxStackSheets', '')::numeric, 0)
    ),
    true
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.pm_create_machine(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_create_machine(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pm_update_machine(
  p_tenant_id uuid,
  p_machine_id uuid,
  p_values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, catalog
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_values->>'name', ''));
  v_found uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pm_machine_member(p_tenant_id) THEN
    RAISE EXCEPTION 'You do not have access to this workspace.' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Machine name is required.' USING ERRCODE = '22023';
  END IF;

  UPDATE catalog.machines
  SET name = v_name,
      machine_type = COALESCE(NULLIF(p_values->>'machineType', ''), 'other'),
      max_width_mm = NULLIF(p_values->>'maxWidthMm', '')::numeric,
      speed_value = COALESCE(NULLIF(p_values->>'speedValue', '')::numeric, 0),
      speed_uom = COALESCE(NULLIF(p_values->>'speedUom', ''), 'sqm_per_hour'),
      hourly_cost = COALESCE(NULLIF(p_values->>'hourlyCost', '')::numeric, 0),
      setup_minutes = COALESCE(NULLIF(p_values->>'setupMinutes', '')::numeric, 0),
      ink_cost_per_sqm = COALESCE(NULLIF(p_values->>'inkCostPerSqm', '')::numeric, 0),
      capabilities_json = COALESCE(capabilities_json, '{}'::jsonb) || jsonb_build_object(
        'colourImpressionCost', COALESCE(NULLIF(p_values->>'colourImpressionCost', '')::numeric, 0),
        'monoImpressionCost', COALESCE(NULLIF(p_values->>'monoImpressionCost', '')::numeric, 0),
        'maxStackSheets', COALESCE(NULLIF(p_values->>'maxStackSheets', '')::numeric, 0)
      ),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_machine_id
  RETURNING id INTO v_found;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Machine could not be found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('id', v_found, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.pm_update_machine(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_update_machine(uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pm_duplicate_machine(
  p_tenant_id uuid,
  p_machine_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, catalog
AS $$
DECLARE
  v_new_id uuid;
  v_new_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pm_machine_member(p_tenant_id) THEN
    RAISE EXCEPTION 'You do not have access to this workspace.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO catalog.machines (
    tenant_id, name, machine_type, max_width_mm, speed_value, speed_uom,
    hourly_cost, setup_minutes, ink_cost_per_sqm, capabilities_json, active
  )
  SELECT
    tenant_id,
    left(name || ' Copy', 200),
    machine_type,
    max_width_mm,
    speed_value,
    speed_uom,
    hourly_cost,
    setup_minutes,
    ink_cost_per_sqm,
    capabilities_json,
    true
  FROM catalog.machines
  WHERE tenant_id = p_tenant_id AND id = p_machine_id
  RETURNING id, name INTO v_new_id, v_new_name;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'Machine could not be found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('id', v_new_id, 'name', v_new_name);
END;
$$;

REVOKE ALL ON FUNCTION public.pm_duplicate_machine(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_duplicate_machine(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pm_delete_machine(
  p_tenant_id uuid,
  p_machine_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, catalog
AS $$
DECLARE
  v_name text;
  v_steps text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pm_machine_member(p_tenant_id) THEN
    RAISE EXCEPTION 'You do not have access to this workspace.' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name
  FROM catalog.machines
  WHERE tenant_id = p_tenant_id AND id = p_machine_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Machine could not be found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name) INTO v_steps
  FROM catalog.labour_operations
  WHERE tenant_id = p_tenant_id
    AND machine_id = p_machine_id
    AND active = true;

  IF COALESCE(v_steps, '') <> '' THEN
    RAISE EXCEPTION 'This machine is used by Production Step(s): %. Change those steps first.', v_steps
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM catalog.machines
  WHERE tenant_id = p_tenant_id AND id = p_machine_id;

  RETURN jsonb_build_object('id', p_machine_id, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.pm_delete_machine(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_delete_machine(uuid, uuid) TO authenticated;
