import "server-only";

import { inflateSync, deflateSync } from "node:zlib";
import type { CompanySettingsRecord } from "@/server/company";
import type { QuoteDraftRecord, QuoteLineRecord } from "@/server/quotes";

const A4: [number, number] = [595.28, 841.89];
const MAX_FETCH_BYTES = 5 * 1024 * 1024;

type PdfObject = Buffer | null;
type EmbeddedImage = { objectId: number; width: number; height: number };

type QuotePdfResult = { fileName: string; bytes: Uint8Array };

class PdfBuilder {
  private objects: PdfObject[] = [];
  reserve(): number { this.objects.push(null); return this.objects.length; }
  add(content: string | Buffer): number { this.objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii")); return this.objects.length; }
  set(id: number, content: string | Buffer): void { this.objects[id - 1] = Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii"); }
  stream(dictionary: string, bytes: Uint8Array): number {
    const data = Buffer.from(bytes);
    return this.add(Buffer.concat([Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, "ascii"), data, Buffer.from("\nendstream", "ascii")]));
  }
  serialize(rootId: number): Uint8Array {
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%PMQUOTE\n", "ascii")];
    const offsets = [0];
    let cursor = chunks[0].length;
    this.objects.forEach((object, index) => {
      if (!object) throw new Error(`Quote PDF object ${index + 1} was not initialised.`);
      offsets.push(cursor);
      const head = Buffer.from(`${index + 1} 0 obj\n`, "ascii");
      const tail = Buffer.from("\nendobj\n", "ascii");
      chunks.push(head, object, tail);
      cursor += head.length + object.length + tail.length;
    });
    const xrefOffset = cursor;
    const xref: string[] = [`xref\n0 ${this.objects.length + 1}\n`, "0000000000 65535 f \n"];
    for (let i = 1; i <= this.objects.length; i += 1) xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    chunks.push(Buffer.from(xref.join(""), "ascii"));
    return new Uint8Array(Buffer.concat(chunks));
  }
}

function safeText(value: unknown): string {
  return String(value ?? "")
    .replace(/×/g, "x").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, " ").replace(/[\t ]+/g, " ").trim();
}
function pdfEscape(value: unknown): string { return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function textOp(text: string, x: number, y: number, size = 10, bold = false, grey = 0): string {
  const g = Math.max(0, Math.min(1, grey));
  return `${g.toFixed(3)} g BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(text)}) Tj ET\n`;
}
function lineOp(x1: number, y1: number, x2: number, y2: number, width = 0.7, grey = 0.86): string {
  const g = Math.max(0, Math.min(1, grey));
  return `${g.toFixed(3)} G ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
}
function rectFillOp(x: number, y: number, width: number, height: number, r: number, g: number, b: number): string {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f\n`;
}
function wrapText(value: string, maxChars: number): string[] {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = []; let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}
function safeFilePart(value: unknown, fallback: string): string {
  const cleaned = safeText(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || fallback;
}
function money(value: number): string { return `$${value.toFixed(2)}`; }
function numberValue(value: string | number | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, "")); return Number.isFinite(parsed) ? parsed : 0;
}
function dateAu(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return safeText(value) || "";
  return date.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "short", year: "numeric" });
}

