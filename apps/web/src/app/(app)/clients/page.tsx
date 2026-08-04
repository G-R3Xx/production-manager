import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { customerAccountTerms, customerAccountTermsLabel, customerDefaultDiscount, customerDiscountRules, customerLogoUrl, customerWebsiteUsers, isDeletedCustomer, listCustomersForTenant, type CustomerRecord } from "@/server/customers";
import { archiveClientAction, createClientAction, deleteClientAction, restoreClientAction, syncClientWebsiteAccessAction, updateClientAction } from "./actions";
import { ClientDiscountRulesEditor } from "./ClientDiscountRulesEditor";

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

function discountLines(client: CustomerRecord): string {
  return customerDiscountRules(client)
    .map((rule) => [rule.productType, rule.minQty, rule.discountPercent, rule.maxQty ?? "", rule.note ?? ""].join(" | ").replace(/( \|\s*)+$/g, ""))
    .join("\n");
}

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

function ClientSummaryCard({ client, selectedId }: { client: CustomerRecord; selectedId: string }) {
  const selected = client.id === selectedId;
  const discountCount = customerDiscountRules(client).length;
  return (
    <a href={`/clients?selected=${client.id}`} style={{ textDecoration: "none", color: "inherit", border: selected ? "2px solid #2563eb" : "1px solid #e5e7eb", borderRadius: 18, padding: 14, display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, background: selected ? "#eff6ff" : "#fbfdff" }}>
      <ClientLogo client={client} />
      <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.displayName}</strong>
          <span style={{ borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 950, ...statusStyle(client) }}>{statusLabel(client)}</span>
        </div>
        <span style={{ color: "#667085", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[client.companyName, client.email, client.phone].filter(Boolean).join(" · ") || "No contact details yet"}</span>
        <span style={{ color: "#475467", fontSize: 12 }}>{customerAccountTermsLabel(client)}{client.payloadJson.websiteAccessEnabled ? " · Website access" : ""}</span>
        <span style={{ color: "#475467", fontSize: 12 }}>{customerDefaultDiscount(client) ? `${customerDefaultDiscount(client)}% default discount` : "No default discount"}{discountCount ? ` · ${discountCount} qty rule${discountCount === 1 ? "" : "s"}` : ""}</span>
      </div>
    </a>
  );
}

