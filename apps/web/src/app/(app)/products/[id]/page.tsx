import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { getProductById } from "@/server/products";
import { listMaterialsForTenant } from "@/server/materials";
import {
  listProcessesForTenant,
  listRecipesForTenant,
  previewRecipeCost
} from "@/server/productionResources";
import { normalizeProductionFlowName } from "@/lib/productionFlowPresets";
import { ProductProductionFlowBuilder } from "./ProductProductionFlowBuilder";
import { WebsiteImageManager, type WebsiteImageItem } from "./WebsiteImageManager";
import {
  addSimpleProductQuestionAction,
  deleteSimpleProductQuestionAction,
  moveSimpleProductQuestionAction,
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
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const tabs = [
  ["build", "Guided builder"], ["pricing", "Price check"], ["preview", "Summary"], ["general", "Product details"]
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


function normaliseSharedField(field: Record<string, any>): Record<string, any> {
  const key = String(field.key ?? "");
  if (key === "finished_size") {
    const options = asArray(field.options);
    return {
      ...field,
      label: "Finished size",
      helpText: "Choose the finished size. Select Custom size to enter different dimensions.",
      options: options.some((option) => String(option?.value ?? "").toLowerCase() === "custom")
        ? options
        : [...options, { id: `custom-${field.id ?? "size"}`, label: "Custom size", value: "custom", priceDelta: 0, widthMm: null, heightMm: null }]
    };
  }
  if (key === "quantity") return { ...field, label: "Quantity", helpText: "Number of finished items required." };
  if (key === "print_method") return {
    ...field,
    label: "Print method",
    helpText: "Choose how the product is normally printed.",
    options: asArray(field.options).map((option) => ["roll_stock", "roll_print"].includes(String(option?.value ?? "")) ? { ...option, label: "Roll print", value: "roll_stock" } : option)
  };
  if (key === "artwork") return { ...field, label: "Artwork", helpText: "Choose whether print-ready artwork is supplied, needs checking, or requires design work." };
  if (key === "delivery_method") return { ...field, label: "How does the customer receive it?", helpText: "Choose pickup, delivery or installation." };
  return field;
}

function sharedFieldOrder(field: Record<string, any>, index: number): number {
  const order = ["finished_size", "print_method", "ink", "laminate", "finishing", "eyelet_placement", "eyelet_custom_quantity", "artwork", "delivery_method"];
  const standard = order.indexOf(String(field.key ?? ""));
  return standard >= 0 ? standard : 1000 + index;
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
  const product = await getProductById(tenant.tenantId, id);
  if (!product) notFound();

  const requestedTab = read(query, "tab") || "build";
  const tab = requestedTab === "website" || tabs.some(([value]) => value === requestedTab) ? requestedTab : "build";
  const templateNeeded = ["build", "preview", "website"].includes(tab);
  const template = templateNeeded && product.defaultTemplateId ? await getConfiguratorTemplateById(tenant.tenantId, product.defaultTemplateId).catch(() => null) : null;
  const definition = asObject(template?.definitionJson);
  const fields = asArray(definition.fields)
    .map((field) => normaliseSharedField(asObject(field)))
    .filter((field) => String(field.key ?? "") !== "quantity")
    .map((field, index) => ({ field, order: sharedFieldOrder(field, index) }))
    .sort((left, right) => left.order - right.order)
    .map(({ field }) => field);
  const definitionComponents = asArray(definition.components).map(asObject);
  const eyeletStockComponent = definitionComponents.find((component) => Boolean(component.materialId) && /eyelet|grommet/i.test(String(component.label ?? "")));
  const eyeletFollowUpComponent = definitionComponents.find((component) => {
    const usage = asObject(component.stockUsage);
    return /eyelet|grommet/i.test(`${String(component.label ?? "")} ${String(usage.quantityPrompt ?? "")}`) && asArray(usage.quantityPresets).length > 0;
  });
  const initialEyeletPreset = String(asObject(asArray(asObject(eyeletFollowUpComponent?.stockUsage).quantityPresets)[0]).value ?? "four_corners");
  const config = asObject(product.websiteConfigJson);
  const configuredWebsiteImages = asArray(config.websiteImages).flatMap((value, index): WebsiteImageItem[] => {
    const image = asObject(value);
    const url = String(image.url ?? "").trim();
    if (!url) return [];
    return [{
      id: String(image.id ?? `website-image-${index + 1}`),
      url,
      alt: String(image.alt ?? product.name),
      storagePath: image.storagePath ? String(image.storagePath) : null
    }];
  });
  const initialWebsiteImages: WebsiteImageItem[] = configuredWebsiteImages.length
    ? configuredWebsiteImages
    : product.websiteImageUrl
      ? [{ id: "legacy-featured-image", url: product.websiteImageUrl, alt: product.name, storagePath: null }]
      : [];
  const initialFeaturedWebsiteImageId = String(config.websiteFeaturedImageId ?? initialWebsiteImages[0]?.id ?? "") || null;
  const fieldByKey = (key: string) => fields.find((field) => String(field.key ?? "") === key) ?? null;
  const optionValues = (field: Record<string, any> | null) => asArray(field?.options).map((option) => String(option?.value ?? option?.label ?? "")).filter(Boolean);
  const printField = fieldByKey("print_method") ?? fieldByKey("print_type");
  const normalisePrintMethod = (value: string) => ["roll_print", "roll_stock_applied"].includes(value) ? "roll_stock" : value;
  const initialPrintOptions = Array.from(new Set(optionValues(printField).map(normalisePrintMethod)));
  const initialDefaultPrintMethod = normalisePrintMethod(String(printField?.defaultValue ?? config?.internalPrintMethod ?? "none"));
  const rollMediaComponent = definitionComponents.find((component) => {
    const trigger = asObject(component.trigger);
    const usage = asObject(component.stockUsage);
    const key = String(trigger.optionKey ?? usage.optionKey ?? "");
    const values = asArray(trigger.optionValues).concat(asArray(usage.optionValues)).map(String);
    return Boolean(component.materialId) && key === "print_method" && values.some((value) => ["roll_stock", "roll_print", "roll_stock_applied"].includes(value));
  });
  const inkField = fieldByKey("ink") ?? fieldByKey("white_ink");
  const initialInkOptions = optionValues(inkField);
  const initialDefaultInk = String(inkField?.defaultValue ?? initialInkOptions[0] ?? "cmyk");
  const artworkField = fieldByKey("artwork");
  const initialArtworkOptions = optionValues(artworkField).length
    ? optionValues(artworkField)
    : ["client_supplied", "artwork_required"];
  const initialDefaultArtwork = String(artworkField?.defaultValue ?? "client_supplied");
  const artworkCheckChoice = asArray(artworkField?.options).find((option) => String(option?.value ?? "") === "artwork_check");
  const artworkDesignChoice = asArray(artworkField?.options).find((option) => String(option?.value ?? "") === "artwork_required");
  const initialArtworkCheckPrice = Math.max(0, Number(artworkCheckChoice?.priceDelta ?? 25) || 0);
  const initialArtworkDesignPrice = Math.max(0, Number(artworkDesignChoice?.priceDelta ?? 120) || 0);
  const deliveryField = fieldByKey("delivery_method");
  const deliveryChoice = asArray(deliveryField?.options).find((option) => String(option?.value ?? "") === "delivery");
  const initialDeliveryFee = Math.max(0, Number(deliveryChoice?.priceDelta ?? 0) || 0);
  const laminateField = fieldByKey("laminate");
  const laminateComponents = definitionComponents.filter((component) => {
    const triggerKey = String(asObject(component.trigger).optionKey ?? asObject(component.stockUsage).optionKey ?? "");
    const label = String(component.label ?? "").toLowerCase();
    return Boolean(component.materialId) && (triggerKey === "laminate" || label.includes("laminate") || label.includes("cello"));
  });
  const initialLaminateMaterialIds = Array.from(new Set(laminateComponents.map((component) => String(component.materialId ?? "")).filter(Boolean)));
  const laminateDefaultRaw = String(laminateField?.defaultValue ?? "none");
  const initialDefaultLaminateMaterialId = initialLaminateMaterialIds.includes(laminateDefaultRaw)
    ? laminateDefaultRaw
    : laminateComponents.find((component) => {
        const values = asArray(asObject(component.trigger).optionValues).concat(asArray(asObject(component.stockUsage).optionValues)).map(String);
        return values.includes(laminateDefaultRaw);
      })?.materialId
      ? String(laminateComponents.find((component) => {
          const values = asArray(asObject(component.trigger).optionValues).concat(asArray(asObject(component.stockUsage).optionValues)).map(String);
          return values.includes(laminateDefaultRaw);
        })?.materialId)
      : "none";
  const finishingField = fieldByKey("finishing");
  const finishingDefaults = String(finishingField?.defaultValue ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const initialFinishingOptions = finishingDefaults.length ? finishingDefaults : optionValues(finishingField);
  const message = read(query, "message");
  const error = read(query, "error");
  const width = Math.max(1, Number(read(query, "width") || config.defaultWidthMm || 600));
  const height = Math.max(1, Number(read(query, "height") || config.defaultHeightMm || 450));
  const quantity = Math.max(1, Number(read(query, "quantity") || config.defaultQuantity || 1));

  let recipes: Awaited<ReturnType<typeof listRecipesForTenant>> = [];
  let materials: Awaited<ReturnType<typeof listMaterialsForTenant>> = [];
  let processes: Awaited<ReturnType<typeof listProcessesForTenant>> = [];
  if (tab === "build" || tab === "preview") {
    [recipes, materials, processes] = await Promise.all([
      listRecipesForTenant(tenant.tenantId),
      listMaterialsForTenant(tenant.tenantId),
      listProcessesForTenant(tenant.tenantId)
    ]);
  }
  const currentRecipe = recipes.find((recipe) => recipe.id === product.productionRecipeId) ?? null;
  const currentProcessSteps = currentRecipe?.processSteps.length
    ? currentRecipe.processSteps
    : currentRecipe?.processIds.map((processId) => ({ processId, machineId: null, labourOperationId: null })) ?? [];
  const initialProductionSteps = currentProcessSteps.flatMap((step) => {
    const process = processes.find((item) => item.id === step.processId);
    if (!process) return [];
    return [{
      processToken: process.id,
      name: process.name,
      processType: process.processType,
      machineId: step.machineId,
      labourOperationId: step.labourOperationId
    }];
  });
  const pricingPreview = (["pricing", "build", "preview"].includes(tab)) && product.productionRecipeId
    ? await previewRecipeCost(tenant.tenantId, product.productionRecipeId, width, height, quantity).catch(() => null)
    : null;

  return <main style={{ display: "grid", gap: 18 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}>
      <div>
        <Link href="/products" style={{ color: "#475569", textDecoration: "none", fontWeight: 850 }}>← Products</Link>
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 950, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".08em" }}>Internal product setup</div>
        <h1 style={{ margin: "6px 0", fontSize: 38 }}>{product.name}</h1>
        <div style={{ color: "#64748b" }}>{product.sku || "No SKU"} · {product.department.replace(/_/g," ")} · {product.status === "active" ? "Ready for quoting" : product.status}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {product.websiteEnabled ? <span style={{ borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 950, background: "#dcfce7", color: "#166534" }}>Also published online</span> : null}
        <Link href={`/products/${product.id}?tab=website`} style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 11, padding: "9px 12px", color: "#475569", fontWeight: 850 }}>Website publishing (optional)</Link>
        <Link href={`/products/advanced?selected=${product.id}`} style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 11, padding: "9px 12px", color: "#334155", fontWeight: 850 }}>Advanced setup</Link>
      </div>
    </header>

    {message ? <div style={{ padding: 13, borderRadius: 13, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", fontWeight: 850 }}>{message}</div> : null}
    {error ? <div style={{ padding: 13, borderRadius: 13, background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", fontWeight: 850 }}>{error}</div> : null}

    <nav style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: 7, borderRadius: 16, background: "#e9eef6" }}>
      {tabs.map(([value,label]) => <Link key={value} href={`/products/${product.id}?tab=${value}`} style={{ textDecoration: "none", textAlign: "center", padding: "11px 10px", borderRadius: 11, background: tab === value ? "#fff" : "transparent", color: tab === value ? "#0f172a" : "#64748b", fontWeight: 950, boxShadow: tab === value ? "0 4px 14px rgba(15,23,42,.08)" : "none" }}>{label}</Link>)}
    </nav>

    {tab === "general" ? <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><h2 style={{ margin: 0 }}>General</h2><p style={{ color: "#64748b" }}>Basic internal details used by quotes, production jobs and reports.</p></div></div>
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
      <ProductProductionFlowBuilder
        productId={product.id}
        department={product.department}
        currentStatus={product.status}
        materials={materials.filter((material) => material.active || material.id === currentRecipe?.materialId).map((material) => ({
          id: material.id,
          name: material.name,
          sku: material.sku,
          notes: material.notes,
          materialType: material.materialType,
          materialGroup: material.materialGroup,
          widthMm: material.widthMm,
          lengthMm: material.lengthMm,
          rollWidthMm: material.rollWidthMm
        }))}
        processes={processes.filter((process) => process.active || currentProcessSteps.some((step) => step.processId === process.id)).map((process) => ({
          id: process.id,
          name: process.name,
          department: process.department,
          processType: process.processType,
          labourOperationId: process.labourOperationId,
          labourOperationName: process.labourOperationName
        }))}
        initialMaterialId={currentRecipe?.materialId ?? ""}
        initialSteps={initialProductionSteps}
        initialDeliveryMethod={String(config.internalDeliveryMethod ?? (initialProductionSteps.some((step) => normalizeProductionFlowName(step.name) === "install") ? "install" : "pickup"))}
        initialPrintOptions={initialPrintOptions}
        initialDefaultPrintMethod={initialDefaultPrintMethod}
        initialRollMediaId={String(rollMediaComponent?.materialId ?? "")}
        initialInkOptions={initialInkOptions}
        initialDefaultInk={initialDefaultInk}
        initialArtworkOptions={initialArtworkOptions}
        initialDefaultArtwork={initialDefaultArtwork}
        initialArtworkCheckPrice={initialArtworkCheckPrice}
        initialArtworkDesignPrice={initialArtworkDesignPrice}
        initialDeliveryFee={initialDeliveryFee}
        initialLaminateMaterialIds={initialLaminateMaterialIds}
        initialDefaultLaminateMaterialId={initialDefaultLaminateMaterialId}
        initialFinishingOptions={initialFinishingOptions}
        initialEyeletMaterialId={String(eyeletStockComponent?.materialId ?? "")}
        initialEyeletPreset={initialEyeletPreset}
        preview={pricingPreview ? {
          materialCost: pricingPreview.materialCost,
          machineCost: pricingPreview.machineCost,
          inkCost: pricingPreview.inkCost,
          labourCost: pricingPreview.labourCost,
          totalCost: pricingPreview.totalCost,
          sellPrice: pricingPreview.sellPrice,
          processBreakdown: pricingPreview.processBreakdown
        } : null}
        previewWidth={width}
        previewHeight={height}
        previewQuantity={quantity}
        initialWastePercent={Number(currentRecipe?.wastePercent ?? 5)}
      />
      <details style={{ ...card,padding:0,overflow:"hidden" }}>
        <summary style={{ cursor:"pointer",padding:18,display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",listStyle:"none" }}><span><span style={{ display:"block",fontSize:12,fontWeight:950,color:"#2563eb",textTransform:"uppercase",letterSpacing:".08em" }}>Optional</span><strong style={{ display:"block",fontSize:20,marginTop:4 }}>Customer choices used in quotes and on the website</strong><span style={{ display:"block",fontSize:13,color:"#64748b",marginTop:4 }}>These exact labels, choices, defaults and order are shared with WordPress when the product is published.</span></span><span style={{ color:"#475569",fontWeight:950 }}>Review shared choices ↓</span></summary>
        <div style={{ padding:21,borderTop:"1px solid #dbe4f0" }}>
          <div style={{ display:"flex",justifyContent:"flex-end",marginBottom:12 }}><Link href={`/products/advanced?selected=${product.id}`} style={{ textDecoration:"none",border:"1px solid #cbd5e1",color:"#334155",borderRadius:11,padding:"10px 14px",fontWeight:900 }}>Advanced rules</Link></div>
        <div style={{ display:"grid",gap:11,marginTop:16 }}>
          {fields.map((field,index)=><details key={field.id ?? index} style={{ border:"1px solid #dbe4f0",borderRadius:15,background:"#f8fafc",overflow:"hidden" }}>
            <summary style={{ cursor:"pointer",padding:15,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",listStyle:"none" }}><span style={{ display:"flex",gap:11,alignItems:"center" }}><span style={{ width:29,height:29,borderRadius:999,display:"grid",placeItems:"center",background:"#2563eb",color:"#fff",fontSize:12,fontWeight:950 }}>{index+1}</span><span><b>{field.label}</b><span style={{ display:"block",fontSize:12,color:"#64748b",marginTop:2 }}>{String(field.type ?? "select").replace(/_/g," ")} · {asArray(field.options).length} choices {field.showWhen?.optionKey ? `· conditional` : ""}</span></span></span><span style={{ color:"#64748b",fontWeight:900 }}>Edit</span></summary>
            <div style={{ borderTop:"1px solid #dbe4f0",padding:15,background:"#fff" }}>
              <form action={updateSimpleProductQuestionAction} style={{ display:"grid",gap:11 }}>
                <input type="hidden" name="productId" value={product.id}/><input type="hidden" name="fieldId" value={field.id}/>
                <div style={{ display:"grid",gridTemplateColumns:"minmax(220px,1.4fr) minmax(180px,.6fr)",gap:10 }}><label style={{ display:"grid",gap:6,fontWeight:850 }}>Question<input name="label" defaultValue={field.label} required style={input}/></label><label style={{ display:"grid",gap:6,fontWeight:850 }}>Answer type<select name="type" defaultValue={field.type ?? "select"} style={input}><option value="select">Single choice</option><option value="multi_select">Multiple choice</option><option value="size_select">Size cards</option><option value="yes_no">Yes / no</option><option value="quantity">Quantity</option><option value="color">Colour swatches</option><option value="number">Number</option><option value="text">Text</option></select></label></div>
                <label style={{ display:"grid",gap:6,fontWeight:850 }}>Choices <span style={{ color:"#64748b",fontSize:12,fontWeight:650 }}>One per line. Optional: Label=value|price adjustment</span><textarea name="options" defaultValue={questionOptionsText(field)} rows={Math.max(3,Math.min(7,asArray(field.options).length+1))} style={{ ...input,padding:11,fontFamily:"inherit" }}/></label>
                <label style={{ display:"grid",gap:6,fontWeight:850 }}>Help text<input name="helpText" defaultValue={field.helpText ?? ""} placeholder="Optional guidance shown while quoting" style={input}/></label>
                <label style={{ display:"flex",gap:9,alignItems:"center",fontWeight:850 }}><input type="checkbox" name="required" defaultChecked={Boolean(field.required)}/> Staff must complete this choice on the quote</label>
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
        {fields.length === 0 ? <div style={{ marginTop:16,padding:18,borderRadius:14,background:"#fff7ed",border:"1px solid #fed7aa",color:"#9a3412" }}>The standard size, print, artwork and fulfilment choices are created automatically. Quantity is entered once on the quote or through WooCommerce. Add more choices only when customers or staff genuinely need them.</div> : null}
        <form action={addSimpleProductQuestionAction} style={{ display:"grid",gap:11,marginTop:16,padding:16,borderRadius:15,background:"#eff6ff",border:"1px solid #bfdbfe" }}>
          <input type="hidden" name="productId" value={product.id}/><h3 style={{ margin:0 }}>+ Add another shared customer choice</h3>
          <div style={{ display:"grid",gridTemplateColumns:"minmax(220px,1.4fr) minmax(180px,.6fr)",gap:10 }}><label style={{ display:"grid",gap:6,fontWeight:850 }}>Question<input name="label" placeholder="eg Size, Material, Laminate" required style={input}/></label><label style={{ display:"grid",gap:6,fontWeight:850 }}>Answer type<select name="type" defaultValue="select" style={input}><option value="select">Single choice</option><option value="multi_select">Multiple choice</option><option value="size_select">Size cards</option><option value="yes_no">Yes / no</option><option value="quantity">Quantity</option><option value="color">Colour swatches</option><option value="number">Number</option><option value="text">Text</option></select></label></div>
          <label style={{ display:"grid",gap:6,fontWeight:850 }}>Choices<textarea name="options" rows={4} placeholder={"600 × 900 mm=600x900\n900 × 1200 mm=900x1200\nCustom size=custom"} style={{ ...input,padding:11,fontFamily:"inherit" }}/></label>
          <label style={{ display:"grid",gap:6,fontWeight:850 }}>Help text<input name="helpText" placeholder="Optional customer guidance" style={input}/></label>
          <label style={{ display:"flex",gap:9,alignItems:"center",fontWeight:850 }}><input type="checkbox" name="required" defaultChecked/> Required on the quote</label>
          <button style={{ justifySelf:"start",minHeight:42,border:0,borderRadius:10,background:"#0f172a",color:"#fff",fontWeight:900,padding:"0 16px",cursor:"pointer" }}>Add question</button>
        </form>
        </div>
      </details>
    </section> : null}

    {tab === "pricing" ? <section style={{ display:"grid",gap:16 }}>
      <div style={card}><h2 style={{ marginTop:0 }}>Pricing</h2><p style={{ color:"#64748b",lineHeight:1.6 }}>Check the internal cost and sell price for a typical size and quantity before staff use this product on a quote.</p>
        {product.productionRecipeId ? <form method="get" style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr) auto",gap:10 }}><input type="hidden" name="tab" value="pricing"/><label style={{ display:"grid",gap:7,fontWeight:850 }}>Width mm<input name="width" type="number" defaultValue={width} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Height mm<input name="height" type="number" defaultValue={height} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Quantity<input name="quantity" type="number" defaultValue={quantity} style={input}/></label><button style={{ minHeight:44,alignSelf:"end",border:0,borderRadius:11,background:"#0f172a",color:"#fff",fontWeight:950,padding:"0 18px",cursor:"pointer" }}>Calculate</button></form> : <div style={{ padding:16,borderRadius:14,background:"#fff7ed",border:"1px solid #fed7aa",color:"#9a3412" }}>Choose the material and production actions on the Build tab first.</div>}
      </div>
      {pricingPreview ? <div style={{ ...card,background:"linear-gradient(180deg,#f0fdfa,#fff)" }}><div style={{ display:"flex",justifyContent:"space-between",gap:14 }}><div><div style={{ fontSize:12,fontWeight:900,color:"#0f766e",textTransform:"uppercase" }}>Live shared calculation</div><h2 style={{ margin:"6px 0" }}>{width} × {height} mm · Qty {quantity}</h2></div><Link href="/settings" style={{ color:"#0f766e",fontWeight:900 }}>Advanced costing settings →</Link></div><div style={{ display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:9,marginTop:14 }}>{[["Material",pricingPreview.materialCost],["Machines",pricingPreview.machineCost],["Ink",pricingPreview.inkCost],["Labour",pricingPreview.labourCost],["Total cost",pricingPreview.totalCost],["Sell price",pricingPreview.sellPrice]].map(([label,value])=><div key={String(label)} style={{ padding:13,borderRadius:12,background:"#fff",border:"1px solid #ccfbf1" }}><div style={{ fontSize:12,color:"#64748b" }}>{label}</div><div style={{ marginTop:5,fontSize:20,fontWeight:950 }}>{aud.format(Number(value))}</div></div>)}</div></div> : null}
    </section> : null}

    {tab === "website" ? <section style={card}>
      <div style={{ display:"flex",justifyContent:"space-between",gap:16 }}><div><h2 style={{ margin:0 }}>Website</h2><p style={{ color:"#64748b",lineHeight:1.6 }}>Optional only. Your internal product and quote workflow works without publishing anything to WordPress.</p></div><Link href="/integrations/wordpress" style={{ color:"#6d28d9",fontWeight:900 }}>Connection settings →</Link></div>
      <form action={saveProductWebsiteAction} style={{ display:"grid",gap:16 }}>
        <input type="hidden" name="productId" value={product.id}/>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <label style={{ display:"flex",alignItems:"center",gap:10,padding:15,border:"1px solid #dbe4f0",borderRadius:14,fontWeight:900 }}><input type="checkbox" name="websiteEnabled" defaultChecked={product.websiteEnabled}/> Publish this product to WordPress</label>
          <label style={{ display:"grid",gap:7,fontWeight:850 }}>Selling mode<select name="websiteMode" defaultValue={product.websiteMode || "quote_only"} style={input}><option value="live_checkout">Live price + WooCommerce checkout</option><option value="quote_only">Request a quote only</option></select></label>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <label style={{ display:"grid",gap:7,fontWeight:850 }}>
            Website product name
            <input name="websiteProductName" defaultValue={String(config.websiteProductName ?? "")} placeholder={product.name} style={input}/>
            <span style={{ color:"#64748b",fontSize:12,fontWeight:650 }}>Optional. Leave blank to use the internal name “{product.name}”.</span>
          </label>
          <label style={{ display:"grid",gap:7,fontWeight:850 }}>Website category<input name="websiteCategory" defaultValue={product.websiteCategory ?? ""} placeholder="Signs, Plans, Stickers…" style={input}/></label>
        </div>
        <label style={{ display:"grid",gap:7,fontWeight:850 }}>
          Website URL slug
          <input name="websiteSlug" defaultValue={product.websiteSlug ?? ""} placeholder="Generated from the website product name" style={input}/>
          <span style={{ color:"#64748b",fontSize:12,fontWeight:650 }}>Leave blank to generate the URL from the website product name.</span>
        </label>
        <label style={{ display:"grid",gap:7,fontWeight:850 }}>Short description<textarea name="websiteShortDescription" defaultValue={product.websiteShortDescription ?? ""} rows={3} style={{ ...input,padding:12 }}/></label>
        <label style={{ display:"grid",gap:7,fontWeight:850 }}>Full description<textarea name="websiteDescription" defaultValue={product.websiteDescription ?? ""} rows={6} style={{ ...input,padding:12 }}/></label>
        <WebsiteImageManager productId={product.id} productName={String(config.websiteProductName ?? product.name)} initialImages={initialWebsiteImages} featuredImageId={initialFeaturedWebsiteImageId}/>
        <div><h3 style={{ marginBottom:8 }}>Default price preview</h3><div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}><label style={{ display:"grid",gap:7,fontWeight:850 }}>Width mm<input name="defaultWidthMm" type="number" defaultValue={config.defaultWidthMm ?? 600} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Height mm<input name="defaultHeightMm" type="number" defaultValue={config.defaultHeightMm ?? 450} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Quantity<input name="defaultQuantity" type="number" defaultValue={config.defaultQuantity ?? 1} style={input}/></label><label style={{ display:"grid",gap:7,fontWeight:850 }}>Fallback base price<input name="basePrice" type="number" step="0.01" defaultValue={config.basePrice ?? 0} style={input}/></label></div></div>
        {fields.length ? <div><h3 style={{ marginBottom:8 }}>Website question style</h3><div style={{ display:"grid",gap:9 }}>{fields.map((field,index)=><div key={field.id ?? index} style={{ display:"grid",gridTemplateColumns:"1fr 220px",gap:12,alignItems:"center",padding:12,border:"1px solid #e2e8f0",borderRadius:13,background:"#f8fafc" }}><div><b>{field.label}</b><div style={{ color:"#64748b",fontSize:13,marginTop:3 }}>{field.type?.replace(/_/g," ")} · {asArray(field.options).length} options</div></div><select name={`display:${field.key}`} defaultValue={fieldDisplay(field,config)} style={input}><option value="buttons">Buttons</option><option value="cards">Cards</option><option value="dropdown">Dropdown</option><option value="swatches">Swatches</option><option value="number">Number field</option><option value="text">Text field</option></select></div>)}</div></div> : null}
        <button style={{ justifySelf:"start",minHeight:44,border:0,borderRadius:11,background:"#7c3aed",color:"#fff",fontWeight:950,padding:"0 18px",cursor:"pointer" }}>Save website settings</button>
      </form>
    </section> : null}

    {tab === "preview" ? <section style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(320px,.8fr)",gap:16 }}>
      <div style={{ display:"grid",gap:16 }}>
        <section style={card}>
          <div style={{ fontSize:12,fontWeight:950,color:"#2563eb",textTransform:"uppercase",letterSpacing:".08em" }}>Customer quote summary</div>
          <h2 style={{ margin:"6px 0" }}>{product.name}</h2>
          <div style={{ color:"#64748b" }}>{product.sku || "No SKU"} · {product.department.replace(/_/g," ")}</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:16 }}>
            <div style={{ padding:13,border:"1px solid #dbe4f0",borderRadius:12,background:"#f8fafc" }}><div style={{ fontSize:12,color:"#64748b" }}>Normal size</div><strong style={{ display:"block",marginTop:4 }}>{width} × {height} mm</strong></div>
            <div style={{ padding:13,border:"1px solid #dbe4f0",borderRadius:12,background:"#f8fafc" }}><div style={{ fontSize:12,color:"#64748b" }}>Normal quantity</div><strong style={{ display:"block",marginTop:4 }}>{quantity}</strong></div>
            <div style={{ padding:13,border:"1px solid #dbe4f0",borderRadius:12,background:"#f8fafc" }}><div style={{ fontSize:12,color:"#64748b" }}>Default supply</div><strong style={{ display:"block",marginTop:4 }}>{String(config.internalDeliveryMethod ?? "pickup").replace(/_/g," ")}</strong></div>
          </div>
          <h3 style={{ margin:"20px 0 10px" }}>Choices available while quoting</h3>
          {fields.length ? <div style={{ display:"grid",gap:9 }}>{fields.map((field,index)=><div key={field.id ?? index} style={{ display:"grid",gridTemplateColumns:"30px minmax(0,1fr) auto",gap:10,alignItems:"center",padding:11,border:"1px solid #e2e8f0",borderRadius:12 }}><span style={{ width:27,height:27,borderRadius:999,display:"grid",placeItems:"center",background:"#dbeafe",color:"#1d4ed8",fontSize:12,fontWeight:950 }}>{index+1}</span><div><b>{field.label}</b><div style={{ color:"#64748b",fontSize:12,marginTop:2 }}>{field.helpText || String(field.type ?? "choice").replace(/_/g," ")}</div></div><span style={{ color:"#475569",fontSize:12,fontWeight:850 }}>{asArray(field.options).length ? `${asArray(field.options).length} choices` : field.defaultValue || "Entered on quote"}</span></div>)}</div> : <div style={{ color:"#64748b" }}>Save the Guided builder setup to create the standard quote fields.</div>}
        </section>

        <section style={card}>
          <div style={{ fontSize:12,fontWeight:950,color:"#0f766e",textTransform:"uppercase",letterSpacing:".08em" }}>Production instructions</div>
          <h2 style={{ margin:"6px 0" }}>{currentRecipe?.name || "Production workflow not saved"}</h2>
          <div style={{ color:"#64748b" }}>Material: <b>{materials.find((material)=>material.id===currentRecipe?.materialId)?.name || "No physical material / not selected"}</b></div>
          {initialProductionSteps.length ? <div style={{ display:"grid",gap:8,marginTop:15 }}>{initialProductionSteps.map((step,index)=><div key={`${step.processToken}-${index}`} style={{ display:"grid",gridTemplateColumns:"31px 1fr",gap:9,alignItems:"center",padding:10,borderRadius:11,background:"#f0fdfa",border:"1px solid #ccfbf1" }}><span style={{ width:28,height:28,borderRadius:999,display:"grid",placeItems:"center",background:"#0f766e",color:"#fff",fontWeight:950,fontSize:12 }}>{index+1}</span><strong>{step.name}</strong></div>)}</div> : <div style={{ marginTop:14,color:"#64748b" }}>No production actions saved yet.</div>}
        </section>
      </div>

      <aside style={{ display:"grid",gap:16,alignContent:"start" }}>
        <section style={{ ...card,background:"linear-gradient(180deg,#eff6ff,#fff)" }}>
          <div style={{ fontSize:12,fontWeight:950,color:"#1d4ed8",textTransform:"uppercase" }}>Ready status</div>
          <h2 style={{ margin:"6px 0" }}>{product.productionRecipeId && fields.length ? "Ready to quote" : "Setup incomplete"}</h2>
          <div style={{ display:"grid",gap:8,marginTop:13 }}>
            <div style={{ display:"flex",justifyContent:"space-between",gap:10 }}><span>Product details</span><b>{product.name ? "Ready" : "Missing"}</b></div>
            <div style={{ display:"flex",justifyContent:"space-between",gap:10 }}><span>Material/workflow</span><b>{product.productionRecipeId ? "Ready" : "Not saved"}</b></div>
            <div style={{ display:"flex",justifyContent:"space-between",gap:10 }}><span>Quote choices</span><b>{fields.length ? "Ready" : "Not saved"}</b></div>
            <div style={{ display:"flex",justifyContent:"space-between",gap:10 }}><span>Website</span><b>{product.websiteEnabled ? "Published" : "Optional / off"}</b></div>
          </div>
          <Link href={`/products/${product.id}?tab=build`} style={{ display:"block",marginTop:16,textAlign:"center",textDecoration:"none",borderRadius:11,background:"#2563eb",color:"#fff",padding:"12px 14px",fontWeight:950 }}>Edit guided builder</Link>
        </section>
        {pricingPreview ? <section style={{ ...card,background:"linear-gradient(180deg,#f0fdfa,#fff)" }}><div style={{ fontSize:12,fontWeight:950,color:"#0f766e",textTransform:"uppercase" }}>Typical price check</div><h3 style={{ margin:"6px 0" }}>{width} × {height} mm · Qty {quantity}</h3><div style={{ display:"grid",gap:8,marginTop:13 }}>{[["Material",pricingPreview.materialCost],["Ink",pricingPreview.inkCost],["Labour + machine",pricingPreview.labourCost+pricingPreview.machineCost],["Total cost",pricingPreview.totalCost],["Sell price",pricingPreview.sellPrice]].map(([label,value])=><div key={String(label)} style={{ display:"flex",justifyContent:"space-between",gap:10,paddingBottom:7,borderBottom:"1px solid #dbe4f0" }}><span>{label}</span><b>{aud.format(Number(value))}</b></div>)}</div></section> : null}
      </aside>
    </section> : null}
  </main>;
}