function readUint32(bytes: Uint8Array, offset: number): number { return ((bytes[offset]! << 24) | (bytes[offset+1]! << 16) | (bytes[offset+2]! << 8) | bytes[offset+3]!) >>> 0; }
function concatUint8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const out = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; } return out;
}
function paeth(a:number,b:number,c:number):number { const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c); if(pa<=pb&&pa<=pc)return a; if(pb<=pc)return b; return c; }
function unfilterPng(data: Uint8Array, width: number, height: number, bpp: number, rowBytes: number): Uint8Array {
  const out = new Uint8Array(height*rowBytes); let src=0;
  for(let y=0;y<height;y+=1){ const filter=data[src++]!; const ro=y*rowBytes, po=(y-1)*rowBytes;
    for(let x=0;x<rowBytes;x+=1){ const raw=data[src++]!, left=x>=bpp?out[ro+x-bpp]!:0, up=y>0?out[po+x]!:0, ul=y>0&&x>=bpp?out[po+x-bpp]!:0; let v=raw;
      if(filter===1)v=(raw+left)&255; else if(filter===2)v=(raw+up)&255; else if(filter===3)v=(raw+Math.floor((left+up)/2))&255; else if(filter===4)v=(raw+paeth(left,up,ul))&255; else if(filter!==0) throw new Error(`Unsupported PNG filter ${filter}.`); out[ro+x]=v; }
  } return out;
}
function embedJpeg(pdf: PdfBuilder, bytes: Uint8Array): EmbeddedImage {
  let offset=2,width=0,height=0,components=3;
  while(offset+8<bytes.length){ if(bytes[offset]!==0xff){offset+=1;continue;} while(bytes[offset]===0xff)offset+=1; const marker=bytes[offset++]!; if(marker===0xd8||marker===0xd9)continue; if(offset+2>bytes.length)break; const length=(bytes[offset]!<<8)|bytes[offset+1]!; if(length<2||offset+length>bytes.length)break; const sof=(marker>=0xc0&&marker<=0xc3)||(marker>=0xc5&&marker<=0xc7)||(marker>=0xc9&&marker<=0xcb)||(marker>=0xcd&&marker<=0xcf); if(sof&&length>=8){height=(bytes[offset+3]!<<8)|bytes[offset+4]!;width=(bytes[offset+5]!<<8)|bytes[offset+6]!;components=bytes[offset+7]||3;break;} offset+=length; }
  if(!width||!height)throw new Error("Quote logo JPEG dimensions could not be read."); const cs=components===1?"/DeviceGray":components===4?"/DeviceCMYK":"/DeviceRGB";
  return { objectId: pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode`,bytes),width,height };
}
function embedPng(pdf: PdfBuilder, bytes: Uint8Array): EmbeddedImage {
  const sig=[137,80,78,71,13,10,26,10]; if(!sig.every((v,i)=>bytes[i]===v))throw new Error("Invalid quote logo PNG.");
  let offset=8,width=0,height=0,bitDepth=0,colorType=-1; const idat:Uint8Array[]=[]; let palette:Uint8Array|null=null, transparency:Uint8Array|null=null;
  while(offset+12<=bytes.length){ const length=readUint32(bytes,offset), type=String.fromCharCode(bytes[offset+4]!,bytes[offset+5]!,bytes[offset+6]!,bytes[offset+7]!); const ds=offset+8,de=ds+length; if(de+4>bytes.length)break; const chunk=bytes.slice(ds,de); if(type==="IHDR"){width=readUint32(chunk,0);height=readUint32(chunk,4);bitDepth=chunk[8]!;colorType=chunk[9]!;} else if(type==="IDAT")idat.push(chunk); else if(type==="PLTE")palette=chunk; else if(type==="tRNS")transparency=chunk; else if(type==="IEND")break; offset=de+4; }
  if(!width||!height||!idat.length||bitDepth!==8)throw new Error("Quote logo PNG is unsupported."); const compressed=concatUint8(idat);
  if(colorType===0||colorType===2){const colors=colorType===0?1:3,cs=colorType===0?"/DeviceGray":"/DeviceRGB"; return {objectId:pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${width} >>`,compressed),width,height};}
  if(colorType===3){if(!palette?.length)throw new Error("Quote logo PNG palette missing."); const max=Math.max(0,Math.floor(palette.length/3)-1); let smask:number|null=null; if(transparency?.length){const raw=unfilterPng(new Uint8Array(inflateSync(compressed)),width,height,1,width),alpha=new Uint8Array(width*height);for(let i=0;i<raw.length;i+=1)alpha[i]=transparency[raw[i]!]??255;smask=pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,new Uint8Array(deflateSync(alpha)));} const sm=smask?` /SMask ${smask} 0 R`:""; return {objectId:pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace [/Indexed /DeviceRGB ${max} <${Buffer.from(palette).toString("hex").toUpperCase()}>] /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${width} >>${sm}`,compressed),width,height};}
  if(colorType===4||colorType===6){const channels=colorType===4?2:4,raw=unfilterPng(new Uint8Array(inflateSync(compressed)),width,height,channels,width*channels),cc=colorType===4?1:3,colour=new Uint8Array(width*height*cc),alpha=new Uint8Array(width*height);for(let p=0;p<width*height;p+=1){if(colorType===4){colour[p]=raw[p*2]!;alpha[p]=raw[p*2+1]!;}else{colour[p*3]=raw[p*4]!;colour[p*3+1]=raw[p*4+1]!;colour[p*3+2]=raw[p*4+2]!;alpha[p]=raw[p*4+3]!;}} const sm=pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,new Uint8Array(deflateSync(alpha))); const cs=colorType===4?"/DeviceGray":"/DeviceRGB"; return {objectId:pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /FlateDecode /SMask ${sm} 0 R`,new Uint8Array(deflateSync(colour))),width,height};}
  throw new Error("Quote logo PNG colour type is unsupported.");
}
async function fetchImage(url:string):Promise<{bytes:Uint8Array;contentType:string}> { const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(15_000)}); if(!r.ok)throw new Error(`Could not download quote logo (${r.status}).`); const ab=await r.arrayBuffer(); if(ab.byteLength>MAX_FETCH_BYTES)throw new Error("Quote logo is over 5MB."); return {bytes:new Uint8Array(ab),contentType:r.headers.get("content-type")||""}; }