function ClientEditor({ client }: { client: CustomerRecord | null }) {
  const isNew = !client;
  const active = client?.isActive ?? true;
  const deleted = client ? isDeletedCustomer(client) : false;
  const logoUrl = client ? customerLogoUrl(client) : "";
  const payload = client?.payloadJson ?? {};
  const websiteUsers = client ? customerWebsiteUsers(client) : [];

  return (
    <section style={{ ...panelStyle(), display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 14 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: isNew ? "#2563eb" : "#475467" }}>{isNew ? "New client" : "Client setup"}</p>
          <h2 style={{ margin: 0 }}>{isNew ? "Add client details" : client.displayName}</h2>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.55 }}>Client details, logos and discounts are used throughout enquiries, survey requests, quotes and install handoff.</p>
        </div>
        {client ? <ClientLogo client={client} /> : null}
      </div>

      <form action={isNew ? createClientAction : updateClientAction} encType="multipart/form-data" style={{ display: "grid", gap: 14 }}>
        {client ? <input type="hidden" name="customerId" value={client.id} /> : null}

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>Display name</b><input name="displayName" defaultValue={client?.displayName ?? ""} placeholder="ANU" style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Company / trading name</b><input name="companyName" defaultValue={client?.companyName ?? ""} placeholder="Company" style={inputStyle} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>First name</b><input name="firstName" defaultValue={client?.firstName ?? ""} style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Last name</b><input name="lastName" defaultValue={client?.lastName ?? ""} style={inputStyle} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>Email</b><input type="email" name="email" defaultValue={client?.email ?? ""} style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Phone</b><input name="phone" defaultValue={client?.phone ?? ""} style={inputStyle} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>ABN / account reference</b><input name="abn" defaultValue={String(payload.abn ?? "")} style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Default quote discount %</b><input name="defaultDiscountPercent" defaultValue={String(payload.defaultDiscountPercent ?? "")} type="number" min="0" step="0.01" placeholder="eg 10" style={inputStyle} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>Billing address</b><textarea name="billingAddress" defaultValue={String(payload.billingAddress ?? "")} style={textareaStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Default site / delivery address</b><textarea name="defaultSiteAddress" defaultValue={String(payload.defaultSiteAddress ?? "")} style={textareaStyle} /></label>
        </div>

        <div style={{ border: "1px solid #a7f3d0", borderRadius: 20, padding: 16, background: "#f0fdf4", display: "grid", gap: 12 }}>
          <div>
            <strong style={{ fontSize: 17 }}>Website account and payment terms</strong>
            <p style={{ margin: "5px 0 0", color: "#475467", fontSize: 13, lineHeight: 1.5 }}>These controls approve the company for COD or account checkout. Customers with 7, 14 or 30 day terms will only see <b>Charge to account</b> on the website; the number of days remains internal.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(230px,.7fr) minmax(280px,1.3fr)", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}><b>Payment terms</b>
              <select name="accountTerms" defaultValue={client ? customerAccountTerms(client) : "cod"} style={inputStyle}>
                <option value="cod">COD</option>
                <option value="account_7">7 Day Account</option>
                <option value="account_14">14 Day Account</option>
                <option value="account_30">30 Day Account</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}><b>Website username</b><input name="websiteUsername" defaultValue={String(payload.websiteUsername ?? client?.email ?? "")} placeholder="Usually the client email address" style={inputStyle} /></label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 14, background: "#fff", border: "1px solid #bbf7d0", padding: 13, fontWeight: 850 }}>
            <input type="checkbox" name="websiteAccessEnabled" value="yes" defaultChecked={payload.websiteAccessEnabled === true} />
            Enable approved website account access
          </label>
          <small style={{ color: "#475467" }}>Save the client first, then use the secure invitation section below. Production Manager never emails a readable password.</small>
        </div>

        <div style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 14, background: "#f8fbff", display: "grid", gap: 10 }}>
          <strong>Client logo</strong>
          <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Upload a logo or paste a logo URL. This follows the client into survey requests and Install Scheduler jobs.</p>
          {logoUrl ? <img src={logoUrl} alt="Current logo" style={{ maxWidth: 180, maxHeight: 82, objectFit: "contain", borderRadius: 14, border: "1px solid #e5e7eb", padding: 8, background: "#fff" }} /> : null}
          <input type="file" name="logoFile" accept="image/*" style={{ ...inputStyle, paddingTop: 10 }} />
          <input name="logoUrl" defaultValue={logoUrl} placeholder="or paste logo URL" style={inputStyle} />
        </div>

        <ClientDiscountRulesEditor initialRulesText={client ? discountLines(client) : "Signage | 10 | 5\nSmall format | 250 | 7.5"} />

        <label style={{ display: "grid", gap: 6 }}><b>Internal notes</b><textarea name="notes" defaultValue={String(payload.notes ?? "")} style={textareaStyle} /></label>

        <button type="submit" style={darkButton}>{isNew ? "Create client" : "Save client details"}</button>
      </form>

      {!isNew && client ? (
        <section style={{ border: "1px solid #bfdbfe", borderRadius: 20, padding: 16, background: "#eff6ff", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start" }}>
            <div>
              <strong style={{ fontSize: 17 }}>Secure website invitation</strong>
              <p style={{ margin: "5px 0 0", color: "#475467", fontSize: 13, lineHeight: 1.5 }}>WordPress emails the username and a secure link for the client to create their own password. Sending another invitation can also add another contact to this company.</p>
            </div>
            <span style={{ borderRadius: 999, padding: "6px 10px", background: payload.websiteAccessEnabled ? "#dcfce7" : "#e2e8f0", color: payload.websiteAccessEnabled ? "#166534" : "#475569", fontSize: 12, fontWeight: 900 }}>{payload.websiteAccessEnabled ? customerAccountTermsLabel(client) : "Website access disabled"}</span>
          </div>
          {websiteUsers.length ? (
            <div style={{ display: "grid", gap: 7 }}>
              {websiteUsers.map((websiteUser) => <div key={websiteUser.wordpressUserId} style={{ display: "flex", justifyContent: "space-between", gap: 12, border: "1px solid #dbeafe", background: "#fff", borderRadius: 12, padding: "10px 12px" }}><span><b>{websiteUser.username}</b> · {websiteUser.email}</span><span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{websiteUser.status || "connected"}</span></div>)}
            </div>
          ) : <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No WordPress users are connected yet.</p>}
          <form action={syncClientWebsiteAccessAction} style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="customerId" value={client.id} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}><b>First name</b><input name="websiteFirstName" defaultValue={client.firstName ?? ""} style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}><b>Last name</b><input name="websiteLastName" defaultValue={client.lastName ?? ""} style={inputStyle} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}><b>Username</b><input name="websiteUsername" defaultValue={String(payload.websiteUsername ?? client.email ?? "")} required={payload.websiteAccessEnabled === true} style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}><b>Login email</b><input type="email" name="websiteEmail" defaultValue={client.email ?? ""} required={payload.websiteAccessEnabled === true} style={inputStyle} /></label>
            </div>
            <button type="submit" style={{ ...darkButton, justifySelf: "start", background: payload.websiteAccessEnabled ? "#2563eb" : "#475569" }}>{payload.websiteAccessEnabled ? "Send / update website invitation" : "Disable connected website access"}</button>
          </form>
          {payload.websiteLoginUrl ? <a href={String(payload.websiteLoginUrl)} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", fontWeight: 850, fontSize: 13 }}>Open website login page →</a> : null}
        </section>
      ) : null}

      {!isNew && client ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
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

  const visibleClients = clients.filter((client) => {
    if (filter === "archived") return !client.isActive && !isDeletedCustomer(client);
    if (filter === "deleted") return isDeletedCustomer(client);
    return client.isActive && !isDeletedCustomer(client);
  }).filter((client) => clientMatches(client, q));

  const selectedClient = clients.find((client) => client.id === selectedId) ?? null;
  const activeCount = clients.filter((client) => client.isActive && !isDeletedCustomer(client)).length;
  const archivedCount = clients.filter((client) => !client.isActive && !isDeletedCustomer(client)).length;
  const deletedCount = clients.filter(isDeletedCustomer).length;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={{ ...panelStyle(), background: "linear-gradient(135deg,#ffffff 0%,#f8fbff 55%,#eef6ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2563eb" }}>Clients</p>
        <h1 style={{ marginTop: 10, marginBottom: 10, fontSize: 36, letterSpacing: "-0.04em" }}>Client setup</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Manage client details, logos, archived clients and pricing/discount rules for <strong>{activeTenant.tenantName}</strong>.</p>
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

        <ClientEditor client={selectedClient} />
      </div>
    </div>
  );
}
