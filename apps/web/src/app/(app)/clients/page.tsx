import { redirect } from "next/navigation";
import { AUSTRALIAN_STATES, formatAustralianAbn, structuredAddressFromPayload, type StructuredAddress } from "@/lib/contact-address";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { MYOB_PRICE_LEVELS, customerLogoUrl, customerMyobPriceLevel, customerMyobPriceLevelName, customerMyobPriceLevelNames, isDeletedCustomer, listCustomersForTenant, type CustomerRecord, type MyobPriceLevel } from "@/server/customers";
import { archiveClientAction, createClientAction, deleteClientAction, restoreClientAction, syncClientToMyobAction, updateClientAction } from "./actions";
import { AutoRefreshWhenPending } from "@/components/AutoRefreshWhenPending";
import { MyobSyncStatus, readMyobSyncStatus } from "@/components/MyobSyncStatus";

type ClientsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function panelStyle() {
  return { background: "#fff", border: "1px solid #dfe7f2", borderRadius: 24, padding: 22, boxShadow: "0 16px 44px rgba(15,23,42,0.05)" } as const;
}

const inputStyle = { minHeight: 44, borderRadius: 14, border: "1px solid #cfd9e8", padding: "0 14px", width: "100%", boxSizing: "border-box", background: "#fff" } as const;
const textareaStyle = { minHeight: 96, borderRadius: 14, border: "1px solid #cfd9e8", padding: "12px 14px", width: "100%", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" } as const;
const darkButton = { minHeight: 44, borderRadius: 14, border: "none", background: "#111827", color: "#fff", fontWeight: 900, cursor: "pointer", padding: "0 16px" } as const;
const ghostButton = { minHeight: 40, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", color: "#111827", fontWeight: 850, cursor: "pointer", padding: "0 14px" } as const;

function statusLabel(client: CustomerRecord): string {
  if (isDeletedCustomer(client)) return "Deleted";
  if (!client.isActive) return "Archived";
  return "Active";
}

function statusStyle(client: CustomerRecord) {
  if (isDeletedCustomer(client)) return { background: "#fef3f2", color: "#b42318" } as const;
  if (!client.isActive) return { background: "#f8fafc", color: "#475467" } as const;
  return { background: "#dcfae6", color: "#067647" } as const;
}

function clientMatches(client: CustomerRecord, q: string): boolean {
  if (!q.trim()) return true;
  const haystack = [
    client.displayName,
    client.companyName ?? "",
    client.email ?? "",
    client.phone ?? "",
    client.payloadJson?.abn ?? "",
    client.payloadJson?.accountReference ?? "",
    client.payloadJson?.billingAddress ?? "",
    client.payloadJson?.defaultSiteAddress ?? "",
    client.payloadJson?.notes ?? ""
  ].join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

function ClientLogo({ client }: { client: CustomerRecord }) {
  const logoUrl = customerLogoUrl(client);
  if (logoUrl) {
    return <img src={logoUrl} alt={`${client.displayName} logo`} style={{ width: 58, height: 58, objectFit: "contain", borderRadius: 16, border: "1px solid #e5e7eb", background: "#fff" }} />;
  }

  return (
    <div style={{ width: 58, height: 58, borderRadius: 16, background: "linear-gradient(135deg,#eef2ff,#e0f2fe)", border: "1px solid #dbeafe", display: "grid", placeItems: "center", color: "#1d4ed8", fontWeight: 950 }}>
      {client.displayName.slice(0, 2).toUpperCase()}
    </div>
  );
}

function AddressFields({ title, prefix, address }: { title: string; prefix: "billing" | "site"; address: StructuredAddress }) {
  return (
    <div style={{ border: "1px solid #dfe7f2", borderRadius: 18, padding: 14, background: "#fbfdff", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <b>{title}</b>
        <span style={{ fontSize: 11, color: "#667085" }}>Stored as separate MYOB address fields</span>
      </div>
      <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>Street address</span><textarea name={`${prefix}Street`} defaultValue={address.street} rows={2} style={{ ...textareaStyle, minHeight: 70 }} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) minmax(90px,.55fr) minmax(100px,.65fr)", gap: 9 }}>
        <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>Suburb / town</span><input name={`${prefix}City`} defaultValue={address.city} style={inputStyle} /></label>
        <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>State</span><input name={`${prefix}State`} defaultValue={address.state} list="au-state-options" placeholder="ACT" style={inputStyle} /></label>
        <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>Postcode</span><input name={`${prefix}Postcode`} defaultValue={address.postcode} inputMode="numeric" style={inputStyle} /></label>
      </div>
      <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>Country</span><input name={`${prefix}Country`} defaultValue={address.country || "Australia"} style={inputStyle} /></label>
    </div>
  );
}

function ClientSummaryCard({ client, selectedId }: { client: CustomerRecord; selectedId: string }) {
  const selected = client.id === selectedId;
  return (
    <a href={`/clients?selected=${client.id}`} style={{ textDecoration: "none", color: "inherit", border: selected ? "2px solid #2563eb" : "1px solid #e5e7eb", borderRadius: 18, padding: 14, display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, background: selected ? "#eff6ff" : "#fbfdff" }}>
      <ClientLogo client={client} />
      <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.displayName}</strong>
          <span style={{ borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 950, ...statusStyle(client) }}>{statusLabel(client)}</span>
        </div>
        <span style={{ color: "#667085", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[client.companyName, client.email, client.phone].filter(Boolean).join(" · ") || "No contact details yet"}</span>
        <span style={{ color: "#475467", fontSize: 12 }}>{customerMyobPriceLevel(client) ? `Price level: ${customerMyobPriceLevelName(client)} (${customerMyobPriceLevel(client)})` : "Price level: Level A"}</span>
      </div>
    </a>
  );
}

function ClientEditor({ client, myobCustomers, priceLevelNames }: { client: CustomerRecord | null; myobCustomers: CustomerRecord[]; priceLevelNames: Partial<Record<MyobPriceLevel, string>> }) {
  const isNew = !client;
  const active = client?.isActive ?? true;
  const deleted = client ? isDeletedCustomer(client) : false;
  const logoUrl = client ? customerLogoUrl(client) : "";
  const payload = client?.payloadJson ?? {};
  const currentMyobUid = client && !client.myobUid.startsWith("manual-")
    ? client.myobUid
    : typeof payload.myobUid === "string" ? payload.myobUid : "";
  const mappedCustomer = myobCustomers.find((candidate) => candidate.myobUid === currentMyobUid) ?? null;
  const currentPriceLevel = customerMyobPriceLevel(client) ?? "Level A";
  const myobSyncStatus = readMyobSyncStatus(payload.myobSyncStatus, Boolean(currentMyobUid));
  const myobSyncError = typeof payload.myobSyncError === "string" ? payload.myobSyncError : "";
  const rawMyobAddresses = Array.isArray(payload.Addresses)
    ? payload.Addresses.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)))
    : [];
  const rawBilling = rawMyobAddresses.find((address) => Number(address.Location ?? 0) === 1) ?? rawMyobAddresses[0];
  const rawSite = rawMyobAddresses.find((address) => Number(address.Location ?? 0) === 2);
  const billingAddress = structuredAddressFromPayload(payload.billingAddressStructured ?? rawBilling, payload.billingAddress);
  const siteAddress = structuredAddressFromPayload(payload.defaultSiteAddressStructured ?? rawSite, payload.defaultSiteAddress);
  const rawSellingDetails = payload.SellingDetails && typeof payload.SellingDetails === "object" && !Array.isArray(payload.SellingDetails)
    ? payload.SellingDetails as Record<string, unknown>
    : {};
  const legacyAbn = typeof payload.abn === "string" ? payload.abn.trim() : (typeof rawSellingDetails.ABN === "string" ? rawSellingDetails.ABN.trim() : "");
  const legacyAbnDigits = legacyAbn.replace(/\D/g, "");
  const hasExplicitAccountReference = typeof payload.accountReference === "string";
  const abnValue = hasExplicitAccountReference || legacyAbnDigits.length === 11 ? (formatAustralianAbn(legacyAbn) || legacyAbn) : "";
  const accountReferenceValue = hasExplicitAccountReference ? String(payload.accountReference ?? "") : (legacyAbn && legacyAbnDigits.length !== 11 ? legacyAbn : "");

  return (
    <section style={{ ...panelStyle(), display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 14 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: isNew ? "#2563eb" : "#475467" }}>{isNew ? "New client" : "Client setup"}</p>
          <h2 style={{ margin: 0 }}>{isNew ? "Add client details" : client.displayName}</h2>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.55 }}>Client details, MYOB price level and logo are used throughout enquiries, survey requests, quotes and install handoff.</p>
        </div>
        {client ? <ClientLogo client={client} /> : null}
      </div>

      <form action={isNew ? createClientAction : updateClientAction} encType="multipart/form-data" style={{ display: "grid", gap: 14 }}>
        {client ? <input type="hidden" name="customerId" value={client.id} /> : null}
        <datalist id="au-state-options">{AUSTRALIAN_STATES.map((state) => <option key={state} value={state} />)}</datalist>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>Display name</b><input name="displayName" defaultValue={client?.displayName ?? ""} placeholder="ANU" style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Company / trading name</b><input name="companyName" defaultValue={client?.companyName ?? ""} placeholder="Company" style={inputStyle} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>First name</b><input name="firstName" defaultValue={client?.firstName ?? ""} style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Last name</b><input name="lastName" defaultValue={client?.lastName ?? ""} style={inputStyle} /></label>
        </div>

        <div style={{ border: `1px solid ${currentMyobUid ? "#86efac" : "#fed7aa"}`, borderRadius: 20, padding: 14, background: currentMyobUid ? "#ecfdf3" : "#fff7ed", display: "grid", gap: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <strong>MYOB customer mapping</strong>
            <MyobSyncStatus status={myobSyncStatus} linked={Boolean(currentMyobUid)} error={myobSyncError} />
          </div>
          <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Choose the matching imported MYOB customer. Accepted quotes and website orders use this link when creating the MYOB Order.</p>
          <select name="myobCustomerId" defaultValue={mappedCustomer?.id ?? ""} style={inputStyle}>
            <option value="">Automatic matching / not linked</option>
            {myobCustomers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.displayName}{candidate.companyName && candidate.companyName !== candidate.displayName ? ` — ${candidate.companyName}` : ""}</option>
            ))}
          </select>
          {mappedCustomer ? <span style={{ color: "#067647", fontSize: 12, fontWeight: 800 }}>Current MYOB customer: {mappedCustomer.displayName}</span> : null}
          {myobSyncStatus === "error" && myobSyncError ? <span style={{ color: "#b42318", fontSize: 12, lineHeight: 1.5 }}><strong>MYOB sync:</strong> {myobSyncError}</span> : null}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 360px) 1fr", gap: 12, alignItems: "end", marginTop: 4 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <b>MYOB price level</b>
              <select name="myobPriceLevel" defaultValue={currentPriceLevel} style={inputStyle}>
                {MYOB_PRICE_LEVELS.map((level) => {
                  const customName = String(priceLevelNames[level] ?? level).trim() || level;
                  return <option key={level} value={level}>{customName === level ? level : `${customName} (${level})`}</option>;
                })}
              </select>
            </label>
            <span style={{ color: "#667085", fontSize: 12, lineHeight: 1.5 }}>Synced with MYOB customer Selling Details. Changing this on a linked client updates MYOB; unlinked clients keep the level ready for when they are created in MYOB.</span>
          </div>
          <div style={{ borderTop: "1px solid #bbf7d0", paddingTop: 9, color: "#475467", fontSize: 12, lineHeight: 1.5 }}>Permanent client discounts and quantity discount rules have been retired. Customer pricing now follows this single MYOB price level; one-off exceptions are applied on the quote instead.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>Email</b><input type="email" name="email" defaultValue={client?.email ?? ""} style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Phone</b><input name="phone" defaultValue={client?.phone ?? ""} style={inputStyle} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>ABN</b><input name="abn" defaultValue={abnValue} placeholder="00 000 000 000" style={inputStyle} /><span style={{ color: "#667085", fontSize: 11 }}>Synced to MYOB Selling Details when supplied.</span></label>
          <label style={{ display: "grid", gap: 6 }}><b>Account reference</b><input name="accountReference" defaultValue={accountReferenceValue} placeholder="Optional internal/client reference" style={inputStyle} /><span style={{ color: "#667085", fontSize: 11 }}>Production Manager reference; kept separate from the ABN.</span></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
          <AddressFields title="Billing address" prefix="billing" address={billingAddress} />
          <AddressFields title="Default site / delivery address" prefix="site" address={siteAddress} />
        </div>

        <div style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 14, background: "#f8fbff", display: "grid", gap: 10 }}>
          <strong>Client logo</strong>
          <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Upload a logo or paste a logo URL. This follows the client into survey requests and Install Scheduler jobs.</p>
          {logoUrl ? <img src={logoUrl} alt="Current logo" style={{ maxWidth: 180, maxHeight: 82, objectFit: "contain", borderRadius: 14, border: "1px solid #e5e7eb", padding: 8, background: "#fff" }} /> : null}
          <input type="file" name="logoFile" accept="image/*" style={{ ...inputStyle, paddingTop: 10 }} />
          <input name="logoUrl" defaultValue={logoUrl} placeholder="or paste logo URL" style={inputStyle} />
        </div>

        <label style={{ display: "grid", gap: 6 }}><b>Internal notes</b><textarea name="notes" defaultValue={String(payload.notes ?? "")} style={textareaStyle} /></label>

        <button type="submit" style={darkButton}>{isNew ? "Create client" : "Save client details"}</button>
      </form>

      {!isNew && client ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
          {active && !deleted ? <form action={syncClientToMyobAction}><input type="hidden" name="customerId" value={client.id} /><button type="submit" style={{...ghostButton,borderColor:"#0f766e",color:"#0f766e"}}>Sync to MYOB</button></form> : null}
          {active && !deleted ? (
            <form action={archiveClientAction}><input type="hidden" name="customerId" value={client.id} /><button type="submit" style={ghostButton}>Archive</button></form>
          ) : null}
          {!active && !deleted ? (
            <form action={restoreClientAction}><input type="hidden" name="customerId" value={client.id} /><button type="submit" style={ghostButton}>Restore</button></form>
          ) : null}
          {!deleted ? (
            <form action={deleteClientAction}><input type="hidden" name="customerId" value={client.id} /><button type="submit" style={{ ...ghostButton, borderColor: "#fda29b", color: "#b42318" }}>Delete safely</button></form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const q = readParam(params, "q");
  const selectedId = readParam(params, "selected");
  const filter = readParam(params, "filter") || "active";
  const clients = await listCustomersForTenant(activeTenant.tenantId, { includeDeleted: true });
  const myobCustomers = clients.filter((client) => Boolean(client.myobUid) && !client.myobUid.startsWith("manual-") && client.isActive && !isDeletedCustomer(client));
  const priceLevelNames: Partial<Record<MyobPriceLevel, string>> = {};
  for (const source of myobCustomers) {
    const names = customerMyobPriceLevelNames(source);
    for (const level of MYOB_PRICE_LEVELS) {
      if (!priceLevelNames[level] && names[level]) priceLevelNames[level] = names[level];
    }
  }

  const visibleClients = clients.filter((client) => {
    if (filter === "archived") return !client.isActive && !isDeletedCustomer(client);
    if (filter === "deleted") return isDeletedCustomer(client);
    return client.isActive && !isDeletedCustomer(client);
  }).filter((client) => clientMatches(client, q));

  const selectedClient = clients.find((client) => client.id === selectedId) ?? null;
  const activeCount = clients.filter((client) => client.isActive && !isDeletedCustomer(client)).length;
  const archivedCount = clients.filter((client) => !client.isActive && !isDeletedCustomer(client)).length;
  const deletedCount = clients.filter(isDeletedCustomer).length;
  const hasPendingMyobSync = clients.some((client) => ["pending", "syncing"].includes(String(client.payloadJson?.myobSyncStatus ?? "")));

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 16 }}>
      <AutoRefreshWhenPending active={hasPendingMyobSync} />
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={{ ...panelStyle(), background: "linear-gradient(135deg,#ffffff 0%,#f8fbff 55%,#eef6ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2563eb" }}>Clients</p>
        <h1 style={{ marginTop: 10, marginBottom: 10, fontSize: 36, letterSpacing: "-0.04em" }}>Client setup</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Manage client details, logos, archived clients and MYOB price levels for <strong>{activeTenant.tenantName}</strong>.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "410px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <section style={{ ...panelStyle(), display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Find clients</h2>
            <a href="/clients" style={{ textDecoration: "none", borderRadius: 999, border: "1px solid #cbd5e1", padding: "7px 12px", fontWeight: 850, color: "#111827" }}>+ New</a>
          </div>
          <form method="get" style={{ display: "grid", gap: 10 }}>
            <input name="q" defaultValue={q} placeholder="Search name, phone, email, ABN, address" style={inputStyle} />
            <input type="hidden" name="filter" value={filter} />
            <button type="submit" style={darkButton}>Search</button>
          </form>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <a href={`/clients?filter=active${q ? `&q=${encodeURIComponent(q)}` : ""}`} style={{ textDecoration: "none", textAlign: "center", borderRadius: 14, padding: 10, background: filter === "active" ? "#eff6ff" : "#f8fafc", border: filter === "active" ? "1px solid #2563eb" : "1px solid #e5e7eb", color: "#111827", fontWeight: 900 }}>Active<br /><span style={{ color: "#667085", fontSize: 12 }}>{activeCount}</span></a>
            <a href={`/clients?filter=archived${q ? `&q=${encodeURIComponent(q)}` : ""}`} style={{ textDecoration: "none", textAlign: "center", borderRadius: 14, padding: 10, background: filter === "archived" ? "#eff6ff" : "#f8fafc", border: filter === "archived" ? "1px solid #2563eb" : "1px solid #e5e7eb", color: "#111827", fontWeight: 900 }}>Archived<br /><span style={{ color: "#667085", fontSize: 12 }}>{archivedCount}</span></a>
            <a href={`/clients?filter=deleted${q ? `&q=${encodeURIComponent(q)}` : ""}`} style={{ textDecoration: "none", textAlign: "center", borderRadius: 14, padding: 10, background: filter === "deleted" ? "#eff6ff" : "#f8fafc", border: filter === "deleted" ? "1px solid #2563eb" : "1px solid #e5e7eb", color: "#111827", fontWeight: 900 }}>Deleted<br /><span style={{ color: "#667085", fontSize: 12 }}>{deletedCount}</span></a>
          </div>

          <div style={{ display: "grid", gap: 10, maxHeight: 650, overflow: "auto", paddingRight: 4 }}>
            {visibleClients.length === 0 ? (
              <p style={{ margin: 0, color: "#667085" }}>No clients found.</p>
            ) : visibleClients.map((client) => <ClientSummaryCard key={client.id} client={client} selectedId={selectedId} />)}
          </div>
        </section>

        <ClientEditor client={selectedClient} myobCustomers={myobCustomers} priceLevelNames={priceLevelNames} />
      </div>
    </div>
  );
}