function compactText(value: string | null | undefined): string { return String(value ?? "").replace(/\s+/g," ").trim(); }
function record(value: unknown): Record<string,unknown>|null { return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null; }
function summaryParts(line: Pick<QuoteLineRecord,"optionSummary">):string[]{return String(line.optionSummary??"").split(/\s+·\s+/g).map(compactText).filter(Boolean);}
function cleanDimensionNumber(value:string):string{const n=Number(value);return Number.isFinite(n)?n.toFixed(2).replace(/\.00$/g,"").replace(/(\.\d)0$/g,"$1"):value;}
function normaliseDimension(value:string|null|undefined):string{const s=compactText(value),m=s.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)(?:\s*(mm|m))?/i);return m?`${cleanDimensionNumber(m[1])}x${cleanDimensionNumber(m[2])}${m[3]?.toLowerCase()||"mm"}`:s;}
function dimensionFromText(value:string|null|undefined):string|null{const m=compactText(value).match(/\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*(?:mm|m)?/i);return m?normaliseDimension(m[0]):null;}
function isStandaloneDimensionPart(v:string|null|undefined):boolean{return /^\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*(?:mm|m)?$/i.test(compactText(v));}
function isLikelyStockOrMaterialDimension(v:string|null|undefined):boolean{const s=compactText(v).toLowerCase();return /\b(material|substrate|stock|sheet|parent sheet|roll|media|acm|aluminium|composite|acrylic|corflute|pvc|vinyl|banner|paper|card|gsm)\b/.test(s)&&/\b\d+(?:\.\d+)?\s*mm\b/.test(s);}
function findDimension(parts:string[],fallback:string):string|null{const labelled=parts.find(p=>/^(?:finished\s*)?size\s*:/i.test(p)); const a=dimensionFromText(labelled); if(a)return a; const standalone=parts.find(isStandaloneDimensionPart),b=dimensionFromText(standalone);if(b)return b;const nonStock=parts.find(p=>dimensionFromText(p)&&!isLikelyStockOrMaterialDimension(p));return dimensionFromText(nonStock)||dimensionFromText(fallback);}
function titleCaseLabel(v:string|null|undefined):string{return compactText(v).split(/\s+/).map(w=>{const l=w.toLowerCase();if(["acm","pvc","cmyk","ncr","abn","pms"].includes(l))return l.toUpperCase();return /^\d/.test(w)?w:l.charAt(0).toUpperCase()+l.slice(1);}).join(" ");}
function cleanBaseMaterialName(v:string|null|undefined):string{const p=compactText(v),first=compactText(p.split(" - ")[0]??p);return titleCaseLabel(first||p||"Quote item");}
function cleanSelectedMaterialName(line:Pick<QuoteLineRecord,"productName"|"optionSummary">):string{const parts=summaryParts(line),sel=parts.find(p=>/^(?:substrate|stock|material)\s*:/i.test(p));if(sel)return compactText(sel.replace(/^(?:substrate|stock|material)\s*:\s*/i,""));const base=cleanBaseMaterialName(line.productName),mp=parts.find(p=>p.toLowerCase().includes(base.toLowerCase())&&/\b\d+(?:\.\d+)?\s*mm\b/i.test(p));return compactText(mp||line.productName.replace(/^.+?\s+-\s+/i,"")||base);}
function clientMaterialTitle(v:string|null|undefined):string{const s=compactText(v);return s.replace(/\s*[—-]\s*\d+(?:\.\d+)?\s*(?:sheets?|sheet(?:s)?\s+used|lm|linear\s*m(?:etre)?s?|m²|sqm)\s*(?:calculated|used)?\s*$/i,"").replace(/\s*[-–—]?\s*\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?(?:\s*mm)?\s*$/i,"").trim()||s;}
function snapshotCustomerMaterialName(snapshot:Record<string,unknown>|null|undefined,key:string):string|null{const ms=record(snapshot?.materialSnapshots),m=record(ms?.[key]);return compactText(typeof m?.customerFacingName==="string"?m.customerFacingName:typeof m?.name==="string"?m.name:null)||null;}
function stripClientUsage(v:string):string{return compactText(v).replace(/\s*[—–-]\s*\d+(?:\.\d+)?\s*(?:lm|linear\s*m(?:etre)?s?|metres?|meters?|m²|sqm|sheets?|sheet(?:s)?\s+used)\s*(?:calculated|used)?\s*$/i,"").trim();}
function friendlyLaminate(raw:string|null|undefined):string|null{const v=stripClientUsage(compactText(raw).replace(/^laminate:\s*/i,"").replace(/^coating:\s*/i,""));if(!v||/^none$/i.test(v))return null;const l=v.toLowerCase();if(l.includes("whiteboard")||l.includes("white board"))return "White Board Laminate";if(l.includes("anti graffiti"))return "Anti Graffiti Laminate";if(l.includes("gloss"))return "Gloss Laminate";if(l.includes("matt")||l.includes("matte"))return "Matt Laminate";return /laminate/i.test(v)?titleCaseLabel(v):`${titleCaseLabel(v)} Laminate`;}
function friendlyStandoffs(raw:string|null|undefined):string|null{const v=compactText(raw).replace(/^standoffs:\s*/i,"");if(!v)return null;const m=v.match(/^(.*?)\s*[×x]\s*(\d+(?:\.\d+)?)$/i);return m?`${compactText(m[1])} x ${m[2]}`:v;}
function isInstallLine(line:Pick<QuoteLineRecord,"productName">):boolean{return /^(sign install|installation|install)$/i.test(compactText(line.productName))||/\b(sign install|installation service)\b/i.test(line.productName);}
function clientLineTitle(line:QuoteLineRecord):string{
  if(isInstallLine(line))return "Sign Install";
  if(/^access equipment\b/i.test(compactText(line.productName))) return line.productName;
  const parts=summaryParts(line),combined=[line.productName,line.optionSummary].filter(Boolean).join(" · "), base=cleanBaseMaterialName(line.productName),selected=cleanSelectedMaterialName(line),material=clientMaterialTitle(selected)||base,dim=findDimension(parts,combined);
  const lamName=snapshotCustomerMaterialName(line.configurationSnapshot,"laminate"),lam=lamName?stripClientUsage(lamName):friendlyLaminate(parts.find(p=>/^laminate:/i.test(p)));
  const stName=snapshotCustomerMaterialName(line.configurationSnapshot,"standoff"),stPart=parts.find(p=>/^standoffs:/i.test(p)),qm=compactText(stPart).match(/[×x]\s*(\d+(?:\.\d+)?)\s*$/i),st=stName&&qm?`${stName} x ${qm[1]}`:friendlyStandoffs(stPart);
  return [material,dim,lam,st].filter(Boolean).join(" · ")||line.productName;
}

