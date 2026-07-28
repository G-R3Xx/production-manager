import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { getProductById } from "@/server/products";
import { listRecipesForTenant, previewRecipeCost } from "@/server/productionResources";
import {
  addSimpleProductQuestionAction,
  deleteSimpleProductQuestionAction,
  moveSimpleProductQuestionAction,
  saveProductBuildAction,
  saveProductGeneralAction,
  saveProductWebsiteAction,
  updateSimpleProductQuestionAction
} from "./actions";

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
const read = (p: Record<string, string | string[] | undefined>, key: string) => Array.isArray(p[key]) ? p[key]?.[0] ?? "" : p[key] ?? "";
const asObject = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const card = { border: "1px solid #dbe4f0", borderRadius: 20, padding: 21, background: "#fff", boxShadow: "0 10px 30px rgba(15,23,42,.05)" };
const input = { width: "100%", minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 11, padding: "0 12px", boxSizing: "border-box" as const, background: "#fff" };
const tabs = [
  ["general", "General"], ["build", "Build"], ["pricing", "Pricing"], ["website", "Website"], ["preview", "Preview"]
] as const;

function fieldDisplay(field: Record<string, any>, config: Record<string, any>): string {
  const displays = asObject(config.fieldDisplays);
  if (displays[field.key]) return String(displays[field.key]);
  if (field.type === "color") return "swatches";
  if (field.type === "size_select") return "cards";
  if (["number", "quantity"].includes(field.type)) return "number";
  if (field.type === "text") return "text";
  return asArray(field.options).length > 6 ? "dropdown" : "buttons";
}

function OptionPreview({ field, display }: { field: Record<string, any>; display: string }) {
  const options = asArray(field.options).slice(0, 8);
  if (["number", "text"].includes(display)) return <input disabled placeholder={display === "number" ? "Enter a number" : "Enter text"} style={input} />;
  if (display === "dropdown") return <select disabled style={input}><option>{options[0]?.label ?? "Choose an option"}</option></select>;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{options.map((option, index) => <span key={option.id ?? index} style={{ padding: display === "cards" ? "13px 15px" : "9px 12px", border: index === 0 ? "2px solid #2563eb" : "1px solid #cbd5e1", borderRadius: display === "swatches" ? 999 : 11, background: index === 0 ? "#eff6ff" : "#fff", fontWeight: 800 }}>{option.label ?? option.value}</span>)}</div>;
}

function questionOptionsText(field: Record<string, any>): string {
  return asArray(field.options).map((option) => {
    const label = String(option.label ?? option.value ?? "");
    const value = String(option.value ?? "");
    const price = Number(option.priceDelta ?? 0);
    return `${label}${value && value !== label ? `=${value}` : ""}${price ? `|${price}` : ""}`;
  }).join("\n");
}

