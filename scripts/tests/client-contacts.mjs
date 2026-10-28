import assert from "node:assert/strict";
import { clientContactsForCustomer, selectedClientContact, validateClientContacts } from "../../apps/web/src/lib/client-contacts.ts";

const legacy = { firstName: "Pat", lastName: "Taylor", email: "pat@company.com", phone: "0400 000 000", payloadJson: {} };
const original = clientContactsForCustomer(legacy);
assert.equal(original.length, 1);
assert.deepEqual(original[0], { id: "legacy-primary", name: "Pat Taylor", email: "pat@company.com", phone: "0400 000 000", isPrimary: true });
const client = { ...legacy, payloadJson: { contacts: [
  { id: "a", name: "Alex Accounts", email: "alex@company.com", phone: "111", isPrimary: false },
  { id: "b", name: "Sam Purchasing", email: "sam@company.com", phone: "222", isPrimary: true }
] } };
assert.equal(clientContactsForCustomer(client).length, 2);
assert.equal(selectedClientContact(client, "b")?.email, "sam@company.com");
assert.equal(selectedClientContact(client, "not-company-contact"), null);
assert.equal(selectedClientContact({ ...legacy, payloadJson: { contacts: [] } }, "legacy-primary"), null);
assert.deepEqual(clientContactsForCustomer({ ...legacy, payloadJson: { contacts: [] } }), []);
assert.equal(clientContactsForCustomer({ ...legacy, payloadJson: null })[0]?.name, "Pat Taylor");
assert.equal(clientContactsForCustomer({ ...legacy, payloadJson: ["unexpected"] })[0]?.name, "Pat Taylor");
assert.equal(clientContactsForCustomer({ ...legacy, payloadJson: { contacts: "unexpected" } })[0]?.name, "Pat Taylor");
const normalized = validateClientContacts([
  { id: "a", name: " Alex Accounts ", email: " alex@company.com ", phone: " 111 ", isPrimary: true },
  { id: "b", name: "Sam Purchasing", email: "sam@company.com", phone: "222", isPrimary: true }
]);
assert.equal(normalized[0].name, "Alex Accounts");
assert.equal(normalized[0].isPrimary, true);
assert.equal(normalized[1].isPrimary, false);
assert.deepEqual(validateClientContacts([]), []);
assert.throws(() => validateClientContacts([{ id: "a", name: "", email: "", phone: "" }]), /name/);
assert.throws(() => validateClientContacts([{ id: "a", name: "Sam", email: "bad", phone: "" }]), /email/);
assert.throws(() => validateClientContacts([
  { id: "a", name: "Sam", email: "", phone: "" },
  { id: "a", name: "Chris", email: "", phone: "" }
]), /Duplicate/);
assert.deepEqual(validateClientContacts([{ id: "z", name: "Chris", email: "", phone: "" }])[0].isPrimary, true);
console.log("Client-contact model checks passed (legacy fallback, multiple contacts, defaults, validation, tenant contact selection).");