function buildPageContent(input:{
  pageIndex:number; pageCount:number; quote:QuoteDraftRecord; lines:QuoteLineRecord[]; company:CompanySettingsRecord|null; logo:EmbeddedImage|null; lineStart:number; lineEnd:number;
}):string{
  const [pageW,pageH]=A4, margin=38, right=pageW-margin; let out="";
  out+=rectFillOp(0,0,pageW,pageH,1,1,1);
  out+=rectFillOp(0,pageH-10,pageW,10,0.08,0.66,0.72);
  if(input.logo){const maxW=160,maxH=50,scale=Math.min(maxW/input.logo.width,maxH/input.logo.height),w=input.logo.width*scale,h=input.logo.height*scale;out+=`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${margin} ${(pageH-43-h/2).toFixed(2)} cm /Logo Do Q\n`;}
  else out+=textOp(input.company?.tradingName||input.company?.companyLegalName||"Production Manager",margin,pageH-48,15,true,0.08);
  const companyLine1=[input.company?.companyLegalName,input.company?.abn?`ABN ${input.company.abn}`:null].filter(Boolean).join("  ·  ");
  const companyLine2=[input.company?.phone,input.company?.email,input.company?.address].filter(Boolean).join("  ·  ");
  if(companyLine1)out+=textOp(companyLine1,margin,pageH-77,7.2,false,0.38);
  if(companyLine2)out+=textOp(companyLine2,margin,pageH-89,7.2,false,0.38);
  out+=textOp("QUOTE",right-58,pageH-42,8,true,0.4);
  out+=textOp(input.quote.quoteNumber||"DRAFT",right-150,pageH-64,18,true,0.06);
  out+=textOp(`Issued ${dateAu(input.quote.sentAt||input.quote.createdAt)}`,right-150,pageH-82,8,false,0.42);
  out+=lineOp(margin,pageH-100,right,pageH-100,0.7,0.86);
  let y=pageH-128;
  if(input.pageIndex===0){
    out+=textOp(input.quote.clientName,margin,y,13,true,0.08); out+=textOp(input.quote.jobName||"Quote",330,y,13,true,0.08); y-=18;
    if(input.quote.contactName)out+=textOp(`Contact: ${input.quote.contactName}`,margin,y,8.8,false,0.32);
    out+=textOp(`Reference: ${input.quote.quoteNumber||"-"}`,330,y,8.8,false,0.32); y-=15;
    if(input.quote.email)out+=textOp(`Email: ${input.quote.email}`,margin,y,8.8,false,0.32); y-=15;
    if(input.quote.phone)out+=textOp(`Phone: ${input.quote.phone}`,margin,y,8.8,false,0.32); y-=20;
    out+=lineOp(margin,y,right,y,0.7,0.88); y-=28;
  }
  out+=textOp("QUOTE DETAILS",margin,y,14,true,0.08); y-=24;
  const lineH=67;
  for(let i=input.lineStart;i<input.lineEnd;i+=1){const line=input.lines[i]!; const title=clientLineTitle(line); const qty=numberValue(line.quantity),unit=numberValue(line.unitPrice),total=numberValue(line.lineTotal);
    out+=rectFillOp(margin,y-lineH+8,right-margin,lineH-2,0.985,0.991,1);
    const titleLines=wrapText(title,62).slice(0,2); titleLines.forEach((t,idx)=>{out+=textOp(t,margin+12,y-15-idx*13,10.2,idx===0,0.08);});
    out+=textOp(`Qty ${qty.toFixed(2).replace(/\.00$/,"")} · ${money(unit)} ea`,right-170,y-24,8.2,false,0.38);
    out+=textOp(money(total),right-76,y-24,11.2,true,0.08);
    y-=lineH;
  }
  if(input.lineEnd===input.lines.length){
    const subtotal=input.lines.reduce((s,l)=>s+numberValue(l.lineTotal),0),gst=subtotal*0.1,total=subtotal+gst;
    y-=8; out+=lineOp(330,y,right,y,0.6,0.86); y-=22;
    out+=textOp("Subtotal",360,y,9,false,0.22);out+=textOp(money(subtotal),right-78,y,10,true,0.08);y-=20;
    out+=textOp("GST",360,y,9,false,0.22);out+=textOp(money(gst),right-78,y,10,true,0.08);y-=24;
    out+=textOp("Total",360,y,13,false,0.08);out+=textOp(money(total),right-90,y,15,true,0.05);y-=34;
    out+=rectFillOp(margin,54,right-margin,64,0.965,0.977,0.992);
    out+=textOp("CLIENT REVIEW",margin+14,99,8,true,0.1);
    wrapText("Please review the quote carefully. If your organisation blocks the online quote page, reply to the quote email with APPROVED or list the changes required. Tender Edge staff can record your email response in Production Manager.",88).slice(0,3).forEach((t,idx)=>{out+=textOp(t,margin+14,83-idx*12,8,false,0.3);});
  }
  out+=textOp(`Page ${input.pageIndex+1} of ${input.pageCount}`,right-60,22,7,false,0.5);
  return out;
}

