import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";

const groups = [
  { title: "Workspace", items: [
    { href: "/company", title: "Company", body: "Company details, logo and correspondence settings.", icon: "▣" },
    { href: "/users", title: "Staff & roles", body: "Users, access levels and team membership.", icon: "♙" },
    { href: "/suppliers", title: "Suppliers", body: "Supplier records used by materials and purchasing.", icon: "◫" }
  ]},
  { title: "Production resources", items: [
    { href: "/processes", title: "Processes", body: "What must happen: print, laminate, cut, pack and install.", icon: "⇢" },
    { href: "/machines", title: "Machines", body: "Equipment, capabilities, speeds and operating costs.", icon: "⚙" },
    { href: "/labour", title: "Labour & rates", body: "Reusable labour operations and costing rules.", icon: "◷" }
  ]},
  { title: "Connections", items: [
    { href: "/integrations", title: "MYOB & services", body: "MYOB, Install Scheduler and operational connections.", icon: "↔" },
    { href: "/integrations/wordpress", title: "WordPress & WooCommerce", body: "Publish products to the website and receive configured orders.", icon: "W" }
  ]}
];

export default async function SettingsPage(){
 const user=await getRequiredSessionUser(); const tenant=await resolveActiveTenantForAuthUserId(user.id); if(!tenant)redirect("/bootstrap");
 return <main style={{display:"grid",gap:26}}><header><div style={{fontSize:12,fontWeight:900,color:"#475569",textTransform:"uppercase",letterSpacing:".08em"}}>Administration</div><h1 style={{margin:"6px 0",fontSize:38}}>Settings</h1><p style={{color:"#64748b",maxWidth:760}}>Manage workspace configuration and production resources without cluttering the day-to-day navigation.</p></header>{groups.map(group=><section key={group.title} style={{display:"grid",gap:12}}><h2 style={{margin:0,fontSize:20}}>{group.title}</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>{group.items.map(item=><a key={item.href} href={item.href} style={{textDecoration:"none",color:"inherit",padding:20,border:"1px solid #dbe4f0",borderRadius:18,background:"#fff",boxShadow:"0 10px 28px rgba(15,23,42,.05)",display:"grid",gridTemplateColumns:"44px 1fr",gap:14,alignItems:"start"}}><span style={{width:44,height:44,borderRadius:13,background:"#e0f2fe",color:"#075985",display:"grid",placeItems:"center",fontSize:21,fontWeight:900}}>{item.icon}</span><span><strong style={{display:"block",fontSize:18,color:"#0f172a"}}>{item.title}</strong><span style={{display:"block",marginTop:6,color:"#64748b",lineHeight:1.45}}>{item.body}</span></span></a>)}</div></section>)}</main>
}
