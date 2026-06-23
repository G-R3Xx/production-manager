import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  getArtworkApprovalById,
  getArtworkApprovalForQuote,
  getQuoteDraftById,
  listArtworkApprovalPages,
  listArtworkApprovalsForTenant,
  listQuoteDraftsForTenant,
  listQuoteLines
} from "@/server/quotes";
import {
  addArtworkApprovalPageFromPageAction,
  createArtworkApprovalFromQuoteAction,
  removeArtworkApprovalPageFromPageAction,
  sendArtworkApprovalFromPageAction
} from "./actions";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

function publicArtworkUrl(token: string | null | undefined): string {
  if (!token) return "";
  const base = appBaseUrl();
  return `${base}/public/artwork-approvals/${token}`;
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === "approved") return { bg: "#dcfae6", fg: "#067647", border: "#abefc6" };
  if (status === "sent" || status === "viewed") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe" };
  if (status === "changes_requested") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
}

const cardStyle = {
  border: "1px solid #dbe4f0",
  borderRadius: 24,
  background: "rgba(255,255,255,0.94)",
  boxShadow: "0 18px 44px rgba(15,23,42,0.06)",
  padding: 18
} as const;

const inputStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "0 13px",
  width: "100%",
  boxSizing: "border-box",
  font: "inherit",
  background: "#fff"
} as const;

const textareaStyle = {
  minHeight: 94,
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
  background: "#6d28d9",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px"
} as const;

