import { redirect } from "next/navigation";
import { AUSTRALIAN_STATES, structuredAddressFromPayload } from "@/lib/contact-address";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listSuppliersForTenant } from "@/server/suppliers";
import { createSupplierAction, syncSupplierToMyobAction, updateSupplierAction } from "./actions";
import { startPurchaseOrderAction } from "../purchasing/actions";

type Props={searchParams?:Promise<Record<string,string|string[]|undefined>>};
function readParam(p:Record<string,string|string[]|undefined>,k:string){const v=p[k];return Array.isArray(v)?v[0]??"":v??"";}
const panel={background:"#fff",border:"1px solid #e5e7eb",borderRadius:20,padding:24} as const;
const input={minHeight:42,borderRadius:12,border:"1px solid #d0d5dd",padding:"0 12px",width:"100%",boxSizing:"border-box"} as const;
const dark={minHeight:40,borderRadius:10,border:"1px solid #111827",background:"#111827",color:"#fff",fontWeight:700,padding:"0 14px",cursor:"pointer"} as const;
const ghost={...dark,background:"#fff",color:"#111827",border:"1px solid #cbd5e1"} as const;

function SupplierAddressFields({ payload }: { payload?: Record<string, unknown> }) {
 const rawMyobAddress=Array.isArray(payload?.Addresses)&&payload.Addresses[0]&&typeof payload.Addresses[0]==="object"?payload.Addresses[0]:undefined;
 const address=structuredAddressFromPayload(payload?.addressStructured??rawMyobAddress,payload?.address);
 return <div style={{display:"grid",gap:9}}>
  <textarea name="street" defaultValue={address.street} placeholder="Street address" rows={2} style={{borderRadius:12,border:"1px solid #d0d5dd",padding:12,fontFamily:"inherit"}}/>
  <div style={{display:"grid",gridTemplateColumns:"1.5fr .7fr .8fr",gap:8}}><input name="city" defaultValue={address.city} placeholder="Suburb / town" style={input}/><input name="state" defaultValue={address.state} list="supplier-au-states" placeholder="State" style={input}/><input name="postcode" defaultValue={address.postcode} placeholder="Postcode" style={input}/></div>
  <input name="country" defaultValue={address.country||"Australia"} placeholder="Country" style={input}/>
 </div>;
}
export default async function SuppliersPage({searchParams}:Props){
 const user=await getRequiredSessionUser();const active=await resolveActiveTenantForAuthUserId(user.id);if(!active)redirect("/bootstrap");
 const params=(await searchParams)??{};const message=readParam(params,"message"),error=readParam(params,"error"),q=readParam(params,"q");const suppliers=await listSuppliersForTenant(active.tenantId,q);
 return <div style={{maxWidth:1200,margin:"0 auto",display:"grid",gap:16}}>
  <datalist id="supplier-au-states">{AUSTRALIAN_STATES.map(state=><option key={state} value={state}/>)}</datalist>
  {message?<section style={{border:"1px solid #abefc6",background:"#ecfdf3",color:"#067647",borderRadius:16,padding:16}}>{message}</section>:null}
  {error?<section style={{border:"1px solid #fda29b",background:"#fff5f4",color:"#b42318",borderRadius:16,padding:16}}>{error}</section>:null}
  <section style={panel}><p style={{margin:0,fontSize:12,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"#4f46e5"}}>Suppliers</p><h1 style={{margin:"12px 0"}}>Supplier management</h1><p style={{margin:0,color:"#475467"}}>Supplier records sync to MYOB and can be used to start purchase orders.</p></section>
  <div style={{display:"grid",gridTemplateColumns:"380px 1fr",gap:16,alignItems:"start"}}>
   <form action={createSupplierAction} style={{...panel,display:"grid",gap:12}}><h2 style={{margin:0}}>Add supplier</h2><input name="displayName" placeholder="Supplier name" style={input}/><input name="contactName" placeholder="Contact name" style={input}/><input type="email" name="email" placeholder="Email" style={input}/><input name="phone" placeholder="Phone" style={input}/><div style={{border:"1px solid #e5e7eb",borderRadius:14,padding:12,display:"grid",gap:8}}><b style={{fontSize:13}}>Address</b><SupplierAddressFields/></div><textarea name="notes" placeholder="Notes" rows={4} style={{borderRadius:12,border:"1px solid #d0d5dd",padding:14}}/><button style={dark}>Create supplier</button></form>
   <section style={{...panel,display:"grid",gap:16}}><form method="get" style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12}}><input name="q" defaultValue={q} placeholder="Search suppliers" style={input}/><button style={ghost}>Search</button></form><div style={{display:"grid",gap:12}}>
    {suppliers.length===0?<div style={{color:"#475467"}}>No suppliers found.</div>:suppliers.map(s=><article key={s.id} style={{border:"1px solid #e5e7eb",borderRadius:16,padding:16,display:"grid",gap:10}}>
      <form action={updateSupplierAction} style={{display:"grid",gap:10}}><input type="hidden" name="supplierId" value={s.id}/><input name="displayName" defaultValue={s.displayName} style={input}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><input name="contactName" defaultValue={s.contactName??""} placeholder="Contact name" style={input}/><input name="phone" defaultValue={s.phone??""} placeholder="Phone" style={input}/></div><input type="email" name="email" defaultValue={s.email??""} placeholder="Email" style={input}/><details style={{border:"1px solid #e5e7eb",borderRadius:12,padding:"10px 12px"}}><summary style={{cursor:"pointer",fontWeight:800,fontSize:13}}>Address</summary><div style={{marginTop:10}}><SupplierAddressFields payload={s.payloadJson}/></div></details><textarea name="notes" defaultValue={s.notes??""} rows={3} style={{borderRadius:10,border:"1px solid #d0d5dd",padding:12}}/><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div style={{fontSize:12,color:s.myobUid?"#067647":"#9a3412",fontWeight:750}}>{s.myobUid?`MYOB linked · ${s.myobUid}`:"Not synced to MYOB"}</div><button style={dark}>Save</button></div></form>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",borderTop:"1px solid #e5e7eb",paddingTop:10}}><form action={syncSupplierToMyobAction}><input type="hidden" name="supplierId" value={s.id}/><button style={{...ghost,color:"#0f766e",borderColor:"#0f766e"}}>Sync to MYOB</button></form><form action={startPurchaseOrderAction}><input type="hidden" name="supplierId" value={s.id}/><button style={ghost}>New PO</button></form></div>
    </article>)}
   </div></section>
  </div>
 </div>;
}
