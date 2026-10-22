// Browser regression using the real React machine forms and global loader.
// Supabase transport and Next router are explicit test doubles; no live data is used.
// Run from repository root with Playwright installed in your test environment.
// Optional PM_BASELINE_DIR points at extracted V26.10.22.03 machine components.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('drizzle-kit')] }));
const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), 'pm-machine-test-'));
const current = path.join(root, 'apps/web/src/app/(app)/machines');
const reactPath = path.join(root, 'apps/web/node_modules');
const results = [];
let browser;
let rpcDelay = 100;
let rpcError = null;
let requests = [];
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/rest/v1/rpc/')) {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ name: req.url.split('/').at(-1), values: JSON.parse(body) });
    await new Promise(r => setTimeout(r, rpcDelay));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(rpcError ? { data: null, error: { message: rpcError } } : {
      data: { id: 'fixture', name: 'Test machine', _timing: { functionMs: 3, authorizationMs: 1, beforeWriteMs: 0, writeMs: 2 } }, error: null,
    }));
    return;
  }
  if (req.url.startsWith('/bundle-')) {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(await readFile(path.join(temporary, req.url.split('?')[0].slice(1)))); return;
  }
  const mode = new URL(req.url, 'http://localhost').searchParams.get('mode') || 'fixed';
  res.setHeader('Content-Type', 'text/html');
  res.end(`<div id="root"></div><script src="/bundle-${mode}.js"></script>`);
});
try {
  for (const [mode, directory] of [['fixed', current], ...(process.env.PM_BASELINE_DIR ? [['baseline', process.env.PM_BASELINE_DIR]] : [])]) {
    const entry = `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {MachineEditForm} from ${JSON.stringify(directory+'/MachineEditForm.tsx')};
      import {MachineCreateForm} from ${JSON.stringify(directory+'/MachineCreateForm.tsx')};
      import {MachineActions} from ${JSON.stringify(directory+'/MachineActions.tsx')};
      import {RouteTransitionOverlay} from ${JSON.stringify(root+'/apps/web/src/components/RouteTransitionOverlay.tsx')};
      window.refreshes=0;
      const params=new URLSearchParams(location.search);
      const creating=params.get('create')==='1';
      const fields=<><label>Name<input name="name" defaultValue="Original" /></label><input name="hourlyCost" defaultValue="10" /></>;
      createRoot(document.getElementById('root')).render(<><RouteTransitionOverlay />
      {creating ? <MachineCreateForm tenantId="tenant">{fields}</MachineCreateForm> :
      <article data-machine-card-id="fixture">
        <h3 data-machine-field="name">Original</h3><span data-machine-field="equipment">$10/hr</span>
        <MachineEditForm machineId="fixture" tenantId="tenant">{fields}</MachineEditForm>
        <MachineActions machineId="fixture" tenantId="tenant" machineName="Original" />
      </article>}
      <form id="ordinary" onSubmit={e=>e.preventDefault()}><button>Ordinary submit</button></form>
      </>);
    `;
    await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, outfile: path.join(temporary, `bundle-${mode}.js`), bundle: true, jsx: 'automatic', nodePaths: [reactPath], define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'test-boundaries', setup(build) {
      build.onResolve({filter:/^next\/navigation$/}, () => ({path:'navigation',namespace:'fixture'}));
      build.onResolve({filter:/^@\/lib\/supabase\/browser$/}, () => ({path:'supabase',namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'}, args => ({contents: args.path==='navigation' ? `
        const params=new URLSearchParams(location.search);
        export const usePathname=()=>'/machines'; export const useSearchParams=()=>params;
        export const useRouter=()=>({refresh(){window.refreshes++;}});
      ` : `export function getSupabaseBrowserClient(){return {async rpc(name,values){return await (await fetch('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(values)})).json();}};}` }));
    }}] });
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let launch = {headless:true};
  if (process.env.PM_CHROMIUM_MODULE) {
    const packaged = require(process.env.PM_CHROMIUM_MODULE);
    launch = {...launch, executablePath: await packaged.executablePath(), args:packaged.args};
  }
  browser = await chromium.launch(launch);
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const open = async (query='') => {
    rpcDelay=100;rpcError=null;requests=[];
    await page.goto(base+'/?machineTiming=1'+query);
    await page.waitForSelector('form', {state:'attached'});
    await page.evaluate(()=>document.addEventListener('submit',()=>{window.submitted=performance.now()},true));
  };
  const edit = async () => {
    await page.getByText('Edit',{exact:true}).click();
    await page.locator('input[name=name]').fill('Changed');
    await page.getByRole('button',{name:'Save changes'}).click();
  };
  if (process.env.PM_BASELINE_DIR) {
    await open('&mode=baseline');
    const started=Date.now(); await edit();
    await page.waitForSelector('[aria-label=Loading]');
    await page.waitForFunction(()=>document.body.textContent.includes('Changed saved'));
    assert.equal(await page.locator('details').getAttribute('open'),null);
    assert.equal(await page.locator('[aria-label=Loading]').count(),1,'old overlay still blocks after RPC and modal close');
    await page.waitForSelector('[aria-label=Loading]',{state:'detached',timeout:21000});
    results.push({case:'baseline: overlay outlives successful save', blockingElapsedMs:await page.evaluate(()=>performance.now()-window.submitted), rpcNetworkMs:await page.evaluate(()=>performance.getEntriesByType("resource").find(r=>r.name.includes("/rest/v1/rpc/")).duration)});
  }
  await open(); rpcDelay=1500; await edit();
  assert.equal(await page.locator('[aria-label=Loading]').count(),0);
  assert.equal(await page.locator('details').getAttribute('open'),null);
  assert.equal(await page.locator('[data-machine-field=name]').innerText(),'Changed');
  await page.getByText('Edit',{exact:true}).click();
  assert.equal(await page.locator('details').getAttribute('open'),null,'cannot reopen while saving');
  await page.waitForFunction(()=>window.__pmMachineTimings?.length);
  const trace=await page.evaluate(()=>window.__pmMachineTimings.at(-1));
  assert.equal(trace.outcome,'success'); assert.ok(trace.marksMs.modalClosed<300);
  assert.ok(trace.rpcDurationMs>=1500); assert.ok(trace.marksMs.pendingReactCommit<trace.marksMs.rpcResolved);
  assert.equal(trace.database.functionMs,3); assert.equal(trace.network.length,1);
  assert.equal(await page.evaluate(()=>window.refreshes),0);
  assert.equal(requests.length,1);
  results.push({case:'fixed: immediate edit UI with slow simulated RPC',trace});
  await open();rpcError='Permission denied';await edit();
  await page.waitForFunction(()=>window.__pmMachineTimings?.length);
  assert.equal(await page.locator('[data-machine-field=name]').innerText(),'Original');
  assert.notEqual(await page.locator('details').getAttribute('open'),null);
  assert.equal(await page.locator('input[name=name]').inputValue(),'Changed');
  assert.ok(await page.getByText('Permission denied',{exact:true}).isVisible());
  assert.equal(await page.locator('[aria-label=Loading]').count(),0);
  results.push({case:'failed edit: card restored, values retained, editor reopened',passed:true});
  await open();await page.getByText('Edit',{exact:true}).click();await page.locator('input[name=name]').fill('');
  await page.getByRole('button',{name:'Save changes'}).click();
  await page.waitForFunction(()=>window.__pmMachineTimings?.length);
  assert.equal(requests.length,0);assert.ok(await page.getByText('Machine name is required.',{exact:true}).isVisible());
  results.push({case:'empty name: no RPC or global overlay',passed:true});
  await open('&create=1');await page.locator('input[name=name]').fill('Created');await page.getByRole('button',{name:'Add equipment'}).click();
  await page.waitForFunction(()=>window.__pmMachineTimings?.length);
  assert.equal(await page.locator('[aria-label=Loading]').count(),0);assert.equal(await page.evaluate(()=>window.refreshes),1);
  assert.equal(requests[0].name,'pm_create_machine');
  results.push({case:'create: local feedback, reset and refresh requested',passed:true});
  await open();await page.getByRole('button',{name:'Duplicate',exact:true}).click();await page.waitForFunction(()=>window.__pmMachineTimings?.length);
  assert.equal(requests[0].name,'pm_duplicate_machine');assert.equal(await page.evaluate(()=>window.refreshes),1);
  results.push({case:'duplicate: RPC and refresh requested',passed:true});
  await open();rpcError='This machine is used by Production Step(s): Print. Change those steps first.';
  await page.getByRole('button',{name:'Delete',exact:true}).click();await page.waitForFunction(()=>window.__pmMachineTimings?.length);
  assert.ok(await page.locator('article').isVisible());assert.ok(await page.getByText(rpcError,{exact:true}).isVisible());
  results.push({case:'linked delete error: card restored and error visible',passed:true});
  await open();await page.getByRole('button',{name:'Delete',exact:true}).click();await page.waitForFunction(()=>window.__pmMachineTimings?.length);
  assert.ok(!(await page.locator('article').isVisible()));assert.equal(requests[0].name,'pm_delete_machine');
  results.push({case:'successful delete: hidden without refresh',passed:true});
  await open();await page.getByRole('button',{name:'Ordinary submit'}).click();await page.waitForSelector('[aria-label=Loading]');
  results.push({case:'ordinary forms retain global loading overlay',passed:true});
  assert.deepEqual(errors,[]);
  const output=JSON.stringify({environment:'Local Chromium / React dev; simulated Supabase and router, not live infrastructure',results},null,2);
  console.log(output);
  if(process.env.PM_TEST_OUTPUT) await writeFile(process.env.PM_TEST_OUTPUT, output+'\n');
} finally {
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true});
}
