const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const base = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const quotes = read('apps/web/src/server/quotes.ts');
const page = read('apps/web/src/app/(app)/quotes/page.tsx');
const actions = read('apps/web/src/app/(app)/quotes/actions.ts');
const toJS = (code, fileName) => {
  const result = ts.transpileModule(code, {fileName, reportDiagnostics:true, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
  const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  return result.outputText;
};
for (const [file,source] of [ ['page.tsx',page], ['actions.ts',actions], ['quotes.ts',quotes] ]) toJS(source,file);
assert.match(page, /id="quote-client-recovery"/);
assert.match(page, /action=\{recoverAcceptedQuoteClientAction\}/);
assert.match(page, /name="customerId" required/);
assert.match(page, /name="confirmClient" value="1" required/);
assert.match(page, /label="Link & create MYOB Order"/);
assert.match(page, /acceptedClientLinkConfirmed/);
assert.match(page, /myobOrderPayloadJson\?\.linkedCustomerId === linkedClient\?\.id/);
assert.match(actions, /Only an Owner or Manager can repair an accepted quote/);
assert.match(actions, /await recoverAcceptedQuoteCustomerLinkForTenant/);
assert.match(actions, /if \(sendNow\) orderResult = await pushAcceptedQuoteToMyobOrderForTenant/);
const start=quotes.indexOf('export async function recoverAcceptedQuoteCustomerLinkForTenant(');
const end=quotes.indexOf('\nexport async function addQuoteLine(',start);
assert.ok(start>=0 && end>start);
const fnSource=quotes.slice(start,end);
const fnCode=toJS(fnSource, 'recovery.ts');
async function scenario(status, customerFound = true) {
  const queries=[];
  let committed=false; let rolledBack=false;
  const conn={
    async query(sql, params) {
      queries.push({sql,params});
      if (sql==='COMMIT') {committed=true; return {rows:[],rowCount:0};}
      if (sql==='ROLLBACK') {rolledBack=true; return {rows:[],rowCount:0};}
      if (sql.includes('FROM sales.quote_drafts') && sql.includes('FOR UPDATE')) return {rows:[{status:status.status,myobOrderUid:status.uid||null,myobOrderStatus:status.myobStatus||'error',updatedAt:status.updatedAt||new Date().toISOString(),enquiryId:'enquiry1',surveyRequestId:'survey1'}],rowCount:1};
      if (sql.includes('SELECT id FROM app.customers')) return {rows:customerFound?[{id:'client1'}]:[],rowCount:customerFound?1:0};
      return {rows:[],rowCount:1};
    },
    release(){queries.push({sql:'RELEASE'});}
  };
  const obj={exports:{}};
  new Function('module','exports','pool',fnCode)(obj,obj.exports,{connect: async()=>conn});
  let thrown=null;
  try{await obj.exports.recoverAcceptedQuoteCustomerLinkForTenant('tenant1','quote1','client1');}catch(error){thrown=error;}
  return {queries,committed,rolledBack,thrown};
}
(async()=>{
  const ok=await scenario({status:'accepted'});
  assert.equal(ok.thrown,null); assert.equal(ok.committed,true); assert.equal(ok.rolledBack,false);
  assert.ok(ok.queries.some(q=>q.sql.includes('UPDATE sales.quote_drafts SET')&&q.sql.includes('linked_customer_id=$3::uuid')));
  assert.ok(ok.queries.some(q=>q.sql.includes('UPDATE production.production_jobs')));
  assert.ok(ok.queries.some(q=>q.sql.includes('UPDATE app.jobs')));
  assert.ok(!ok.queries.some(q=>q.sql.includes('client_name=')), 'Historic accepted client display must not be rewritten');
  const wrong=await scenario({status:'accepted'},false);
  assert.match(wrong.thrown.message,/no longer active/);assert.ok(wrong.rolledBack);assert.ok(!wrong.committed);
  const synced=await scenario({status:'accepted',myobStatus:'synced',uid:'order1'});
  assert.match(synced.thrown.message,/already has a MYOB Order/);assert.ok(synced.rolledBack);assert.ok(!synced.committed);
  const pending=await scenario({status:'accepted',myobStatus:'syncing'});
  assert.match(pending.thrown.message,/in progress/);assert.ok(pending.rolledBack);
  const notAccepted=await scenario({status:'draft'});
  assert.match(notAccepted.thrown.message,/Only accepted/);assert.ok(notAccepted.rolledBack);
  console.log('PASS: Accepted quote client recovery UI, typescript syntax, transaction linkage, and rejects invalid/duplicate MYOB operations.');
})().catch(e=>{console.error(e);process.exitCode=1;});
