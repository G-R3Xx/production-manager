import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listSuppliersForTenant } from "@/server/suppliers";
import { listMaterialsForTenant } from "@/server/materials";
import { getCompanySettingsByTenantId } from "@/server/company";
import { outboundEmailConfigured } from "@/server/outbound-email";
import {
  getPurchasingDefaults,
  getPurchaseOrder,
  listPurchaseOrderDocuments,
  listPurchaseOrderEvents,
  listPurchaseOrderLines,
  listPurchaseOrders
} from "@/server/purchasing";
import { fetchMyobPurchasingReferenceDataForTenant } from "@/server/myob-sync";
import { getMyobConnectionByTenantId, getMyobOauthTokenByTenantId } from "@/server/integrations";
import {
  addPurchaseOrderLineAction,
  deletePurchaseOrderLineAction,
  emailPurchaseOrderOnlyAction,
  savePurchasingDefaultsAction,
  sendPurchaseOrderAction,
  sendPurchaseOrderToMyobAction,
  setPurchaseOrderStatusAction,
  startPurchaseOrderAction,
  updatePurchaseOrderHeaderAction,
  updatePurchaseOrderLineAction
} from "./actions";

type Props={searchParams?:Promise<Record<string,string|string[]|undefined>>};
const card:CSSProperties={background:"#fff",border:"1px solid #dfe7f2",borderRadius:22,padding:20,boxShadow:"0 12px 36px rgba(15,23,42,.05)"};
const input:CSSProperties={width:"100%",minHeight:42,border:"1px solid #cfd9e8",borderRadius:12,padding:"0 12px",boxSizing:"border-box",background:"#fff"};
const button:CSSProperties={minHeight:42,borderRadius:12,border:0,padding:"0 14px",fontWeight:850,cursor:"pointer",background:"#111827",color:"#fff"};
const secondary:CSSProperties={...button,background:"#fff",color:"#111827",border:"1px solid #cbd5e1"};
function param(p:Record<string,string|string[]|undefined>,k:string){const v=p[k];return Array.isArray(v)?v[0]??"":v??"";}
function money(v:string|number){const n=Number(v);return Number.isFinite(n)?n.toLocaleString("en-AU",{style:"currency",currency:"AUD"}):"$0.00";}
function statusStyle(status:string):CSSProperties{const good=status==="sent"||status==="synced";const pending=status==="pending";const failed=status==="failed";return {display:"inline-flex",alignItems:"center",gap:6,padding:"6px 9px",borderRadius:999,fontSize:12,fontWeight:850,background:good?"#ecfdf3":pending?"#fff7ed":failed?"#fff1f2":"#f8fafc",color:good?"#067647":pending?"#9a3412":failed?"#b42318":"#475467",border:`1px solid ${good?"#abefc6":pending?"#fed7aa":failed?"#fecdd3":"#e2e8f0"}`};}
function eventTime(value:string){try{return new Date(value).toLocaleString("en-AU",{timeZone:"Australia/Sydney",dateStyle:"short",timeStyle:"short"});}catch{return value;}}