export default async function ArtworkApprovalsPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedParam = readParam(params, "selected");
  const quoteParam = readParam(params, "quote");

  const [quoteDrafts, approvals] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId),
    listArtworkApprovalsForTenant(activeTenant.tenantId)
  ]);

  const quoteForCreate = quoteParam ? await getQuoteDraftById(activeTenant.tenantId, quoteParam) : null;
  const existingForQuote = quoteParam ? await getArtworkApprovalForQuote(activeTenant.tenantId, quoteParam) : null;
  const selectedApproval = selectedParam
    ? await getArtworkApprovalById(activeTenant.tenantId, selectedParam)
    : existingForQuote ?? approvals[0] ?? null;
  const selectedQuote = selectedApproval ? await getQuoteDraftById(activeTenant.tenantId, selectedApproval.quoteId) : quoteForCreate;
  const [quoteLines, proofPages] = await Promise.all([
    selectedQuote ? listQuoteLines(selectedQuote.id) : Promise.resolve([]),
    selectedApproval ? listArtworkApprovalPages(selectedApproval.id) : Promise.resolve([])
  ]);
  const quoteTotal = quoteLines.reduce((sum, line) => sum + parseMoney(line.lineTotal), 0);
  const publicUrl = selectedApproval ? publicArtworkUrl(selectedApproval.publicToken) : "";
  const quoteOptions = quoteDrafts.filter((quote) => quote.id !== quoteForCreate?.id && !approvals.some((approval) => approval.quoteId === quote.id));
  const selectedTone = selectedApproval ? statusTone(selectedApproval.status) : statusTone("draft");

  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 8, background: "linear-gradient(135deg, #ffffff 0%, #fbf7ff 58%, #f3e8ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7c3aed" }}>Artwork approvals</p>
        <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Send and manage proof approvals</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Quotes stay in Quotes. Artwork/proof pages, approval links, client responses and approval status live here as their own workflow.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <h2 style={{ margin: 0 }}>Create from quote</h2>
              <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Start an approval pack after a quote is accepted, or create one early if artwork needs to start sooner.</p>
            </div>
            {quoteParam && quoteForCreate && existingForQuote ? (
              <Link href={`/artwork-approvals?selected=${existingForQuote.id}`} style={{ minHeight: 44, borderRadius: 14, border: "1px solid #ddd6fe", background: "#fff", color: "#5b21b6", fontWeight: 950, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", textDecoration: "none" }}>Open existing approval for this quote</Link>
            ) : null}
            <form action={createArtworkApprovalFromQuoteAction} style={{ display: "grid", gap: 10 }}>
              <select name="quoteId" defaultValue={quoteForCreate?.id ?? quoteOptions[0]?.id ?? ""} style={inputStyle}>
                {quoteForCreate && !existingForQuote ? <option value={quoteForCreate.id}>{quoteForCreate.quoteNumber ?? "Draft quote"} · {quoteForCreate.clientName}</option> : null}
                {quoteOptions.map((quote) => (
                  <option key={quote.id} value={quote.id}>{quote.quoteNumber ?? "Draft quote"} · {quote.clientName} · {quote.status.replace(/_/g, " ")}</option>
                ))}
              </select>
              <button type="submit" disabled={!quoteForCreate && quoteOptions.length === 0} style={{ ...buttonStyle, background: !quoteForCreate && quoteOptions.length === 0 ? "#94a3b8" : "#6d28d9" }}>Create approval pack</button>
            </form>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Approval packs</h2>
              <span style={{ borderRadius: 999, background: "#f5f3ff", color: "#6d28d9", padding: "5px 9px", fontSize: 12, fontWeight: 950 }}>{approvals.length}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {approvals.map((approval) => {
                const tone = statusTone(approval.status);
                const quote = quoteDrafts.find((item) => item.id === approval.quoteId);
                const isSelected = selectedApproval?.id === approval.id;

                return (
                  <Link key={approval.id} href={`/artwork-approvals?selected=${approval.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ border: isSelected ? "1px solid #a78bfa" : "1px solid #e4e7ec", borderRadius: 18, padding: 12, background: isSelected ? "#faf5ff" : "#fff", display: "grid", gap: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{approval.clientName}</strong>
                        <span style={{ borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, padding: "4px 8px", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" }}>{approval.status.replace(/_/g, " ")}</span>
                      </div>
                      <span style={{ color: "#667085", fontSize: 12 }}>{quote?.quoteNumber ?? "Quote"} · updated {formatDate(approval.updatedAt)}</span>
                    </div>
                  </Link>
                );
              })}
              {approvals.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No artwork approvals yet. Create one from an accepted quote.</p> : null}
            </div>
          </section>
        </div>

        {selectedApproval && selectedQuote ? (
          <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start", flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7c3aed" }}>Approval pack</p>
                <h2 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.03em" }}>{selectedApproval.clientName}</h2>
                <p style={{ margin: 0, color: "#667085" }}>{selectedQuote.quoteNumber ?? "Draft quote"} · {formatMoney(quoteTotal)} · {proofPages.length} proof page{proofPages.length === 1 ? "" : "s"}</p>
              </div>
              <span style={{ borderRadius: 999, background: selectedTone.bg, color: selectedTone.fg, border: `1px solid ${selectedTone.border}`, padding: "8px 12px", fontSize: 13, fontWeight: 950 }}>{selectedApproval.status.replace(/_/g, " ")}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 850 }}>Sent</div>
                <strong>{formatDate(selectedApproval.sentAt)}</strong>
              </div>
              <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 850 }}>Viewed</div>
                <strong>{formatDate(selectedApproval.viewedAt)}</strong>
              </div>
              <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 850 }}>Approved</div>
                <strong>{formatDate(selectedApproval.approvedAt)}</strong>
              </div>
              <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 850 }}>Quote</div>
                <Link href={`/quotes?selected=${selectedQuote.id}`} style={{ color: "#2563eb", fontWeight: 950, textDecoration: "none" }}>Open quote</Link>
              </div>
            </div>

            <section style={{ border: "1px solid #ddd6fe", background: "#faf5ff", borderRadius: 20, padding: 14, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <strong>Client artwork approval link</strong>
                <input readOnly value={publicUrl || "Mark as sent to generate/confirm the client link"} style={{ ...inputStyle, fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <form action={sendArtworkApprovalFromPageAction}>
                  <input type="hidden" name="approvalId" value={selectedApproval.id} />
                  <button type="submit" style={buttonStyle}>{selectedApproval.sentAt ? "Mark sent again" : "Mark approval sent"}</button>
                </form>
                {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" style={{ minHeight: 44, borderRadius: 14, border: "1px solid #ddd6fe", background: "#fff", color: "#5b21b6", fontWeight: 950, display: "inline-flex", alignItems: "center", padding: "0 14px", textDecoration: "none" }}>Open client approval</a> : null}
                {publicUrl && selectedApproval.email ? <a href={`mailto:${selectedApproval.email}?subject=${encodeURIComponent("Artwork approval request")}&body=${encodeURIComponent(`Hi ${selectedApproval.contactName ?? selectedApproval.clientName},\n\nPlease review and approve your artwork here:\n${publicUrl}\n\nThanks`)}`} style={{ minHeight: 44, borderRadius: 14, border: "1px solid #ddd6fe", background: "#fff", color: "#5b21b6", fontWeight: 950, display: "inline-flex", alignItems: "center", padding: "0 14px", textDecoration: "none" }}>Email approval</a> : null}
              </div>
            </section>

            <form action={addArtworkApprovalPageFromPageAction} style={{ border: "1px solid #e9d5ff", background: "#fff", borderRadius: 20, padding: 14, display: "grid", gap: 10 }}>
              <input type="hidden" name="approvalId" value={selectedApproval.id} />
              <div style={{ display: "grid", gap: 4 }}>
                <strong>Add proof page</strong>
                <span style={{ color: "#667085", fontSize: 13 }}>Paste the artwork/proof image URL. File upload can come next, but this keeps the approval workflow separated now.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
                <input name="title" placeholder="Proof title, eg S1 Front elevation" style={inputStyle} />
                <input name="imageUrl" placeholder="Artwork/proof image URL" style={inputStyle} />
              </div>
              <textarea name="notes" placeholder="Notes for this proof page" style={{ ...textareaStyle, minHeight: 72 }} />
              <button type="submit" style={buttonStyle}>Add proof page</button>
            </form>

            <section style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Proof pages</h3>
              {proofPages.map((page) => (
                <div key={page.id} style={{ border: "1px solid #e9d5ff", background: "#fff", borderRadius: 18, padding: 12, display: "grid", gridTemplateColumns: "112px 1fr auto", gap: 12, alignItems: "center" }}>
                  <a href={page.imageUrl} target="_blank" rel="noreferrer"><img src={page.imageUrl} alt={page.title} style={{ width: 112, height: 82, objectFit: "cover", borderRadius: 14, border: "1px solid #e4e7ec" }} /></a>
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong>{page.title}</strong>
                    {page.notes ? <span style={{ color: "#667085", fontSize: 13 }}>{page.notes}</span> : null}
                  </div>
                  <form action={removeArtworkApprovalPageFromPageAction}>
                    <input type="hidden" name="approvalId" value={selectedApproval.id} />
                    <input type="hidden" name="pageId" value={page.id} />
                    <button type="submit" style={{ border: "1px solid #fecaca", background: "#fff", color: "#b42318", borderRadius: 12, padding: "8px 10px", fontWeight: 900, cursor: "pointer" }}>Remove</button>
                  </form>
                </div>
              ))}
              {proofPages.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No proof pages yet. Add at least one proof image before sending the approval link.</p> : null}
            </section>

            {selectedApproval.clientResponseNotes ? <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", borderRadius: 16, padding: 12 }}><strong>Client artwork notes:</strong><br />{selectedApproval.clientResponseNotes}</div> : null}
          </section>
        ) : quoteForCreate ? (
          <section style={{ ...cardStyle, display: "grid", gap: 12, textAlign: "center", placeItems: "center", minHeight: 420 }}>
            <h2 style={{ margin: 0 }}>Create an artwork approval for {quoteForCreate.clientName}</h2>
            <p style={{ margin: 0, color: "#667085" }}>This quote does not have an approval pack yet.</p>
            <form action={createArtworkApprovalFromQuoteAction}>
              <input type="hidden" name="quoteId" value={quoteForCreate.id} />
              <button type="submit" style={buttonStyle}>Create approval pack</button>
            </form>
          </section>
        ) : (
          <section style={{ ...cardStyle, display: "grid", gap: 8, textAlign: "center", placeItems: "center", minHeight: 420 }}>
            <h2 style={{ margin: 0 }}>No artwork approval selected</h2>
            <p style={{ margin: 0, color: "#667085" }}>Create an approval from a quote or choose one from the list.</p>
          </section>
        )}
      </div>
    </div>
  );
}
