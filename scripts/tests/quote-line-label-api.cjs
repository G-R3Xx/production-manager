const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const file = 'apps/web/src/app/api/quotes/line/title/route.ts';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const emitted = ts.transpileModule(source, {
  fileName: file,
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
assert.equal((emitted.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
let user = { id: 'staff-1' };
let tenant = { tenantId: 'workspace-1' };
let saveResult = 'Left Hand & Right Hand Windows';
const saves = [];
const dependencies = {
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/server/auth/session': { getSessionUser: async () => user },
  '@/server/bootstrap/activeTenant': { resolveActiveTenantForAuthUserId: async () => tenant },
  '@/server/quotes': { updateQuoteLineTitleOverrideForTenant: async (...args) => { saves.push(args); return saveResult; } },
  '@/lib/quote-line-label': { QUOTE_LINE_TITLE_MAX_LENGTH: 200 }
};
const routeExports = {};
new Function('exports', 'require', emitted.outputText)(routeExports, name => {
  assert.ok(name in dependencies, `Unexpected dependency ${name}`);
  return dependencies[name];
});
const quoteId = 'dc8b0b17-fbbc-4450-b16d-8293ee96ba0b';
const lineId = '09c2e36a-a751-43ca-9845-785fc373aeed';
function makeRequest(payload, headers = {}) {
  return new Request('https://pm.example/api/quotes/line/title', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload)
  });
}
async function post(payload, headers) {
  const response = await routeExports.POST(makeRequest(payload, headers));
  return { status: response.status, body: await response.json() };
}
(async () => {
  let result = await post({ quoteId, lineId, title: 'Left Hand & Right Hand Windows' });
  assert.equal(result.status, 200, `Canonical PostgreSQL UUID must pass: ${JSON.stringify(result.body)}`);
  assert.deepEqual(saves.pop(), ['workspace-1', quoteId, lineId, 'Left Hand & Right Hand Windows']);
  assert.deepEqual(result.body, {ok:true,title:saveResult});

  saveResult = null;
  result = await post({ quoteId, lineId, title: '  ' });
  assert.equal(result.status, 200, 'Empty title resets override');
  assert.deepEqual(saves.pop(), ['workspace-1', quoteId, lineId, null]);
  assert.equal(result.body.title, null);

  const beforeInvalid = saves.length;
  for (const malformed of [
    { quoteId: 'not-an-id', lineId, title: 'Valid title' },
    { quoteId, lineId: lineId.replace(/-/g, ''), title: 'Valid title' },
    { quoteId, lineId, title: 123 }
  ]) {
    result = await post(malformed);
    assert.equal(result.status, 400, 'Invalid input must be rejected');
  }
  assert.equal(saves.length, beforeInvalid, 'Invalid request cannot access database');
  result = await post({quoteId, lineId, title:'One\nTwo'});
  assert.equal(result.status, 400, 'Multiline labels are rejected');
  result = await post({quoteId, lineId, title:'x'.repeat(201)});
  assert.equal(result.status, 400, 'Overlong labels are rejected');

  result = await post({quoteId, lineId, title:'Safe'}, {'sec-fetch-site':'cross-site'});
  assert.equal(result.status, 403, 'Cross-site request is blocked');
  user = null;
  result = await post({quoteId, lineId, title:'Safe'});
  assert.equal(result.status, 401);
  user = {id: 'staff-1'};
  tenant = null;
  result = await post({quoteId, lineId, title:'Safe'});
  assert.equal(result.status, 403);
  tenant = {tenantId: 'workspace-1'};
  saveResult = undefined;
  result = await post({quoteId, lineId, title:'Safe'});
  assert.equal(result.status, 409, 'Missing, deleted, or accepted quote rejects rename');

  console.log('PASS: quote label endpoint accepts canonical UUIDs, persists and resets labels, rejects invalid inputs and enforces auth/quote guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