export default async function PurchasingPage({searchParams}:Props){
  const user=await getRequiredSessionUser();
  const active=await resolveActiveTenantForAuthUserId(user.id);
  if(!active)redirect("/bootstrap");
  const tenant=active!;
  const params=(await searchParams)??{};
  const message=param(params,"message"),error=param(params,"error"),requested=param(params,"selected");
  const [suppliers,materials,orders,defaults,connection,tokenRecord,company]=await Promise.all([
    listSuppliersForTenant(tenant.tenantId),
    listMaterialsForTenant(tenant.tenantId),
    listPurchaseOrders(tenant.tenantId),
    getPurchasingDefaults(tenant.tenantId),
    getMyobConnectionByTenantId(tenant.tenantId),
    getMyobOauthTokenByTenantId(tenant.tenantId),
    getCompanySettingsByTenantId(tenant.tenantId)
  ]);
  const selected=await getPurchaseOrder(tenant.tenantId,requested||orders[0]?.id);
  const [lines,events,documents]=selected?await Promise.all([listPurchaseOrderLines(tenant.tenantId,selected.id),listPurchaseOrderEvents(tenant.tenantId,selected.id),listPurchaseOrderDocuments(tenant.tenantId,selected.id)]):[[],[],[]];
  const selectedSupplier=selected?suppliers.find((supplier)=>supplier.id===selected.supplierId)??null:null;
  const poEmail=selectedSupplier?.purchaseOrderEmail||selectedSupplier?.email||"";
  const emailConfigured=outboundEmailConfigured();
  let refs:{accounts:Array<{uid:string;name:string;displayId:string;classification:string}>;taxCodes:Array<{uid:string;code:string;description:string}>}={accounts:[],taxCodes:[]};
  if(connection?.status==="connected"&&connection.companyFileId){try{refs=await fetchMyobPurchasingReferenceDataForTenant(tenant.tenantId);}catch{/* surfaced when saving/sending */}}
  const allowedMaterials=selected?materials.filter(m=>m.active&&(!m.supplierId||m.supplierId===selected.supplierId)):[];
  const total=lines.reduce((sum,l)=>sum+Number(l.lineTotal||0),0);
  return <div style={{maxWidth:1450,margin:"0 auto",display:"grid",gap:16}}>
    {message?<div style={{...card,borderColor:"#86efac",background:"#f0fdf4",color:"#166534"}}>{message}</div>:null}
    {error?<div style={{...card,borderColor:"#fda4af",background:"#fff1f2",color:"#9f1239"}}>{error}</div>:null}
    <section style={card}><p style={{margin:0,fontSize:12,fontWeight:900,letterSpacing:".08em",textTransform:"uppercase",color:"#4f46e5"}}>Purchasing</p><h1 style={{margin:"8px 0"}}>Purchase orders</h1><p style={{margin:0,color:"#667085"}}>Build the PO in Production Manager, then <b>Send Purchase Order</b> to email the supplier with a PDF and sync the same order to MYOB.</p></section>
    {!emailConfigured?<section style={{...card,borderColor:"#fdba74",background:"#fff7ed",color:"#9a3412"}}><b>Automated supplier email is not configured yet.</b> Automated supplier email uses Production Manager's shared Gmail sender; the Artwork client-link button is the remaining local-mail shortcut. For automatic PO delivery, add <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in Vercel. Emails send through the authenticated Gmail/Google Workspace mailbox. MYOB sync remains independent.</section>:null}
    {connection?.status==="connected" && tokenRecord?.scope && !tokenRecord.scope.includes("sme-general-ledger") ? <section style={{...card,borderColor:"#fdba74",background:"#fff7ed",color:"#9a3412"}}><b>Reconnect MYOB once after this update.</b> Purchasing needs General Ledger permission to load the expense/Cost of Sales accounts used when creating MYOB material items. Open Integrations and run MYOB OAuth again.</section> : null}
    <div style={{display:"grid",gridTemplateColumns:"340px minmax(0,1fr)",gap:16,alignItems:"start"}}>
      <aside style={{display:"grid",gap:14}}>
        <section style={{...card,display:"grid",gap:10}}><h2 style={{margin:0,fontSize:18}}>New PO</h2><form action={startPurchaseOrderAction} style={{display:"grid",gap:10}}><select name="supplierId" style={input} required defaultValue=""><option value="" disabled>Choose supplier…</option>{suppliers.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.displayName}</option>)}</select><button style={button}>Start purchase order</button></form></section>
        <section style={{...card,display:"grid",gap:8}}><div style={{display:"flex",justifyContent:"space-between"}}><strong>Purchase orders</strong><span style={{fontSize:12,color:"#667085"}}>{orders.length}</span></div>{orders.length?orders.map(po=><a key={po.id} href={`/purchasing?selected=${po.id}`} style={{textDecoration:"none",color:"inherit",padding:12,borderRadius:14,border:po.id===selected?.id?"2px solid #2563eb":"1px solid #e5e7eb",background:po.id===selected?.id?"#eff6ff":"#fff",display:"grid",gap:4}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><b>{po.poNumber}</b><span style={{fontSize:11,fontWeight:850,textTransform:"uppercase"}}>{po.status}</span></div><span style={{fontSize:13}}>{po.supplierName}</span><span style={{fontSize:12,color:"#667085"}}>{po.emailStatus==="sent"?"Email sent":po.emailStatus==="failed"?"Email failed":"Email not sent"} · {po.myobSyncStatus==="synced"?(po.myobNumber?`MYOB ${po.myobNumber}`:"MYOB synced"):po.myobSyncStatus==="failed"?"MYOB failed":po.myobSyncStatus==="pending"?"MYOB syncing":"MYOB not synced"}</span></a>):<span style={{color:"#667085"}}>No purchase orders yet.</span>}</section>
      </aside>
      <main style={{display:"grid",gap:14}}>
        {!selected?<section style={card}><h2 style={{marginTop:0}}>Start your first PO</h2><p style={{color:"#667085"}}>Choose a supplier on the left, or use <b>New PO</b> from a Material or Supplier record.</p></section>:<>
          <section style={{...card,display:"grid",gap:14}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
              <div><p style={{margin:0,fontSize:12,color:"#4f46e5",fontWeight:900}}>PURCHASE ORDER</p><h2 style={{margin:"6px 0"}}>{selected.poNumber} · {selected.supplierName}</h2><div style={{color:"#667085"}}>Status: <b>{selected.status}</b>{selected.myobNumber?` · MYOB ${selected.myobNumber}`:""}</div></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"start"}}>
                {selected.status!=="received"&&selected.status!=="cancelled"?<form action={sendPurchaseOrderAction}><input type="hidden" name="purchaseOrderId" value={selected.id}/><button style={{...button,background:"#0f766e",minWidth:180}}>{selected.emailStatus==="sent"?"Resend Purchase Order":"Send Purchase Order"}</button></form>:null}
                <form action={setPurchaseOrderStatusAction}><input type="hidden" name="purchaseOrderId" value={selected.id}/><select name="status" defaultValue={selected.status} style={{...input,width:150}}><option value="draft">Draft</option><option value="ordered">Ordered</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select><button style={{...secondary,marginLeft:6}}>Set status</button></form>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <span style={statusStyle(selected.emailStatus)}>Email: {selected.emailStatus==="sent"?`sent${selected.emailSentAt?` ${eventTime(selected.emailSentAt)}`:""}`:selected.emailStatus.replace("_"," ")}</span>
              <span style={statusStyle(selected.myobSyncStatus)}>MYOB: {selected.myobSyncStatus==="synced"?(selected.myobNumber?`synced ${selected.myobNumber}`:"synced"):selected.myobSyncStatus.replace("_"," ")}</span>
              <span style={{fontSize:12,color:poEmail?"#475467":"#b42318"}}>PO email: <b>{poEmail||"Missing - add it on the Supplier record"}</b></span>
            </div>
            {selected.emailLastError?<div style={{padding:10,borderRadius:10,background:"#fff1f2",color:"#b42318",fontSize:13}}><b>Email:</b> {selected.emailLastError}</div>:null}
            {selected.myobLastError?<div style={{padding:10,borderRadius:10,background:"#fff1f2",color:"#b42318",fontSize:13}}><b>MYOB:</b> {selected.myobLastError}</div>:null}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <form action={emailPurchaseOrderOnlyAction}><input type="hidden" name="purchaseOrderId" value={selected.id}/><button style={secondary}>{selected.emailStatus==="sent"?"Resend email only":"Email only"}</button></form>
              <form action={sendPurchaseOrderToMyobAction}><input type="hidden" name="purchaseOrderId" value={selected.id}/><button style={secondary}>Sync to MYOB only</button></form>
              <a href={`/api/purchasing/purchase-orders/${selected.id}/pdf`} style={{...secondary,display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Download PDF</a>
            </div>
            <form action={updatePurchaseOrderHeaderAction} style={{display:"grid",gridTemplateColumns:"180px 1fr 1fr auto",gap:10,alignItems:"end"}}><input type="hidden" name="purchaseOrderId" value={selected.id}/><label style={{display:"grid",gap:5,fontSize:13,fontWeight:800}}>Promised date<input type="date" name="promisedDate" defaultValue={selected.promisedDate??""} style={input}/></label><label style={{display:"grid",gap:5,fontSize:13,fontWeight:800}}>Ship to<input name="shipToAddress" defaultValue={selected.shipToAddress??""} style={input}/></label><label style={{display:"grid",gap:5,fontSize:13,fontWeight:800}}>PO notes<input name="notes" defaultValue={selected.notes??""} style={input}/></label><button style={secondary}>Save details</button></form>
          </section>
          <section style={{...card,display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between"}}><h2 style={{margin:0}}>Order lines</h2><b>{money(total)}</b></div>
            {selected.status==="draft"?<form action={addPurchaseOrderLineAction} style={{display:"grid",gridTemplateColumns:"minmax(240px,1fr) 110px 130px minmax(160px,.7fr) auto",gap:8,alignItems:"end",padding:12,borderRadius:14,background:"#f8fafc"}}><input type="hidden" name="purchaseOrderId" value={selected.id}/><label style={{display:"grid",gap:5,fontSize:12,fontWeight:800}}>Material<select name="materialId" style={input} required defaultValue=""><option value="" disabled>Choose material…</option>{allowedMaterials.map(m=><option key={m.id} value={m.id}>{m.name}{m.sku?` · ${m.sku}`:""}</option>)}</select></label><label style={{display:"grid",gap:5,fontSize:12,fontWeight:800}}>Qty<input name="quantity" type="number" step="0.001" min="0.001" defaultValue="1" style={input}/></label><label style={{display:"grid",gap:5,fontSize:12,fontWeight:800}}>Unit cost<input name="unitCost" type="number" step="0.01" min="0" placeholder="material cost" style={input}/></label><label style={{display:"grid",gap:5,fontSize:12,fontWeight:800}}>Description<input name="description" style={input}/></label><button style={button}>Add</button></form>:null}
            {lines.length===0?<div style={{padding:24,border:"1px dashed #cbd5e1",borderRadius:14,color:"#667085"}}>No materials on this PO yet.</div>:lines.map(line=><form key={line.id} action={updatePurchaseOrderLineAction} style={{display:"grid",gridTemplateColumns:"minmax(240px,1fr) 110px 130px minmax(160px,.7fr) 120px auto",gap:8,alignItems:"center",padding:12,border:"1px solid #e5e7eb",borderRadius:14}}><input type="hidden" name="purchaseOrderId" value={selected.id}/><input type="hidden" name="lineId" value={line.id}/><div><b>{line.materialName}</b><div style={{fontSize:12,color:"#667085"}}>{line.materialSku??"No SKU"} · {line.materialMyobUid?"MYOB linked":"Will sync to MYOB"}</div></div><input name="quantity" type="number" step="0.001" min="0.001" defaultValue={line.quantity} disabled={selected.status!=="draft"} style={input}/><input name="unitCost" type="number" step="0.01" min="0" defaultValue={line.unitCost} disabled={selected.status!=="draft"} style={input}/><input name="description" defaultValue={line.description??""} disabled={selected.status!=="draft"} style={input}/><b style={{textAlign:"right"}}>{money(line.lineTotal)}</b>{selected.status==="draft"?<div style={{display:"flex",gap:5}}><button style={secondary}>Save</button><button formAction={deletePurchaseOrderLineAction} style={{...secondary,color:"#b42318",borderColor:"#fda29b"}}>Remove</button></div>:<span/>}</form>)}
          </section>
          {events.length||documents.length?<section style={{...card,display:"grid",gap:10}}><div><p style={{margin:0,fontSize:12,fontWeight:900,color:"#4f46e5"}}>PO HISTORY</p><h2 style={{margin:"6px 0"}}>Send + sync history</h2></div>{documents.length?<div style={{display:"grid",gap:7,padding:"10px 0"}}><b style={{fontSize:13}}>Sent PDF copies</b>{documents.slice(0,5).map(document=><div key={document.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",fontSize:12}}><span>{document.fileName} · {document.recipientEmail||"supplier"} · {eventTime(document.createdAt)}</span><a href={`/api/purchasing/purchase-orders/${selected.id}/pdf?documentId=${document.id}`} style={{color:"#1d4ed8",fontWeight:800}}>Download sent PDF</a></div>)}</div>:null}{events.slice(0,10).map(event=><div key={event.id} style={{display:"grid",gridTemplateColumns:"150px 1fr auto",gap:12,alignItems:"start",padding:"9px 0",borderTop:"1px solid #edf2f7"}}><b style={{fontSize:12,textTransform:"uppercase"}}>{event.eventType.replace(/_/g," ")}</b><span style={{fontSize:13,color:"#475467"}}>{event.message||"-"}</span><span style={{fontSize:11,color:"#98a2b3"}}>{eventTime(event.createdAt)}</span></div>)}</section>:null}
        </>}
        <section style={{...card,display:"grid",gap:12}}><div><p style={{margin:0,fontSize:12,fontWeight:900,color:"#4f46e5"}}>MYOB PURCHASING SETUP</p><h2 style={{margin:"6px 0"}}>Default purchase account + tax code</h2><p style={{margin:0,color:"#667085"}}>These are used when PM creates a purchased material as a new MYOB item. Supplier-specific MYOB purchasing details take priority where available.</p></div>{connection?.status!=="connected"?<div style={{padding:12,borderRadius:12,background:"#fff7ed",color:"#9a3412"}}>Connect MYOB first to load accounts and tax codes.</div>:<form action={savePurchasingDefaultsAction} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"end"}}><label style={{display:"grid",gap:5,fontWeight:800,fontSize:13}}>Expense / Cost of Sales account<select name="expenseAccountUid" defaultValue={defaults.expenseAccountUid??""} style={input}><option value="">Choose MYOB account…</option>{refs.accounts.map(a=><option key={a.uid} value={a.uid}>{a.displayId} · {a.name} ({a.classification})</option>)}</select></label><label style={{display:"grid",gap:5,fontWeight:800,fontSize:13}}>Purchase tax code<select name="taxCodeUid" defaultValue={defaults.taxCodeUid??""} style={input}><option value="">Choose tax code…</option>{refs.taxCodes.map(t=><option key={t.uid} value={t.uid}>{t.code}{t.description?` · ${t.description}`:""}</option>)}</select></label><button style={button}>Save defaults</button></form>}</section>
      </main>
    </div>
  </div>;
}
