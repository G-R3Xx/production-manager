"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ProductionCompletionDeadline } from "@/server/production";
import { completionMonthGrid, completionMonthShift } from "@/lib/completion-dates";

type Props = {initialJobs:ProductionCompletionDeadline[]; today:string; canEdit:boolean};
const card:CSSProperties = {background:"#fff",border:"1px solid #dce4ee",borderRadius:15,padding:16};
const button:CSSProperties = {border:"1px solid #cbd5e1",background:"#fff",borderRadius:9,minHeight:38,padding:"7px 12px",cursor:"pointer",fontWeight:750,color:"#1e293b"};
const dateRx=/^\d{4}-\d{2}-\d{2}$/;
const parse = (key:string) => {const [y,m,d]=key.split("-").map(Number);return new Date(Date.UTC(y,m-1,d,12));};
const formatMonth = (key:string) => new Intl.DateTimeFormat("en-AU",{month:"long",year:"numeric",timeZone:"UTC"}).format(parse(key));
const formatDate = (key:string|null) => key && dateRx.test(key) ? new Intl.DateTimeFormat("en-AU",{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(parse(key)) : "Not scheduled";
const completed = (status:string) => status==="completed";

export function CompletionCalendar({initialJobs,today,canEdit}:Props){
  const [jobs,setJobs] = useState(initialJobs);
  const [month,setMonth] = useState(today);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [dateDraft,setDateDraft] = useState("");
  const [query,setQuery] = useState("");
  const [showCompleted,setShowCompleted] = useState(false);
  const [showUnscheduled,setShowUnscheduled] = useState(false);
  const [expandedDay,setExpandedDay] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  useEffect(()=>setJobs(initialJobs),[initialJobs]);
  const reload=useCallback(async()=>{
    try {
      const response=await fetch("/api/calendar/deadlines",{cache:"no-store"});
      if(!response.ok)return;
      const payload=await response.json() as {jobs?:ProductionCompletionDeadline[]};
      if(Array.isArray(payload.jobs))setJobs(payload.jobs);
    } catch { /* Keep last good state when offline. */ }
  },[]);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{if(active && document.visibilityState==="visible" && !busy)void reload();};
    const timer=window.setInterval(refresh,45000);
    const channel=typeof BroadcastChannel!=="undefined" ? new BroadcastChannel("pm-completion-date") : null;
    if(channel)channel.onmessage=refresh;
    const visibility=()=>refresh();
    document.addEventListener("visibilitychange",visibility);
    return ()=>{active=false;window.clearInterval(timer);channel?.close();document.removeEventListener("visibilitychange",visibility);};
  },[busy,reload]);

  const filtered=useMemo(()=>jobs.filter(job=>(showCompleted||!completed(job.status)) &&
    (!query.trim()||`${job.quoteNumber??""} ${job.projectName} ${job.clientName}`.toLowerCase().includes(query.trim().toLowerCase()))),[jobs,showCompleted,query]);
  const dated=useMemo(()=>{
    const byDay=new Map<string,ProductionCompletionDeadline[]>();
    for(const job of filtered){
      if (!job.dueDate)continue;
      const current=byDay.get(job.dueDate)??[];
      current.push(job);
      byDay.set(job.dueDate,current);
    }
    for(const entries of byDay.values())entries.sort((a,b)=>a.clientName.localeCompare(b.clientName));
    return byDay;
  },[filtered]);
  const undated=useMemo(()=>filtered.filter(job=>!job.dueDate),[filtered]);
  const selected=jobs.find(job=>job.jobId===selectedId)??null;
  const dates=useMemo(()=>completionMonthGrid(month),[month]);
  const setSelected=(job:ProductionCompletionDeadline)=>{setSelectedId(job.jobId);setDateDraft(job.dueDate??"");setError("");setNotice("");};
  const save=async()=>{
    if(!selected || !canEdit || busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/calendar/deadlines",{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jobId:selected.jobId,dueDate:dateDraft||null,expectedDate:selected.dueDate})});
      const result=await response.json() as {job?:ProductionCompletionDeadline;error?:string};
      if(!response.ok||!result.job){if(response.status===409)void reload();throw new Error(result.error||"Could not save the completion date.");}
      setJobs(current=>current.map(job=>job.jobId===result.job!.jobId ? result.job! : job));
      setNotice("Completion date saved.");
      if(typeof BroadcastChannel!=="undefined"){
        const channel=new BroadcastChannel("pm-completion-date");channel.postMessage({jobId:selected.jobId});channel.close();
      }
    }catch(err){setError(err instanceof Error?err.message:"Could not save the date.");}
    finally{setBusy(false);}
  };
  return <main style={{maxWidth:1480,margin:"0 auto",display:"grid",gap:16,paddingBottom:42}}>
    <header style={{...card,background:"linear-gradient(125deg,#fff,#f1f6ff)"}}>
      <div style={{color:"#394acc",fontSize:11,fontWeight:900,letterSpacing:1}}>PRODUCTION MANAGER · CALENDAR</div>
      <h1 style={{margin:"6px 0",fontSize:26}}>Completed by</h1>
      <p style={{margin:0,color:"#475569",fontSize:13}}>One completion deadline per Production Job. Individual tasks, staff and time allocations stay in Projects → Gantt Timeline.</p>
    </header>
    <div style={{...card,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button type="button" onClick={()=>setMonth(current=>completionMonthShift(current,-1))} style={button} aria-label="Previous month">←</button>
        <h2 style={{margin:0,minWidth:190,textAlign:"center",fontSize:19}}>{formatMonth(month)}</h2>
        <button type="button" onClick={()=>setMonth(current=>completionMonthShift(current,1))} style={button} aria-label="Next month">→</button>
        <button type="button" onClick={()=>setMonth(today)} style={button}>Today</button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search customer or job…" aria-label="Search jobs" style={{...button,fontWeight:500,minWidth:205}}/>
        <label style={{fontSize:12,color:"#475569",display:"flex",gap:7,alignItems:"center"}}><input type="checkbox" checked={showCompleted} onChange={event=>setShowCompleted(event.target.checked)}/> Include completed</label>
      </div>
    </div>
    <section aria-label="Completion deadline calendar" style={{...card,padding:0,overflowX:"auto"}}>
      <div style={{minWidth:650}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",background:"#eff4fd",borderBottom:"1px solid #dce4ee"}}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=><div key={day} style={{padding:"12px 9px",fontWeight:800,color:"#334155",fontSize:12,textAlign:"center"}}>{day}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))"}}>
          {dates.map((day,index)=>{
            const matching=dated.get(day)??[];
            const inMonth=day.slice(0,7)===month.slice(0,7);
            return <div key={day} style={{minHeight:103,padding:6,borderRight:index%7!==6?"1px solid #e5eaf1":"none",borderBottom:"1px solid #e5eaf1",background:day===today?"#f0f7ff":inMonth?"#fff":"#f9fafb"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:3,marginBottom:5}}>
                <span style={{fontSize:11,fontWeight:day===today?900:700,color:inMonth?"#334155":"#a3aab7"}}>{Number(day.slice(-2))}</span>
                {matching.length>0?<small style={{fontSize:10,color:"#64748b"}}>{matching.length} job{matching.length===1?"":"s"}</small>:null}
              </div>
              {matching.slice(0,expandedDay===day?matching.length:3).map(job=><button type="button" key={job.jobId} onClick={()=>setSelected(job)}
                title={`${job.projectName} — ${job.clientName}\nCompleted by ${formatDate(job.dueDate)}`}
                style={{display:"block",width:"100%",marginBottom:4,textAlign:"left",padding:"5px 6px",borderRadius:6,border:"1px solid #bfd7fd",borderLeft:`3px solid ${completed(job.status)?"#059669":day<today?"#dc2626":"#3068bb"}`,background:completed(job.status)?"#ecfdf5":"#eef5ff",fontSize:11,fontWeight:750,color:"#1e3a8a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>{job.projectName}</button>)}
              {matching.length>3&&expandedDay!==day?<button type="button" onClick={()=>setExpandedDay(day)} style={{border:0,background:"none",color:"#475569",padding:2,fontSize:10,cursor:"pointer"}}>+{matching.length-3} more</button>:null}
            </div>;
          })}
        </div>
      </div>
    </section>
    <div style={{...card,display:"grid",gap:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
        <div><strong style={{color:"#0f172a"}}>Jobs without a completion date ({undated.length})</strong><div style={{fontSize:12,color:"#64748b",marginTop:3}}>Assign a due date to show the job on the calendar.</div></div>
        <button style={button} type="button" onClick={()=>setShowUnscheduled(value=>!value)}>{showUnscheduled?"Hide":"Show jobs"}</button>
      </div>
      {showUnscheduled?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:8}}>{undated.map(job=><button key={job.jobId} type="button" onClick={()=>setSelected(job)} style={{...button,textAlign:"left",height:"auto"}}><strong style={{display:"block"}}>{job.projectName}</strong><span style={{display:"block",color:"#64748b",fontSize:12,marginTop:3}}>{job.clientName}</span></button>)}</div>:null}
    </div>
    {selected?<section role="region" aria-label="Selected job completion date" style={{...card,borderColor:"#b6c9ec",display:"grid",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"flex-start"}}>
        <div><h2 style={{fontSize:18,margin:"0 0 5px"}}>{selected.projectName}</h2><div style={{fontSize:12,color:"#64748b"}}>{selected.clientName} · {selected.quoteNumber??"Production Job"}</div></div>
        <button type="button" onClick={()=>setSelectedId(null)} style={button} aria-label="Close selected job">✕</button>
      </div>
      <div style={{display:"flex",alignItems:"flex-end",flexWrap:"wrap",gap:10}}>
        <label style={{fontWeight:800,fontSize:13,color:"#334155",display:"grid",gap:5}}>Completed by
          <input disabled={!canEdit||busy} type="date" value={dateDraft} onChange={e=>setDateDraft(e.target.value)} style={{...button,minWidth:170}}/>
        </label>
        {canEdit?<button type="button" disabled={busy||dateDraft===(selected.dueDate??"")} onClick={()=>void save()} style={{...button,background:"#2456d3",color:"#fff",border:0,opacity:busy?.6:1}}>{busy?"Saving…":"Save date"}</button>:null}
        <Link href={`/production/${selected.jobId}`} prefetch={false} style={{...button,textDecoration:"none",display:"inline-flex",alignItems:"center"}}>Open Production Job</Link>
        {selected.projectId?<Link prefetch={false} href={`/projects/${selected.projectId}`} style={{...button,textDecoration:"none",display:"inline-flex",alignItems:"center"}}>Open Gantt</Link>:null}
      </div>
      {error?<div role="alert" style={{color:"#b42318",fontSize:12}}>{error}</div>:null}
      {notice?<div role="status" style={{color:"#067647",fontSize:12}}>{notice}</div>:null}
    </section>:notice?<div role="status" style={{fontSize:12,color:"#475569"}}>{notice}</div>:null}
  </main>;
}