export async function buildQuotePdf(input:{quote:QuoteDraftRecord;lines:QuoteLineRecord[];company:CompanySettingsRecord|null;companyLogoUrl?:string|null;fallbackLogoUrl?:string|null;}):Promise<QuotePdfResult>{
  const lines=input.lines.filter(l=>!l.clientRevisionExcluded&&l.clientResponseStatus!=="cancelled"&&record(l.configurationSnapshot)?.surveyNeedsConfiguration!==true);
  if(!lines.length)throw new Error("Quote PDF has no configured client-facing line items.");
  const pdf=new PdfBuilder(),catalogId=pdf.reserve(),pagesId=pdf.reserve(),fontId=pdf.reserve(),boldFontId=pdf.reserve();
  pdf.set(fontId,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");pdf.set(boldFontId,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  let logo:EmbeddedImage|null=null;const logoUrl=input.companyLogoUrl||input.fallbackLogoUrl||"";
  if(logoUrl){try{const downloaded=await fetchImage(logoUrl); if(downloaded.bytes[0]===0x89)logo=embedPng(pdf,downloaded.bytes); else if(downloaded.bytes[0]===0xff)logo=embedJpeg(pdf,downloaded.bytes);}catch{logo=null;}}
  const firstCapacity=7,nextCapacity=9;const ranges:Array<[number,number]>=[];let start=0;while(start<lines.length){const cap=start===0?firstCapacity:nextCapacity;ranges.push([start,Math.min(lines.length,start+cap)]);start+=cap;}
  const pageIds:number[]=[];ranges.forEach(([a,b],idx)=>{const resources=`/Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>${logo?` /XObject << /Logo ${logo.objectId} 0 R >>`:""}`;const content=buildPageContent({pageIndex:idx,pageCount:ranges.length,quote:input.quote,lines,company:input.company,logo,lineStart:a,lineEnd:b});const stream=pdf.stream("",Buffer.from(content,"ascii"));pageIds.push(pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << ${resources} >> /Contents ${stream} 0 R >>`));});
  pdf.set(pagesId,`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] >>`);pdf.set(catalogId,`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const fileName=`${safeFilePart(input.quote.quoteNumber||"Quote","Quote")}-${safeFilePart(input.quote.jobName||input.quote.clientName||"Quote","Quote")}.pdf`;
  return {fileName,bytes:pdf.serialize(catalogId)};
}
