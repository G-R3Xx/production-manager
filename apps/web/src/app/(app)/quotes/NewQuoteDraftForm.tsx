"use client";

import { useMemo, useState } from "react";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { createQuoteDraftAction } from "./actions";

export type QuoteDraftClientOption = {
  id: string;
  displayName: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  logoUrl: string;
  isActive: boolean;
};

type InitialQuoteDraftValues = {
  linkedCustomerId: string;
  clientName: string;
  contactName: string;
  phone: string;
  email: string;
  discountPercent: string;
  notes: string;
};

type NewQuoteDraftFormProps = {
  clients: QuoteDraftClientOption[];
  enquiryId: string;
  surveyRequestId: string;
  initialValues: InitialQuoteDraftValues;
};

const inputStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "0 14px",
  width: "100%",
  boxSizing: "border-box",
  background: "#fff"
} as const;

const textareaStyle = {
  minHeight: 80,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "12px 14px",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#fff"
} as const;

const buttonStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px"
} as const;

function contactNameForClient(client: QuoteDraftClientOption): string {
  const contactName = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
  if (contactName) return contactName;
  return client.companyName ? "" : client.displayName;
}

function quoteClientName(client: QuoteDraftClientOption): string {
  return client.companyName?.trim() || client.displayName;
}

export function NewQuoteDraftForm({ clients, enquiryId, surveyRequestId, initialValues }: NewQuoteDraftFormProps) {
  const hasInitialLinkedClient = Boolean(
    initialValues.linkedCustomerId && clients.some((client) => client.id === initialValues.linkedCustomerId)
  );
  const initialEntryMode: "existing" | "manual" = hasInitialLinkedClient
    ? "existing"
    : initialValues.clientName
      ? "manual"
      : clients.length > 0
        ? "existing"
        : "manual";
  const [entryMode, setEntryMode] = useState<"existing" | "manual">(initialEntryMode);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(hasInitialLinkedClient ? initialValues.linkedCustomerId : "");
  const [clientName, setClientName] = useState(initialValues.clientName);
  const [contactName, setContactName] = useState(initialValues.contactName);
  const [phone, setPhone] = useState(initialValues.phone);
  const [email, setEmail] = useState(initialValues.email);
  const [discountPercent, setDiscountPercent] = useState(initialValues.discountPercent);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => {
      if (client.id === selectedClientId) return true;
      const contactName = [client.firstName, client.lastName].filter(Boolean).join(" ");
      return [client.displayName, client.companyName, contactName, client.email, client.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [clientSearch, clients, selectedClientId]);

  function applySelectedClient(nextClientId: string) {
    setSelectedClientId(nextClientId);
    const client = clients.find((item) => item.id === nextClientId) ?? null;
    if (!client) {
      setClientName("");
      setContactName("");
      setPhone("");
      setEmail("");
      setDiscountPercent("0");
      return;
    }

    setClientName(quoteClientName(client));
    setContactName(contactNameForClient(client));
    setPhone(client.phone || "");
    setEmail(client.email || "");
  }

  function chooseMode(mode: "existing" | "manual") {
    setEntryMode(mode);
    if (mode === "manual") {
      setSelectedClientId("");
    }
  }

  return (
    <form action={createQuoteDraftAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <input type="hidden" name="surveyRequestId" value={surveyRequestId} />
      <input type="hidden" name="linkedCustomerId" value={entryMode === "existing" ? selectedClientId : ""} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => chooseMode("existing")}
          aria-pressed={entryMode === "existing"}
          disabled={clients.length === 0}
          style={{
            minHeight: 40,
            borderRadius: 12,
            border: entryMode === "existing" ? "2px solid #155eef" : "1px solid #cfd9e8",
            background: entryMode === "existing" ? "#eff6ff" : "#fff",
            color: entryMode === "existing" ? "#155eef" : "#344054",
            fontWeight: 900,
            cursor: clients.length === 0 ? "not-allowed" : "pointer",
            opacity: clients.length === 0 ? 0.55 : 1,
            padding: "0 14px"
          }}
        >
          Choose existing client
        </button>
        <button
          type="button"
          onClick={() => chooseMode("manual")}
          aria-pressed={entryMode === "manual"}
          style={{
            minHeight: 40,
            borderRadius: 12,
            border: entryMode === "manual" ? "2px solid #155eef" : "1px solid #cfd9e8",
            background: entryMode === "manual" ? "#eff6ff" : "#fff",
            color: entryMode === "manual" ? "#155eef" : "#344054",
            fontWeight: 900,
            cursor: "pointer",
            padding: "0 14px"
          }}
        >
          Enter manually
        </button>
      </div>

      {entryMode === "existing" ? (
        <section style={{ border: "1px solid #c7d7fe", borderRadius: 16, background: "#f8fbff", padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
            <input
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.currentTarget.value)}
              placeholder="Search existing clients"
              style={inputStyle}
            />
            <select value={selectedClientId} onChange={(event) => applySelectedClient(event.currentTarget.value)} required style={inputStyle}>
              <option value="">Choose a client…</option>
              {filteredClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName}{client.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </div>

          {selectedClient ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
              <ClientLogoBadge logoUrl={selectedClient.logoUrl} name={selectedClient.displayName} size={44} radius={12} padding={4} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedClient.displayName}</strong>
                <span style={{ display: "block", color: "#667085", fontSize: 12, lineHeight: 1.45 }}>
                  Details are copied into this quote. Editing them below will not change the saved client record.
                </span>
              </div>
            </div>
          ) : (
            <span style={{ color: "#667085", fontSize: 12 }}>Select a client to fill the company and contact details.</span>
          )}
        </section>
      ) : (
        <section style={{ border: "1px dashed #cfd9e8", borderRadius: 16, background: "#fff", padding: 12, color: "#667085", fontSize: 12 }}>
          Enter a new or one-off client below. This creates the quote without linking it to the saved client list.
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <input
          name="clientName"
          value={clientName}
          onChange={(event) => setClientName(event.currentTarget.value)}
          placeholder="Client / business name"
          required
          style={inputStyle}
        />
        <input
          name="contactName"
          value={contactName}
          onChange={(event) => setContactName(event.currentTarget.value)}
          placeholder="Contact name"
          style={inputStyle}
        />
        <input name="phone" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} placeholder="Phone" style={inputStyle} />
        <input name="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="Email" type="email" style={inputStyle} />
        <label style={{ display: "grid", gap: 4 }}>
          <input
            name="discountPercent"
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.currentTarget.value)}
            placeholder="Manual quote discount %"
            type="number"
            min="0"
            max="100"
            step="0.01"
            style={inputStyle}
          />
          <small style={{ color: "#667085" }}>Optional one-off discount for this quote only. Customer pricing comes from the MYOB price level.</small>
        </label>
      </div>
      <textarea name="notes" defaultValue={initialValues.notes} placeholder="Quote notes" style={textareaStyle} />
      <button type="submit" style={{ ...buttonStyle, width: "fit-content" }}>Create draft quote</button>
    </form>
  );
}
