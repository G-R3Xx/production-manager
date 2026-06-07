import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import { listCustomersForTenant } from "@/server/customers";
import { listInvoicesForTenant, listQuotesForTenant, listRecentQuoteLinesForTenant } from "@/server/quotes";
import { listProductRecipesForTenant } from "@/server/recipes";
import { createDraftQuoteAction } from "./actions";

type QuotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 24 } as const;
const inputStyle = { minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 15 } as const;
const textareaStyle = { borderRadius: 12, border: '1px solid #d0d5dd', padding: 14, fontSize: 15 } as const;

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect('/bootstrap');
  }

  const [products, customers, quotes, quoteLines, invoices, recipes] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listCustomersForTenant(activeTenant.tenantId),
    listQuotesForTenant(activeTenant.tenantId),
    listRecentQuoteLinesForTenant(activeTenant.tenantId),
    listInvoicesForTenant(activeTenant.tenantId),
    listProductRecipesForTenant(activeTenant.tenantId)
  ]);

  const params = (await searchParams) ?? {};
  const message = readParam(params, 'message');
  const error = readParam(params, 'error');

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gap: 20 }}>
      {message ? <section style={{ border: '1px solid #abefc6', background: '#ecfdf3', color: '#067647', borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: '1px solid #fda29b', background: '#fff5f4', color: '#b42318', borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4f46e5' }}>Sales groundwork</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Quotes & invoice foundations</h1>
        <p style={{ margin: 0, color: '#475467', lineHeight: 1.6 }}>
          This is now laid out as a usable internal quote builder. Products are the sellable lines, while recipes and materials stay behind the scenes to preserve costing and stock allocation snapshots later.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Customers ready</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{customers.length}</div><div style={{ marginTop: 8, color: '#475467' }}>Imported MYOB customers available to quote</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Products ready</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{products.length}</div><div style={{ marginTop: 8, color: '#475467' }}>Sellable products available for lines</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Recipes ready</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{recipes.length}</div><div style={{ marginTop: 8, color: '#475467' }}>Recipe foundations available for snapshotting later</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Invoices groundwork</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{invoices.length}</div><div style={{ marginTop: 8, color: '#475467' }}>Local invoice records staged for MYOB sync later</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 520px) 1fr', gap: 20, alignItems: 'start' }}>
        <form action={createDraftQuoteAction} style={{ ...cardStyle, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0 }}>Create draft quote</h2>
          <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Customer</span><select name="customerId" defaultValue="" style={inputStyle}><option value="">No customer yet</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}</select></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Quote title</span><input name="title" placeholder="Tender Edge groundwork quote" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Attention name</span><input name="attentionName" placeholder="Site contact" style={inputStyle} /></label>
          </div>
          <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Site address</span><textarea name="siteAddress" rows={3} placeholder="Install or delivery address" style={textareaStyle} /></label>
          <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Product</span><select name="productId" defaultValue="" style={inputStyle}><option value="">Unlinked line</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Line title</span><input name="lineTitle" required placeholder="Corflute signage package" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Line subtitle</span><input name="lineSubtitle" placeholder="Recipe/BOM snapshot ready" style={inputStyle} /></label>
          </div>
          <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Selection summary</span><textarea name="selectionSummary" rows={2} defaultValue="Product recipe snapshot groundwork" style={textareaStyle} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Qty</span><input name="qty" defaultValue="1" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Unit price</span><input name="unitPrice" defaultValue="0" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Cost total</span><input name="costTotal" defaultValue="0" style={inputStyle} /></label>
          </div>
          <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Notes</span><textarea name="notes" rows={3} placeholder="Internal quote groundwork notes" style={textareaStyle} /></label>
          <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Create draft quote</button>
        </form>

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Recent quotes</h2>
            {quotes.length === 0 ? <div style={{ color: '#475467' }}>No local quotes yet.</div> : (
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

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Recent quote lines</h2>
            {quoteLines.length === 0 ? <div style={{ color: '#475467' }}>No quote lines yet.</div> : (
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

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Invoice groundwork</h2>
            <p style={{ color: '#475467', lineHeight: 1.6 }}>
              Approved quotes will later create MYOB-ready invoices without losing the original recipe/BOM snapshot that was used to price the line.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}><div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>Invoices</div><div style={{ marginTop: 8, fontSize: 30, fontWeight: 700 }}>{invoices.length}</div></div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}><div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>Products ready</div><div style={{ marginTop: 8, fontSize: 30, fontWeight: 700 }}>{products.length}</div></div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}><div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>Customers ready</div><div style={{ marginTop: 8, fontSize: 30, fontWeight: 700 }}>{customers.length}</div></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
