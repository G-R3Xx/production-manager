"use client";

import { useState } from "react";
import type { ClientContact } from "@/lib/client-contacts";

const fieldStyle = { minHeight: 42, borderRadius: 12, border: "1px solid #cfd9e8", padding: "0 12px", width: "100%", minWidth: 0, boxSizing: "border-box" } as const;

export function ClientContactsEditor({ initialContacts }: { initialContacts: ClientContact[] }) {
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts);

  function modifyContact(id: string, updates: Partial<ClientContact>) {
    setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, ...updates } : contact));
  }

  function setPrimaryContact(id: string) {
    setContacts((current) => current.map((contact) => ({ ...contact, isPrimary: contact.id === id })));
  }

  function removeContact(id: string) {
    setContacts((current) => {
      const next = current.filter((contact) => contact.id !== id);
      if (next.length > 0 && !next.some((contact) => contact.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }

  function addContact() {
    setContacts((current) => [...current, { id: crypto.randomUUID(), name: "", email: "", phone: "", isPrimary: current.length === 0 }]);
  }

  return (
    <section style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 14, display: "grid", gap: 12, background: "#fbfdff" }}>
      <input type="hidden" name="contactsJson" value={JSON.stringify(contacts)} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Company contacts</strong>
          <span style={{ fontSize: 12, color: "#667085" }}>Add people to this client. Choose a default contact for new enquiries.</span>
        </div>
        <button type="button" onClick={addContact} disabled={contacts.length >= 100} style={{ borderRadius: 12, border: "1px solid #93c5fd", color: "#1d4ed8", background: "#eff6ff", padding: "10px 14px", fontWeight: 850, cursor: "pointer" }}>+ Add contact</button>
      </div>
      {contacts.length === 0 ? <span style={{ color: "#667085", fontSize: 13 }}>No contacts added yet.</span> : null}
      {contacts.map((contact, index) => (
        <div key={contact.id} style={{ display: "grid", gap: 10, border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
              <input type="radio" name="primaryClientContact" checked={contact.isPrimary} onChange={() => setPrimaryContact(contact.id)} /> Default contact
            </label>
            <button type="button" onClick={() => removeContact(contact.id)} style={{ border: "none", background: "transparent", color: "#b42318", cursor: "pointer", fontWeight: 800 }}>Remove</button>
          </div>
          <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Contact {index + 1} — name</span><input value={contact.name} onChange={(event) => modifyContact(contact.id, { name: event.currentTarget.value })} placeholder="Full name" style={fieldStyle} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Email</span><input type="email" value={contact.email} onChange={(event) => modifyContact(contact.id, { email: event.currentTarget.value })} placeholder="name@company.com.au" style={fieldStyle} /></label>
            <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Phone</span><input type="tel" value={contact.phone} onChange={(event) => modifyContact(contact.id, { phone: event.currentTarget.value })} placeholder="Phone or mobile" style={fieldStyle} /></label>
          </div>
        </div>
      ))}
      <span style={{ color: "#64748b", fontSize: 12 }}>Save client details to keep contact changes. Existing MYOB company email/phone fields stay separate.</span>
    </section>
  );
}
