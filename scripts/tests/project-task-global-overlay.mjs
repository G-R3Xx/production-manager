import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const form = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/ProjectTaskForm.tsx', 'utf8');
const overlay = fs.readFileSync('apps/web/src/components/RouteTransitionOverlay.tsx', 'utf8');

function registerOverlay() {
  const documentHandlers = new Map();
  const windowHandlers = new Map();
  const timers = new Map();
  const states = [];
  let nextTimerId = 0;
  const react = {
    useState: initial => [initial, update => states.push(update)],
    useRef: initial => ({ current: initial }),
    useMemo: fn => fn(),
    useEffect: fn => { fn(); }
  };
  const stub = { jsx: () => null, jsxs: () => null };
  const context = {
    exports: {},
    require: key => {
      if (key === 'react') return react;
      if (key === 'next/navigation') return {usePathname:()=>'/projects/task', useSearchParams:()=>({toString:()=>''})};
      if (key === 'react/jsx-runtime') return stub;
      throw Error(`Unexpected import: ${key}`);
    },
    window: {addEventListener:(key,fn)=>windowHandlers.set(key,fn), removeEventListener:()=>{}},
    document: {addEventListener:(key,fn)=>documentHandlers.set(key,fn), removeEventListener:()=>{}},
    setTimeout: (fn,delay) => { const id = ++nextTimerId; timers.set(id,{fn,delay}); return id; },
    clearTimeout: id => timers.delete(id),
    URL,
  };
  const source = ts.transpileModule(overlay,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source, context);
  context.exports.RouteTransitionOverlay();
  assert.ok(documentHandlers.has('submit'), 'global loader must listen for form submissions');
  return { submit: documentHandlers.get('submit'), timers, windowHandlers, states };
}

test('inline Gantt task forms opt out of the global 18-second overlay', () => {
  assert.match(form, /<form\s+ref=\{formRef\}\s+data-no-global-loader="true"\s+onSubmit=\{submit\}/);
  assert.match(form, /await saveProjectTaskInlineAction\(form\)/);
  assert.doesNotMatch(form, /router\.refresh\(/);
  const result = registerOverlay();
  result.submit({target:{dataset:{noGlobalLoader:'true'}}});
  assert.equal(result.timers.size,0,'inline Gantt saves should never start the global overlay timers');
});

test('ordinary navigation forms still use the global loader', () => {
  const result = registerOverlay();
  result.submit({target:{dataset:{}}});
  const durations = [...result.timers.values()].map(t=>t.delay).sort((a,b)=>a-b);
  assert.deepEqual(durations,[0,18000]);
  result.windowHandlers.get('pm:loading-done')();
  assert.equal(result.timers.size,0);
});
