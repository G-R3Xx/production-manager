"use client";
import { useCallback, useEffect, useState } from "react";

type Props={jobId:string;initialDate:string|null;canEdit:boolean};
export function CompletionDateEditor({jobId,initialDate,canEdit}:Props){
  const [saved,setSaved]=useState(initialDate);
  const [value,setValue]=useState(initialDate??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{setSaved(initialDate);setValue(initialDate??"");},[initialDate]);
  const reload=useCallback(async()=>{
    try{
      const r=await fetch(`/api/calendar/deadlines?jobId=${encodeURIComponent(jobId)}`,{cache:"no-store"});
      if(!r.ok)return;
      const result=await r.json() as {job?:{dueDate:string|null}};
      if(result.job){setSaved(result.job.dueDate);setValue(result.job.dueDate??"");}
    }catch{/* Offline: retain last saved value. */}
  },[jobId]);
  useEffect(()=>{
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible"&&!busy)void reload();},60000);
    const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel("pm-completion-date"):null;
    if(channel)channel.onmessage=(event:MessageEvent<{jobId?:string}>)=>{if(event.data?.jobId===jobId&&!busy)void reload();};
    return ()=>{window.clearInterval(timer);channel?.close();};
  },[jobId,busy,reload]);
  const save=async()=>{
    if(busy||!canEdit)return;
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/calendar/deadlines",{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jobId,dueDate:value||null,expectedDate:saved})});
      const result=await response.json() as {job?:{dueDate:string|null};error?:string};
      if(!response.ok||!result.job){if(response.status===409)void reload();throw new Error(result.error??"Could not save completion date.");}
      setSaved(result.job.dueDate);setValue(result.job.dueDate??"");setMessage("Completion date updated. The Calendar uses this date.");
      if(typeof BroadcastChannel!=="undefined"){
        const channel=new BroadcastChannel("pm-completion-date");channel.postMessage({jobId});channel.close();
      }
    }catch(e){setError(e instanceof Error?e.message:"Could not save completion date.");}
    finally{setBusy(false);}
  };
  return <section style={{background:"#fff",border:"1px solid #dbe4ef",padding:16,borderRadius:16,display:"grid",gap:9}}>
    <div style={{fontSize:15,fontWeight:900,color:"#0f172a"}}>Job completion deadline</div>
    <div style={{fontSize:12,color:"#64748b"}}>This is the date shown on the Main Calendar. Moving individual Gantt tasks does not change it.</div>
    <div style={{display:"flex",alignItems:"flex-end",gap:10,flexWrap:"wrap"}}>
      <label style={{display:"grid",gap:5,fontSize:12,fontWeight:800,color:"#334155"}}>Completed by
        <input type="date" disabled={!canEdit||busy} value={value} onChange={event=>{setValue(event.target.value);setMessage("");}} style={{minHeight:40,padding:"0 9px",background:"#fff",borderRadius:9,border:"1px solid #cbd5e1"}}/>
      </label>
      {canEdit?<button onClick={()=>void save()} type="button" disabled={busy||value===(saved??"")} style={{minHeight:40,border:0,borderRadius:9,padding:"0 14px",background:"#1d4ed8",color:"#fff",fontWeight:800,cursor:"pointer",opacity:busy?.6:1}}>{busy?"Saving…":"Save completion date"}</button>:null}
    </div>
    {error?<div role="alert" style={{fontSize:12,color:"#b42318"}}>{error}</div>:null}
    {message?<div role="status" style={{fontSize:12,color:"#067647"}}>{message}</div>:null}
  </section>;
}
