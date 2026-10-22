// Integration regression: actual Staff service/action + domain sign-in against an
// isolated PostgreSQL fixture. No live credentials or production writes.
// From repo root: PM_PGLITE_MODULE=/path/to/@electric-sql/pglite node scripts/tests/staff-profile.cjs
const {PGlite}=require(process.env.PM_PGLITE_MODULE || '@electric-sql/pglite');
const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('drizzle-kit')]}));
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const assert=require('node:assert/strict');
(async()=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'pm-staff-test-'));
 const db=new PGlite();const results=[];
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const tenant=id(1), otherTenant=id(2), owner=id(3), staff=id(4), manager=id(5), outsider=id(6);
 const ownerMembership=id(13), staffMembership=id(14), managerMembership=id(15), outsiderMembership=id(16);
 process.env.DATABASE_URL='isolated-fixture';
 global.__staffTestContext={tenantId:tenant,userProfileId:owner,tenantRole:'owner',membershipStatus:'active',tenantName:'Test Workspace'};
 global.__staffRevalidated=[];
 const query=async(text,params)=>{
  if(!params && text.split(';').filter(s=>s.trim()).length>1){const r=await db.exec(text);return r.at(-1);}
  return db.query(text,params);
 };
 global.__staffTestPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE SCHEMA app;
   CREATE TYPE tenant_role AS ENUM ('owner','manager','staff','sales','installer','accounts');
   CREATE TYPE membership_status AS ENUM ('active','invited','disabled');
   CREATE TABLE app.tenants(id uuid PRIMARY KEY,name text,slug text,status text,created_at timestamptz DEFAULT now());
   CREATE TABLE app.tenant_settings(tenant_id uuid,trading_name text,company_legal_name text,email text);
   CREATE TABLE app.user_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),auth_user_id uuid UNIQUE,full_name varchar(200) NOT NULL,short_name varchar(50) NOT NULL,email text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
   CREATE TABLE app.memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid REFERENCES app.tenants(id),user_profile_id uuid REFERENCES app.user_profiles(id),tenant_role tenant_role,status membership_status,quote_labour_rate numeric(10,2),quote_entry_layout varchar(20) DEFAULT 'list',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
   CREATE TABLE app.test_assignment(assignee uuid REFERENCES app.user_profiles(id));
   INSERT INTO app.tenants VALUES ('${tenant}','Test Workspace','test-workspace','active',now()),('${otherTenant}','Other','other','active',now());
   INSERT INTO app.user_profiles(id,auth_user_id,full_name,short_name,email) VALUES
    ('${owner}','${id(23)}','glen@example.test','glen@example.test','glen@example.test'),
    ('${staff}','${id(24)}','Staff Original','Staff','staff@example.test'),
    ('${manager}','${id(25)}','Manager','Manager','manager@example.test'),
    ('${outsider}','${id(26)}','Outsider','Outsider','outsider@other.test');
   INSERT INTO app.memberships(id,tenant_id,user_profile_id,tenant_role,status) VALUES
    ('${ownerMembership}','${tenant}','${owner}','owner','active'),
    ('${staffMembership}','${tenant}','${staff}','staff','active'),
    ('${managerMembership}','${tenant}','${manager}','manager','active'),
    ('${outsiderMembership}','${otherTenant}','${outsider}','owner','active');
   INSERT INTO app.test_assignment VALUES ('${owner}');`);
  const root=process.cwd();
  await esbuild.build({stdin:{contents:`export * from './apps/web/src/server/users'; export * from './apps/web/src/server/auth/domainJoin'; export * from './apps/web/src/app/(app)/users/actions'; export {default as UsersPage} from './apps/web/src/app/(app)/users/page'; export {renderToStaticMarkup} from 'react-dom/server';`,resolveDir:root,loader:'ts'},outfile:path.join(temporary,'app.cjs'),platform:'node',format:'cjs',bundle:true,jsx:'automatic',nodePaths:[path.join(root,'apps/web/node_modules')],plugins:[{name:'fixture-boundaries',setup(build){
   const stubs={
    'server-only':'',
    '@production-manager/db':'export const pool=global.__staffTestPool;',
    '@/server/schema-readiness':'export const relationHasColumns=async()=>true;',
    '@/server/auth/session':`export const getRequiredSessionUser=async()=>({id:${JSON.stringify(id(23))}});`,
    '@/server/bootstrap/activeTenant':'export const resolveActiveTenantForAuthUserId=async()=>global.__staffTestContext;',
    'next/cache':'export const revalidatePath=(...args)=>global.__staffRevalidated.push(args);',
    'next/navigation':'export function redirect(url){throw Object.assign(new Error(url),{redirect:url})}',
   };
   build.onResolve({filter:/.*/},args=>Object.hasOwn(stubs,args.path)?{path:args.path,namespace:'fixture'}:null);
   build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path]}));
  }}]});
  const app=require(path.join(temporary,'app.cjs'));
  const originalInput={tenantId:tenant,membershipId:ownerMembership,requesterUserProfileId:owner,requesterTenantRole:'owner',tenantRole:'owner',membershipStatus:'active',fullName:' Glen Cloake ',shortName:' Glen ',quoteLabourRate:'55',quoteEntryLayout:'catalogue'};
  // Exercise actual server action so FormData wiring/validation and cache invalidation are included.
  const form=new FormData();for(const [k,v] of Object.entries(originalInput))form.set(k,v);
  await assert.rejects(app.updateStaffMemberAction(form),e=>e.redirect==='/users?message=Staff%20member%20updated');
  let row=(await query('SELECT * FROM app.user_profiles WHERE id=$1',[owner])).rows[0];
  assert.equal(row.full_name,'Glen Cloake');assert.equal(row.short_name,'Glen');assert.equal(row.email,'glen@example.test');
  assert.equal((await query('SELECT assignee FROM app.test_assignment')).rows[0].assignee,owner);
  assert.deepEqual(global.__staffRevalidated,[['/','layout']]);
  results.push('Staff action persists trimmed full/short name, preserves identity/email/assignment and invalidates name displays');
  const staffInput={...originalInput,membershipId:staffMembership,tenantRole:'staff',fullName:'New Staff',shortName:'New'};
  await assert.rejects(app.updateTenantUserMembershipByAdmin({...staffInput,shortName:'  '}),/Short name is required/);
  await assert.rejects(app.updateTenantUserMembershipByAdmin({...staffInput,shortName:'x'.repeat(51)}),/50 characters/);
  await assert.rejects(app.updateTenantUserMembershipByAdmin({...staffInput,shortName:'new@example.test'}),/rather than an email/);
  await assert.rejects(app.updateTenantUserMembershipByAdmin({...staffInput,requesterTenantRole:'staff',requesterUserProfileId:staff}),/Only owners and managers/);
  await assert.rejects(app.updateTenantUserMembershipByAdmin({...originalInput,membershipId:outsiderMembership}),/not found in this workspace/);
  await assert.rejects(app.updateTenantUserMembershipByAdmin({...originalInput,requesterTenantRole:'manager',requesterUserProfileId:manager}),/Only an owner can edit/);
  await app.updateTenantUserMembershipByAdmin({...staffInput,requesterTenantRole:'manager',requesterUserProfileId:manager});
  results.push('Blank/long/email short names rejected; staff and cross-tenant writes denied; manager cannot edit owner but can edit staff');
  // Prove failed profile write rolls back the preceding membership update.
  await db.exec(`ALTER TABLE app.user_profiles ADD CONSTRAINT test_reject CHECK(short_name <> 'Reject');`);
  await assert.rejects(app.updateTenantUserMembershipByAdmin({...staffInput,shortName:'Reject',quoteLabourRate:'99'}),/test_reject/);
  assert.equal((await query('SELECT quote_labour_rate FROM app.memberships WHERE id=$1',[staffMembership])).rows[0].quote_labour_rate,'55.00');
  results.push('Failed profile write rolls back membership changes atomically');
  await app.ensureTenantDomainAccessTable();
  await query(`INSERT INTO app.tenant_domain_access(tenant_id,email_domain,default_role) VALUES ($1,'example.test','staff')`,[tenant]);
  const existing=await app.ensureDomainAutoJoinForAuthUser({authUserId:id(23),email:'glen@example.test',fullName:'Old Google Name'});
  assert.equal(existing.status,'already_member');
  row=(await query('SELECT * FROM app.user_profiles WHERE id=$1',[owner])).rows[0];
  assert.equal(row.full_name,'Glen Cloake');assert.equal(row.short_name,'Glen');
  const joined=await app.ensureDomainAutoJoinForAuthUser({authUserId:id(99),email:'new.person@example.test',fullName:'new.person@example.test'});
  assert.equal(joined.status,'joined');
  row=(await query('SELECT * FROM app.user_profiles WHERE auth_user_id=$1',[id(99)])).rows[0];
  assert.equal(row.full_name,'New Person');assert.equal(row.short_name,'New');
  results.push('Subsequent domain sign-in preserves edited names; email-valued provider names do not create email short names');
  const html=app.renderToStaticMarkup(await app.UsersPage({}));
  const {chromium}=require('playwright');let launch={headless:true};
  if(process.env.PM_CHROMIUM_MODULE){const pkg=require(process.env.PM_CHROMIUM_MODULE);launch={...launch,executablePath:await pkg.executablePath(),args:pkg.args};}
  const browser=await chromium.launch(launch);
  try {
   const page=await browser.newPage({viewport:{width:1440,height:1100}});await page.setContent(html);
   const ownRow=page.locator('tr').filter({has:page.locator(`input[value="${ownerMembership}"]`)});
   await ownRow.getByLabel('Full name',{exact:true}).fill('Glen Cloake');
   await ownRow.getByLabel('Short name',{exact:true}).fill('Glen');
   const payload=await ownRow.getByRole('button',{name:'Save',exact:true}).evaluate(button=>Object.fromEntries(new FormData(button.form)));
   assert.equal(payload.fullName,'Glen Cloake');assert.equal(payload.shortName,'Glen');assert.equal(payload.membershipId,ownerMembership);
   assert.equal(payload.tenantRole,'owner');assert.equal(payload.quoteEntryLayout,'catalogue');
   global.__staffTestContext={...global.__staffTestContext,userProfileId:staff,tenantRole:'staff'};
   await page.setContent(app.renderToStaticMarkup(await app.UsersPage({})));
   assert.equal(await page.locator('input[name=fullName],input[name=shortName]').count(),0);
   results.push('Rendered Staff page: external name inputs belong to the correct row Save form; non-admin view remains read-only');
  } finally {await browser.close();}
  console.log(JSON.stringify({environment:'Local PGlite + Chromium; mocked auth context/cache boundary; no live database',results},null,2));
 } finally {await db.close();await fs.rm(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
