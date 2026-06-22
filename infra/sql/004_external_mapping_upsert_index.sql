create unique index if not exists external_mappings_upsert_idx
  on integration.external_mappings (tenant_id, system, entity_type, local_id);
