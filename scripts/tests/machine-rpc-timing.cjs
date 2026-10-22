// Local PostgreSQL (PGlite) fixture. Never connects to Supabase or production.
// Run from repository root. PGlite must be installed in the test environment;
// PM_PGLITE_MODULE can select its absolute module path.
const { PGlite } = require(process.env.PM_PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const db = new PGlite();
 const tenant='00000000-0000-4000-8000-000000000001';
 const stranger='00000000-0000-4000-8000-000000000002';
 const user='00000000-0000-4000-8000-000000000003';
 const profile='00000000-0000-4000-8000-000000000004';
 const results=[];
 try {
  await db.exec(`
   CREATE ROLE authenticated; CREATE ROLE anon;
   CREATE SCHEMA app; CREATE SCHEMA auth; CREATE SCHEMA catalog;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
   CREATE TABLE app.tenants(id uuid PRIMARY KEY);
   CREATE TABLE app.user_profiles(id uuid PRIMARY KEY, auth_user_id uuid);
   CREATE TABLE app.memberships(tenant_id uuid, user_profile_id uuid, status text);
   INSERT INTO app.tenants VALUES ('${tenant}'),('${stranger}');
   INSERT INTO app.user_profiles VALUES ('${profile}','${user}');
   INSERT INTO app.memberships VALUES ('${tenant}','${profile}','active');
  `);
  // Use the real table definitions, excluding unrelated recipe tables.
  const schema=fs.readFileSync('infra/sql/036_production_resources_and_recipes.sql','utf8').split('CREATE TABLE IF NOT EXISTS catalog.production_recipes')[0];
  await db.exec(schema);
  await db.exec(fs.readFileSync('infra/sql/058_operations_simplification.sql','utf8'));
  await db.exec(fs.readFileSync('infra/sql/060_machine_editor_rpc.sql','utf8'));
  await db.exec(fs.readFileSync('infra/sql/061_machine_editor_timing.sql','utf8'));
  await db.exec(fs.readFileSync('infra/sql/061_machine_editor_timing.sql','utf8'));
  results.push('060 + 061 execute; 061 is re-runnable');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.exec('SET ROLE authenticated');
  const values={name:'Printer',machineType:'printer',maxWidthMm:'1600',speedValue:'25',speedUom:'sqm_per_hour',hourlyCost:'20.25',setupMinutes:'7',inkCostPerSqm:'10',colourImpressionCost:'0.015',monoImpressionCost:'0.004',maxStackSheets:'300'};
  const call=async (name,args)=> (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
  const timing=result=> {
   for (const key of ['functionMs','authorizationMs','beforeWriteMs','writeMs']) assert.equal(typeof result._timing[key],'number');
   assert.ok(result._timing.functionMs>=result._timing.writeMs);
  };
  const created=await call('pm_create_machine',[tenant,values]);timing(created);
  await assert.rejects(call('pm_create_machine',[stranger,values]),/access to this workspace/);
  await assert.rejects(call('pm_update_machine',[tenant,created.id,{...values,name:''}]),/name is required/);
  await db.exec('RESET ROLE');
  await db.query(`UPDATE catalog.machines SET capabilities_json=capabilities_json || '{"customSetting":42}' WHERE id=$1`,[created.id]);
  await db.exec('SET ROLE authenticated');
  const updated=await call('pm_update_machine',[tenant,created.id,{...values,name:'Updated',hourlyCost:'35'}]);timing(updated);
  const duplicate=await call('pm_duplicate_machine',[tenant,created.id]);timing(duplicate);
  await db.exec('RESET ROLE');
  const original=(await db.query('SELECT * FROM catalog.machines WHERE id=$1',[created.id])).rows[0];
  const copy=(await db.query('SELECT * FROM catalog.machines WHERE id=$1',[duplicate.id])).rows[0];
  assert.equal(original.capabilities_json.customSetting,42);
  for(const key of ['machine_type','max_width_mm','speed_value','speed_uom','hourly_cost','setup_minutes','ink_cost_per_sqm','capabilities_json','active']) assert.deepEqual(copy[key],original[key]);
  assert.equal(copy.name,'Updated Copy');
  results.push('authenticated create/edit/duplicate retain all settings and return numeric phase timings');
  await db.query('INSERT INTO catalog.labour_operations(tenant_id,name,machine_id) VALUES ($1,$2,$3)',[tenant,'Print',created.id]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(call('pm_delete_machine',[tenant,created.id]),/Production Step/);
  const deleted=await call('pm_delete_machine',[tenant,duplicate.id]);timing(deleted);
  await assert.rejects(call('pm_update_machine',[tenant,duplicate.id,values]),/could not be found/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int n FROM catalog.machines WHERE id=$1',[duplicate.id])).rows[0].n,0);
  await db.exec('SET ROLE anon');
  await assert.rejects(call('pm_create_machine',[tenant,values]),/permission denied/);
  results.push('linked delete blocked; unlinked delete is permanent; missing row and tenant/anonymous denial preserved');
  console.log(JSON.stringify({environment:'PGlite PostgreSQL fixture, not live Supabase',results},null,2));
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
