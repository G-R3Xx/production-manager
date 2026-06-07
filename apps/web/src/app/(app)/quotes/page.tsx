import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import { listCustomersForTenant } from "@/server/customers";
import { listInvoicesForTenant, listQuotesForTenant, listRecentQuoteLinesForTenant } from "@/server/quotes";
import { createDraftQuoteAction } from "./actions";

type QuotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function cardStyle() {
  return { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 24 } as const;
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect('/bootstrap');
  }

  const [products, customers, quotes, quoteLines, invoices] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listCustomersForTenant(activeTenant.tenantId),
    listQuotesForTenant(activeTenant.tenantId),
    listRecentQuoteLinesForTenant(activeTenant.tenantId),
    listInvoicesForTenant(activeTenant.tenantId)
  ]);

  const params = (await searchParams) ?? {};
  const message = readParam(params, 'message');
  const error = readParam(params, 'error');

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 16 }}>
      {message ? <section style={{ border: '1px solid #abefc6', background: '#ecfdf3', color: '#067647', borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: '1px solid #fda29b', background: '#fff5f4', color: '#b42318', borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle()}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4f46e5' }}>Sales groundwork</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Quotes & invoice foundations</h1>
        <p style={{ margin: 0, color: '#475467', lineHeight: 1.6 }}>
          This stage introduces local quote and invoice records plus recipe-aware line snapshots, ready for later MYOB commercial sync.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16, alignItems: 'start' }}>
        <form action={createDraftQuoteAction} style={{ ...cardStyle(), display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0 }}>Create draft quote</h2>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Customer</span>
            <select name="customerId" defaultValue="" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }}>
              <option value="">No customer yet</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Quote title</span>
            <input name="title" placeholder="Tender Edge internal groundwork quote" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Attention name</span>
            <input name="attentionName" placeholder="Site contact" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Site address</span>
            <textarea name="siteAddress" rows={3} placeholder="Install or delivery address" style={{ borderRadius: 12, border: '1px solid #d0d5dd', padding: 14, fontSize: 16 }} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Product</span>
            <select name="productId" defaultValue="" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }}>
              <option value="">Unlinked line</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Line title</span>
            <input name="lineTitle" required placeholder="Corflute signage package" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Line subtitle</span>
            <input name="lineSubtitle" placeholder="Recipe/BOM snapshot ready" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Selection summary</span>
            <textarea name="selectionSummary" rows={2} defaultValue="Product recipe snapshot groundwork" style={{ borderRadius: 12, border: '1px solid #d0d5dd', padding: 14, fontSize: 16 }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Qty</span>
              <input name="qty" defaultValue="1" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }} />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Unit price</span>
              <input name="unitPrice" defaultValue="0" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }} />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Cost total</span>
              <input name="costTotal" defaultValue="0" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 16 }} />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Notes</span>
            <textarea name="notes" rows={2} placeholder="Internal quote groundwork notes" style={{ borderRadius: 12, border: '1px solid #d0d5dd', padding: 14, fontSize: 16 }} />
          </label>
          <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Create draft quote</button>
        </form>

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0 }}>Recent quotes</h2>
            {quotes.length === 0 ? <p style={{ color: '#475467' }}>No local quotes yet.</p> : (
              <div style={{ display: 'grid', gap: 12 }}>
                {quotes.map((quote) => (
                  <div key={quote.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{quote.quoteNumber}</div>
                        <div style={{ marginTop: 4, color: '#475467', fontSize: 14 }}>{quote.title || 'Untitled quote'} · {quote.customerDisplayName || 'No customer'}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#667085', textTransform: 'uppercase' }}>{quote.status}</div>
                    </div>
                    <div style={{ marginTop: 8, color: '#475467', fontSize: 14 }}>Subtotal ${quote.subtotal} · Grand total ${quote.grandTotal}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0 }}>Recent quote lines</h2>
            {quoteLines.length === 0 ? <p style={{ color: '#475467' }}>No quote lines yet.</p> : (
              <div style={{ display: 'grid', gap: 12 }}>
                {quoteLines.slice(0, 8).map((line) => (
                  <div key={line.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}>
                    <div style={{ fontWeight: 700 }}>{line.displayTitle}</div>
                    <div style={{ marginTop: 4, color: '#475467', fontSize: 14 }}>{line.displaySubtitle || 'No subtitle'} · Qty {line.qty} · Line total ${line.lineTotal}</div>
                    <div style={{ marginTop: 6, color: '#667085', fontSize: 13 }}>{line.selectionSummary}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0 }}>Invoice groundwork</h2>
            <p style={{ color: '#475467', lineHeight: 1.6 }}>
              Local invoice tables are now in place so approved quotes can later create MYOB-ready commercial records without losing the original line snapshots.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}>
                <div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>Invoices</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{invoices.length}</div>
              </div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}>
                <div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>Products ready</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{products.length}</div>
              </div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}>
                <div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>Customers ready</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{customers.length}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
