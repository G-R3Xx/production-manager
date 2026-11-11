const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');

const source = fs.readFileSync(path.join(__dirname, '../../apps/web/src/app/(app)/quotes/QuoteLineLabelEditor.tsx'), 'utf8');
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  fileName: 'QuoteLineLabelEditor.tsx',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
});
assert.equal(diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error).length, 0, 'Label editor TSX must transpile');

// Minimal JSX/hook harness exercises the real click handlers without loading the Next.js application.
function createHarness(initialOverride = null) {
  const states = [];
  let hookIndex = 0;
  const react = {
    useState(initialValue) {
      const i = hookIndex++;
      if (!(i in states)) states[i] = initialValue;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useEffect() {}
  };
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: Symbol('Fragment') };
  const exports = {};
  new Function('require', 'exports', outputText)((id) => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return jsx;
    if (id === '@/lib/quote-line-label') return { QUOTE_LINE_TITLE_MAX_LENGTH: 200 };
    throw new Error(`Unexpected import ${id}`);
  }, exports);
  const props = {
    quoteId: '7a388e69-4eab-46f2-8fc0-1be22e1367fe',
    lineId: '1db71a2c-6368-483e-a900-f63ce4c509dd',
    productName: '2 Year Print White',
    initialOverride,
    canEdit: true,
  };
  return { render: () => { hookIndex = 0; return exports.QuoteLineLabelEditor(props); } };
}

function findAll(node, type, output = []) {
  if (node == null || typeof node === 'boolean') return output;
  if (Array.isArray(node)) { node.forEach(x => findAll(x, type, output)); return output; }
  if (typeof node !== 'object') return output;
  if (node.type === type) output.push(node);
  findAll(node.props?.children, type, output);
  return output;
}
function event() {
  return {
    defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}
function assertHandled(node, description) {
  const e = event();
  node.props.onClick(e);
  assert.equal(e.defaultPrevented, true, `${description} must cancel native summary toggle`);
  assert.equal(e.propagationStopped, true, `${description} must stop click propagation`);
}

const harness = createHarness('Existing display title');
const initial = harness.render();
const rename = findAll(initial, 'button').find(b => b.props.children === 'Rename');
assert.ok(rename, 'Rename control exists');
assertHandled(rename, 'Rename');
let editing = harness.render();
const editingRoot = findAll(editing, 'span').find(s => typeof s.props.onKeyDown === 'function' && typeof s.props.onClick === 'function');
assert.ok(editingRoot, 'Editing controls are within a click-shielded subtree');
assertHandled(editingRoot, 'Edit subtree (including clicking name input)');
assert.ok(findAll(editing, 'input').some(x => x.props['aria-label'] === 'Display name for 2 Year Print White'));
const buttons = findAll(editing, 'button');
assert.ok(buttons.some(b => b.props.children === 'Cancel'));
assert.ok(buttons.some(b => b.props.children === 'Reset'));
assert.ok(buttons.some(b => b.props.children === 'Save name'));
const cancel = buttons.find(b => b.props.children === 'Cancel');
assertHandled(cancel, 'Cancel');
assert.equal(findAll(harness.render(), 'button').some(b => b.props.children === 'Rename'), true, 'Cancel closes name editor');

const resetHarness = createHarness('Existing display title');
assertHandled(findAll(resetHarness.render(), 'button').find(b => b.props.children === 'Rename'), 'Rename for reset');
const resetButton = findAll(resetHarness.render(), 'button').find(b => b.props.children === 'Reset');
assert.ok(resetButton);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, title: null }) });
assertHandled(resetButton, 'Reset');
globalThis.fetch = originalFetch;

const saveHarness = createHarness();
assertHandled(findAll(saveHarness.render(), 'button').find(b => b.props.children === 'Rename'), 'Rename for save');
const saveButton = findAll(saveHarness.render(), 'button').find(b => b.props.children === 'Save name');
assert.ok(saveButton);
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, title: 'Left Hand & Right Hand Windows' }) });
assertHandled(saveButton, 'Save name');
globalThis.fetch = originalFetch;
assert.doesNotMatch(source, /router\.refresh\(\)/, 'Rename must stay inline and not revalidate page');
console.log('PASS: Rename, Save name, Cancel, Reset and editable input clicks cannot toggle full quote-line editor');