export default async function ProductEditorPage({ params, searchParams }: Props) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const [{ id }, query] = await Promise.all([params, searchParams ?? Promise.resolve({})]);
  const [product, recipes] = await Promise.all([getProductById(tenant.tenantId, id), listRecipesForTenant(tenant.tenantId)]);
  if (!product) notFound();
  const template = product.defaultTemplateId ? await getConfiguratorTemplateById(tenant.tenantId, product.defaultTemplateId).catch(() => null) : null;
  const definition = asObject(template?.definitionJson);
  const fields = asArray(definition.fields);
  const components = asArray(definition.components);
  const config = asObject(product.websiteConfigJson);
  const requestedTab = read(query, "tab") || "general";
  const tab = tabs.some(([value]) => value === requestedTab) ? requestedTab : "general";
  const message = read(query, "message");
  const error = read(query, "error");
  const width = Math.max(1, Number(read(query, "width") || config.defaultWidthMm || 600));
  const height = Math.max(1, Number(read(query, "height") || config.defaultHeightMm || 450));
  const quantity = Math.max(1, Number(read(query, "quantity") || config.defaultQuantity || 1));
  const pricingPreview = tab === "pricing" && product.productionRecipeId
    ? await previewRecipeCost(tenant.tenantId, product.productionRecipeId, width, height, quantity).catch(() => null)
    : null;

  return <main style={{ display: "grid", gap: 18 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}>
      <div>
        <Link href="/products" style={{ color: "#475569", textDecoration: "none", fontWeight: 850 }}>← Products</Link>
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 950, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".08em" }}>Product editor</div>
        <h1 style={{ margin: "6px 0", fontSize: 38 }}>{product.name}</h1>
        <div style={{ color: "#64748b" }}>{product.sku || "No SKU"} · {product.department.replace(/_/g," ")} · {fields.length} customer question{fields.length === 1 ? "" : "s"}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 950, background: product.websiteEnabled ? "#dcfce7" : "#e2e8f0", color: product.websiteEnabled ? "#166534" : "#475569" }}>{product.websiteEnabled ? "Website published" : "Website hidden"}</span>
        <Link href={`/products/advanced?selected=${product.id}`} style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 11, padding: "9px 12px", color: "#334155", fontWeight: 850 }}>Advanced setup</Link>
      </div>
    </header>

    {message ? <div style={{ padding: 13, borderRadius: 13, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", fontWeight: 850 }}>{message}</div> : null}
    {error ? <div style={{ padding: 13, borderRadius: 13, background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", fontWeight: 850 }}>{error}</div> : null}

    <nav style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, padding: 7, borderRadius: 16, background: "#e9eef6" }}>
      {tabs.map(([value,label]) => <Link key={value} href={`/products/${product.id}?tab=${value}`} style={{ textDecoration: "none", textAlign: "center", padding: "11px 10px", borderRadius: 11, background: tab === value ? "#fff" : "transparent", color: tab === value ? "#0f172a" : "#64748b", fontWeight: 950, boxShadow: tab === value ? "0 4px 14px rgba(15,23,42,.08)" : "none" }}>{label}</Link>)}
    </nav>

    {tab === "general" ? <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><h2 style={{ margin: 0 }}>General</h2><p style={{ color: "#64748b" }}>The core product record shared by quoting, production and the website.</p></div></div>
      <form action={saveProductGeneralAction} style={{ display: "grid", gap: 14 }}>
        <input type="hidden" name="productId" value={product.id} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}><label style={{ display:"grid",gap:7,fontWeight:850 }}>Product name<input name="name" defaultValue={product.name} required style={input} /></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>SKU<input name="sku" defaultValue={product.sku ?? ""} style={input} /></label></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <label style={{ display:"grid",gap:7,fontWeight:850 }}>Department<select name="department" defaultValue={product.department} style={input}>{["signage","small_format","plan_printing","poster_printing","installation","general"].map(value=><option key={value} value={value}>{value.replace(/_/g," ")}</option>)}</select></label>
          <label style={{ display:"grid",gap:7,fontWeight:850 }}>Product family<select name="productFamily" defaultValue={product.productFamily} style={input}>{["rigid_signage","roll_media","banners","stickers_labels","window_wall_graphics","vehicle_graphics","display_products","small_format_print"].map(value=><option key={value} value={value}>{value.replace(/_/g," ")}</option>)}</select></label>
          <label style={{ display:"grid",gap:7,fontWeight:850 }}>Status<select name="status" defaultValue={product.status} style={input}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
        </div>
        <button style={{ justifySelf:"start",minHeight:44,border:0,borderRadius:11,background:"#2563eb",color:"#fff",fontWeight:950,padding:"0 18px",cursor:"pointer" }}>Save general details</button>
      </form>
    </section> : null}

    {tab === "build" ? <section style={{ display: "grid", gap: 16 }}>
      <div style={card}><h2 style={{ marginTop: 0 }}>Build</h2><p style={{ color:"#64748b",lineHeight:1.6 }}>Choose the manufacturing method that resolves materials, machines, labour and costing. Customer questions remain visual cards instead of exposing production resources.</p>
        <form action={saveProductBuildAction} style={{ display:"grid",gridTemplateColumns:"minmax(280px,1fr) auto",gap:10,alignItems:"end" }}><input type="hidden" name="productId" value={product.id}/><label style={{ display:"grid",gap:7,fontWeight:850 }}>Manufacturing method<select name="productionRecipeId" defaultValue={product.productionRecipeId ?? ""} style={input}><option value="">No manufacturing method</option>{recipes.filter(recipe=>recipe.active).map(recipe=><option key={recipe.id} value={recipe.id}>{recipe.name} · {recipe.department}</option>)}</select></label><button style={{ minHeight:44,border:0,borderRadius:11,background:"#0f766e",color:"#fff",fontWeight:950,padding:"0 18px",cursor:"pointer" }}>Save build</button></form>
      </div>
      <div style={card}>
        <div style={{ display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap" }}><div><h2 style={{ margin:0 }}>Customer questions</h2><p style={{ margin:"6px 0 0",color:"#64748b" }}>Arrange the website-style questions customers answer. Detailed material triggers and legacy rules remain under Advanced setup.</p></div><Link href={`/products/advanced?selected=${product.id}`} style={{ textDecoration:"none",border:"1px solid #cbd5e1",color:"#334155",borderRadius:11,padding:"10px 14px",fontWeight:900 }}>Advanced rules</Link></div>
        <div style={{ display:"grid",gap:11,marginTop:16 }}>
          {fields.map((field,index)=><details key={field.id ?? index} open={fields.length <= 4} style={{ border:"1px solid #dbe4f0",borderRadius:15,background:"#f8fafc",overflow:"hidden" }}>
            <summary style={{ cursor:"pointer",padding:15,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",listStyle:"none" }}><span style={{ display:"flex",gap:11,alignItems:"center" }}><span style={{ width:29,height:29,borderRadius:999,display:"grid",placeItems:"center",background:"#2563eb",color:"#fff",fontSize:12,fontWeight:950 }}>{index+1}</span><span><b>{field.label}</b><span style={{ display:"block",fontSize:12,color:"#64748b",marginTop:2 }}>{String(field.type ?? "select").replace(/_/g," ")} · {asArray(field.options).length} choices {field.showWhen?.optionKey ? `· conditional` : ""}</span></span></span><span style={{ color:"#64748b",fontWeight:900 }}>Edit</span></summary>
            <div style={{ borderTop:"1px solid #dbe4f0",padding:15,background:"#fff" }}>
              <form action={updateSimpleProductQuestionAction} style={{ display:"grid",gap:11 }}>
                <input type="hidden" name="productId" value={product.id}/><input type="hidden" name="fieldId" value={field.id}/>
                <div style={{ display:"grid",gridTemplateColumns:"minmax(220px,1.4fr) minmax(180px,.6fr)",gap:10 }}><label style={{ display:"grid",gap:6,fontWeight:850 }}>Question<input name="label" defaultValue={field.label} required style={input}/></label><label style={{ display:"grid",gap:6,fontWeight:850 }}>Answer type<select name="type" defaultValue={field.type ?? "select"} style={input}><option value="select">Single choice</option><option value="multi_select">Multiple choice</option><option value="size_select">Size cards</option><option value="yes_no">Yes / no</option><option value="quantity">Quantity</option><option value="color">Colour swatches</option><option value="number">Number</option><option value="text">Text</option></select></label></div>
                <label style={{ display:"grid",gap:6,fontWeight:850 }}>Choices <span style={{ color:"#64748b",fontSize:12,fontWeight:650 }}>One per line. Optional: Label=value|price adjustment</span><textarea name="options" defaultValue={questionOptionsText(field)} rows={Math.max(3,Math.min(7,asArray(field.options).length+1))} style={{ ...input,padding:11,fontFamily:"inherit" }}/></label>
                <label style={{ display:"grid",gap:6,fontWeight:850 }}>Help text<input name="helpText" defaultValue={field.helpText ?? ""} placeholder="Optional guidance shown below the question" style={input}/></label>
                <label style={{ display:"flex",gap:9,alignItems:"center",fontWeight:850 }}><input type="checkbox" name="required" defaultChecked={Boolean(field.required)}/> Customer must answer this question</label>
                {field.showWhen?.optionKey ? <div style={{ padding:10,borderRadius:10,background:"#f5f3ff",color:"#6d28d9",fontSize:13 }}>Shown only when <b>{field.showWhen.optionKey}</b> is {asArray(field.showWhen.optionValues).join(", ") || "selected"}. Edit this dependency in Advanced rules.</div> : null}
                <button style={{ justifySelf:"start",minHeight:41,border:0,borderRadius:10,background:"#2563eb",color:"#fff",fontWeight:900,padding:"0 15px",cursor:"pointer" }}>Save question</button>
              </form>
              <div style={{ display:"flex",gap:7,marginTop:12,paddingTop:12,borderTop:"1px solid #eef2f7",flexWrap:"wrap" }}>
                <form action={moveSimpleProductQuestionAction}><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="fieldId" value={field.id}/><input type="hidden" name="direction" value="up"/><button disabled={index===0} style={{ border:"1px solid #cbd5e1",borderRadius:9,background:"#fff",padding:"7px 10px",fontWeight:850,cursor:index===0?"not-allowed":"pointer" }}>↑ Earlier</button></form>
                <form action={moveSimpleProductQuestionAction}><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="fieldId" value={field.id}/><input type="hidden" name="direction" value="down"/><button disabled={index===fields.length-1} style={{ border:"1px solid #cbd5e1",borderRadius:9,background:"#fff",padding:"7px 10px",fontWeight:850,cursor:index===fields.length-1?"not-allowed":"pointer" }}>↓ Later</button></form>
                <form action={deleteSimpleProductQuestionAction} style={{ marginLeft:"auto" }}><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="fieldId" value={field.id}/><button style={{ border:"1px solid #fecaca",borderRadius:9,background:"#fff",color:"#b91c1c",padding:"7px 10px",fontWeight:850,cursor:"pointer" }}>Remove question</button></form>
              </div>
            </div>
          </details>)}
        </div>
        {fields.length === 0 ? <div style={{ marginTop:16,padding:18,borderRadius:14,background:"#fff7ed",border:"1px solid #fed7aa",color:"#9a3412" }}>No customer questions yet. Add the first question below.</div> : null}
        <form action={addSimpleProductQuestionAction} style={{ display:"grid",gap:11,marginTop:16,padding:16,borderRadius:15,background:"#eff6ff",border:"1px solid #bfdbfe" }}>
          <input type="hidden" name="productId" value={product.id}/><h3 style={{ margin:0 }}>+ Add customer question</h3>
          <div style={{ display:"grid",gridTemplateColumns:"minmax(220px,1.4fr) minmax(180px,.6fr)",gap:10 }}><label style={{ display:"grid",gap:6,fontWeight:850 }}>Question<input name="label" placeholder="eg Size, Material, Laminate" required style={input}/></label><label style={{ display:"grid",gap:6,fontWeight:850 }}>Answer type<select name="type" defaultValue="select" style={input}><option value="select">Single choice</option><option value="multi_select">Multiple choice</option><option value="size_select">Size cards</option><option value="yes_no">Yes / no</option><option value="quantity">Quantity</option><option value="color">Colour swatches</option><option value="number">Number</option><option value="text">Text</option></select></label></div>
          <label style={{ display:"grid",gap:6,fontWeight:850 }}>Choices<textarea name="options" rows={4} placeholder={"600 × 900 mm=600x900\n900 × 1200 mm=900x1200\nCustom size=custom"} style={{ ...input,padding:11,fontFamily:"inherit" }}/></label>
          <label style={{ display:"grid",gap:6,fontWeight:850 }}>Help text<input name="helpText" placeholder="Optional customer guidance" style={input}/></label>
          <label style={{ display:"flex",gap:9,alignItems:"center",fontWeight:850 }}><input type="checkbox" name="required" defaultChecked/> Required question</label>
          <button style={{ justifySelf:"start",minHeight:42,border:0,borderRadius:10,background:"#0f172a",color:"#fff",fontWeight:900,padding:"0 16px",cursor:"pointer" }}>Add question</button>
        </form>
      </div>
    </section> : null}

    {tab === "pricing" ? <section style={{ display:"grid",gap:16 }}>
      <div style={card}><h2 style={{ marginTop:0 }}>Pricing</h2><p style={{ color:"#64748b",lineHeight:1.6 }}>The same manufacturing method calculates internal cost and website price. There is no separate WordPress price table.</p>
        {product.productionRecipeId ? <form method="get" style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr) auto",gap:10 }}><input type="hidden" name="tab" value="pricing"/><label style={{ display:"grid",gap:7,fontWeight:850 }}>Width mm<input name="width" type="number" defaultValue={width} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Height mm<input name="height" type="number" defaultValue={height} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Quantity<input name="quantity" type="number" defaultValue={quantity} style={input}/></label><button style={{ minHeight:44,alignSelf:"end",border:0,borderRadius:11,background:"#0f172a",color:"#fff",fontWeight:950,padding:"0 18px",cursor:"pointer" }}>Calculate</button></form> : <div style={{ padding:16,borderRadius:14,background:"#fff7ed",border:"1px solid #fed7aa",color:"#9a3412" }}>Choose a manufacturing method on the Build tab first.</div>}
      </div>
      {pricingPreview ? <div style={{ ...card,background:"linear-gradient(180deg,#f0fdfa,#fff)" }}><div style={{ display:"flex",justifyContent:"space-between",gap:14 }}><div><div style={{ fontSize:12,fontWeight:900,color:"#0f766e",textTransform:"uppercase" }}>Live shared calculation</div><h2 style={{ margin:"6px 0" }}>{width} × {height} mm · Qty {quantity}</h2></div><Link href="/manufacturing-methods" style={{ color:"#0f766e",fontWeight:900 }}>Edit manufacturing method →</Link></div><div style={{ display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:9,marginTop:14 }}>{[["Material",pricingPreview.materialCost],["Machines",pricingPreview.machineCost],["Ink",pricingPreview.inkCost],["Labour",pricingPreview.labourCost],["Total cost",pricingPreview.totalCost],["Sell price",pricingPreview.sellPrice]].map(([label,value])=><div key={String(label)} style={{ padding:13,borderRadius:12,background:"#fff",border:"1px solid #ccfbf1" }}><div style={{ fontSize:12,color:"#64748b" }}>{label}</div><div style={{ marginTop:5,fontSize:20,fontWeight:950 }}>${Number(value).toFixed(2)}</div></div>)}</div></div> : null}
    </section> : null}

    {tab === "website" ? <section style={card}>
      <div style={{ display:"flex",justifyContent:"space-between",gap:16 }}><div><h2 style={{ margin:0 }}>Website</h2><p style={{ color:"#64748b",lineHeight:1.6 }}>Control what WordPress receives. WooCommerce products remain normal products, but their builder configuration comes from here.</p></div><Link href="/integrations/wordpress" style={{ color:"#6d28d9",fontWeight:900 }}>Connection settings →</Link></div>
      <form action={saveProductWebsiteAction} style={{ display:"grid",gap:16 }}>
        <input type="hidden" name="productId" value={product.id}/>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <label style={{ display:"flex",alignItems:"center",gap:10,padding:15,border:"1px solid #dbe4f0",borderRadius:14,fontWeight:900 }}><input type="checkbox" name="websiteEnabled" defaultChecked={product.websiteEnabled}/> Publish this product to WordPress</label>
          <label style={{ display:"grid",gap:7,fontWeight:850 }}>Selling mode<select name="websiteMode" defaultValue={product.websiteMode || "quote_only"} style={input}><option value="live_checkout">Live price + WooCommerce checkout</option><option value="quote_only">Request a quote only</option></select></label>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}><label style={{ display:"grid",gap:7,fontWeight:850 }}>Website URL slug<input name="websiteSlug" defaultValue={product.websiteSlug ?? ""} placeholder="Generated from product name" style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Website category<input name="websiteCategory" defaultValue={product.websiteCategory ?? ""} placeholder="Signs, Plans, Stickers…" style={input}/></label></div>
        <label style={{ display:"grid",gap:7,fontWeight:850 }}>Short description<textarea name="websiteShortDescription" defaultValue={product.websiteShortDescription ?? ""} rows={3} style={{ ...input,padding:12 }}/></label>
        <label style={{ display:"grid",gap:7,fontWeight:850 }}>Full description<textarea name="websiteDescription" defaultValue={product.websiteDescription ?? ""} rows={6} style={{ ...input,padding:12 }}/></label>
        <label style={{ display:"grid",gap:7,fontWeight:850 }}>Product image URL<input name="websiteImageUrl" defaultValue={product.websiteImageUrl ?? ""} placeholder="https://…" style={input}/></label>
        <div><h3 style={{ marginBottom:8 }}>Default price preview</h3><div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}><label style={{ display:"grid",gap:7,fontWeight:850 }}>Width mm<input name="defaultWidthMm" type="number" defaultValue={config.defaultWidthMm ?? 600} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Height mm<input name="defaultHeightMm" type="number" defaultValue={config.defaultHeightMm ?? 450} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Quantity<input name="defaultQuantity" type="number" defaultValue={config.defaultQuantity ?? 1} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Fallback base price<input name="basePrice" type="number" step="0.01" defaultValue={config.basePrice ?? 0} style={input}/></label></div></div>
        {fields.length ? <div><h3 style={{ marginBottom:8 }}>Website question style</h3><div style={{ display:"grid",gap:9 }}>{fields.map((field,index)=><div key={field.id ?? index} style={{ display:"grid",gridTemplateColumns:"1fr 220px",gap:12,alignItems:"center",padding:12,border:"1px solid #e2e8f0",borderRadius:13,background:"#f8fafc" }}><div><b>{field.label}</b><div style={{ color:"#64748b",fontSize:13,marginTop:3 }}>{field.type?.replace(/_/g," ")} · {asArray(field.options).length} options</div></div><select name={`display:${field.key}`} defaultValue={fieldDisplay(field,config)} style={input}><option value="buttons">Buttons</option><option value="cards">Cards</option><option value="dropdown">Dropdown</option><option value="swatches">Swatches</option><option value="number">Number field</option><option value="text">Text field</option></select></div>)}</div></div> : null}
        <button style={{ justifySelf:"start",minHeight:44,border:0,borderRadius:11,background:"#7c3aed",color:"#fff",fontWeight:950,padding:"0 18px",cursor:"pointer" }}>Save website settings</button>
      </form>
    </section> : null}

    {tab === "preview" ? <section style={{ display:"grid",gridTemplateColumns:"minmax(0,1.1fr) minmax(320px,.9fr)",gap:16 }}>
      <div style={{ ...card,padding:0,overflow:"hidden" }}><div style={{ minHeight:240,background:product.websiteImageUrl?`url(${product.websiteImageUrl}) center/cover`:`linear-gradient(135deg,#dbeafe,#f5f3ff)`,display:"grid",placeItems:"center",color:"#475569",fontWeight:900 }}>{product.websiteImageUrl ? "" : "Product image"}</div><div style={{ padding:22 }}><div style={{ fontSize:12,fontWeight:900,color:"#7c3aed",textTransform:"uppercase" }}>{product.websiteCategory || product.department.replace(/_/g," ")}</div><h2 style={{ fontSize:31,margin:"7px 0" }}>{product.name}</h2><p style={{ color:"#64748b",lineHeight:1.6 }}>{product.websiteShortDescription || "Add a short website description on the Website tab."}</p><div style={{ marginTop:16,fontSize:23,fontWeight:950 }}>{product.websiteMode === "quote_only" ? "Request a quote" : "Live price calculated from your choices"}</div></div></div>
      <div style={card}><div style={{ fontSize:12,fontWeight:900,color:"#2563eb",textTransform:"uppercase" }}>Build your order</div><div style={{ display:"grid",gap:17,marginTop:14 }}>{fields.map((field,index)=><section key={field.id ?? index}><div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}><span style={{ width:25,height:25,borderRadius:999,background:"#2563eb",color:"#fff",display:"grid",placeItems:"center",fontSize:12,fontWeight:950 }}>{index+1}</span><b>{field.label}</b></div><OptionPreview field={field} display={fieldDisplay(field,config)}/></section>)}</div>{fields.length===0?<p style={{ color:"#64748b" }}>No customer questions configured.</p>:null}<button style={{ width:"100%",minHeight:48,marginTop:20,border:0,borderRadius:13,background:product.websiteMode==="quote_only"?"#7c3aed":"#2563eb",color:"#fff",fontWeight:950 }}>{product.websiteMode==="quote_only"?"Request a quote":"Add configured product"}</button></div>
    </section> : null}
  </main>;
}
