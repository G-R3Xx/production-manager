const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const componentPath = 'apps/web/src/app/(app)/quotes/QuoteLineLabelEditor.tsx';
const pagePath = 'apps/web/src/app/(app)/quotes/page.tsx';
const source = read(componentPath);
const page = read(pagePath);

for (const [filename, code] of [[componentPath, source], [pagePath, page]]) {
  const { diagnostics = [] } = ts.transpileModule(code, {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  });
  assert.equal(diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error).length, 0, `${filename} must transpile`);
}

// This is the actual fix: interactive label controls cannot be descendants of
// native <summary>, where Space and Enter may trigger <details> activation.
const tree = ts.createSourceFile(pagePath, page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let count = 0;
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'QuoteLineLabelEditor') {
    count++;
    let parent = node.parent;
    let insideSummary = false;
    let insideDetails = false;
    while (parent) {
      if (ts.isJsxElement(parent)) {
        const tag = parent.openingElement.tagName.getText(tree);
        if (tag === 'summary') insideSummary = true;
        if (tag === 'details') insideDetails = true;
      }
      parent = parent.parent;
    }
    assert.equal(insideSummary, false, 'The Rename input must NOT be inside the summary toggle');
    assert.equal(insideDetails, false, 'The Rename input must NOT be inside the details element');
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(count, 1, 'Quote line title editor must be rendered once per quote line');
assert.match(page, /<details\s+id=\{`quote-line-\$\{line\.id\}`\}/, 'Full View / edit stays independently expandable');

// Test each keystroke, including spaces, to ensure the inline input remains
// mounted and reflects the user's draft without changing the editor mode.
const out = ts.transpileModule(source, { fileName: componentPath, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
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
const moduleExports = {};
new Function('require', 'exports', out)(id => {
  if (id === 'react') return react;
  if (id === 'react/jsx-runtime') return jsx;
  if (id === '@/lib/quote-line-label') return { QUOTE_LINE_TITLE_MAX_LENGTH: 200 };
  throw new Error(`Unexpected import ${id}`);
}, moduleExports);
const props = {
  quoteId: '7a388e69-4eab-46f2-8fc0-1be22e1367fe',
  lineId: '1db71a2c-6368-483e-a900-f63ce4c509dd',
  productName: '2 Year Print White', initialOverride: null, canEdit: true
};
const render = () => { hookIndex = 0; return moduleExports.QuoteLineLabelEditor(props); };
function find(node, type) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(x => find(x, type)).find(Boolean);
  if (node.type === type) return node;
  return find(node.props?.children, type);
}
const click = { preventDefault() {}, stopPropagation() {} };
const rename = find(render(), 'button');
assert.equal(rename.props.children, 'Rename');
rename.props.onClick(click);
let typed = '';
const desired = 'Left Hand & Right Hand Windows';
for (const letter of desired) {
  typed += letter;
  const input = find(render(), 'input');
  assert.ok(input, `Input stays visible while typing ${JSON.stringify(typed)}`);
  input.props.onChange({ target: { value: typed } });
  assert.equal(find(render(), 'input').props.value, typed);
}
const input = find(render(), 'input');
assert.ok(input.props.autoFocus, 'Name input is focusable');
assert.doesNotMatch(source, /onClick=\{\(event\) => \{\s*\/\/ This editor lives inside a native <summary>/);
assert.doesNotMatch(source, /router\.refresh\(\)/, 'Rename does not refresh the page');
console.log('PASS: Rename is outside native <summary>/<details>, typing spaces keeps input mounted, View / edit remains separate');
