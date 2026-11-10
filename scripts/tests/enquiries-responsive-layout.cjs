const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../apps/web/src/app/(app)/enquiries/page.tsx'), 'utf8');
const formSource = fs.readFileSync(path.join(__dirname, '../../apps/web/src/app/(app)/enquiries/NewEnquiryForm.tsx'), 'utf8');

assert.match(source, /className="enquiries-layout-container"/, 'layout must use a content-width container');
assert.match(source, /container-type:\s*inline-size/, 'responsive breakpoint must follow usable width');
assert.match(source, /\.enquiries-columns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*420px\)\s+minmax\(0,\s*1fr\)/, 'desktop layout should have two columns');
assert.match(source, /\.enquiries-columns\s*>\s*form\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/, 'new enquiry must remain on the left');
assert.match(source, /\.enquiries-columns\s*>\s*\.enquiries-list\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/, 'current enquiries must remain beside the form');
assert.match(source, /@container\s*\(max-width:\s*820px\)/, 'must stack on narrow content widths');
assert.match(source, /\.enquiries-columns\s*>\s*\.enquiries-list\s*\{\s*grid-column:\s*1;\s*grid-row:\s*2;/, 'current enquiries should stack below on narrow screens');
assert.ok(source.includes('<NewEnquiryForm clients={clients.filter((client) => client.isActive)} />\n\n          <section className="enquiries-list"'), 'panels should be adjacent children of the grid');
assert.match(formSource, /return\s*\(\s*<form\b/, 'NewEnquiryForm should be a direct form child of the grid');
console.log('PASS: enquiries responsive two-column source checks');
