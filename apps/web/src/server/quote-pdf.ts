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
function snapshotPrimaryCustomerMaterialName(snapshot:Record<string,unknown>|null|undefined):string|null{
  // Roll-print products store the selected print media in `media`, while rigid
  // panel products store their substrate in `main`. Prefer the saved
  // customer-facing material name so the emailed PDF matches the public quote
  // and never leaks supplier/internal stock naming such as Avery/Aslan SKUs.
  return snapshotCustomerMaterialName(snapshot,"media")
    || snapshotCustomerMaterialName(snapshot,"main")
    || snapshotCustomerMaterialName(snapshot,"smallStock")
    || null;
}
function clientLineTitle(line:QuoteLineRecord):string{
  if(isInstallLine(line))return "Sign Install";
  if(/^access equipment\b/i.test(compactText(line.productName))) return line.productName;
  const parts=summaryParts(line),combined=[line.productName,line.optionSummary].filter(Boolean).join(" · "), base=cleanBaseMaterialName(line.productName),selected=cleanSelectedMaterialName(line);
  const savedMaterialName=snapshotPrimaryCustomerMaterialName(line.configurationSnapshot);
  const material=savedMaterialName?clientMaterialTitle(savedMaterialName):(clientMaterialTitle(selected)||base);
  const dim=findDimension(parts,combined);
  const lamName=snapshotCustomerMaterialName(line.configurationSnapshot,"laminate"),lam=lamName?stripClientUsage(lamName):friendlyLaminate(parts.find(p=>/^laminate:/i.test(p)));
  const stName=snapshotCustomerMaterialName(line.configurationSnapshot,"standoff"),stPart=parts.find(p=>/^standoffs:/i.test(p)),qm=compactText(stPart).match(/[×x]\s*(\d+(?:\.\d+)?)\s*$/i),st=stName&&qm?`${stName} x ${qm[1]}`:friendlyStandoffs(stPart);
  return [material,dim,lam,st].filter(Boolean).join(" · ")||line.productName;
}

type Rgb = readonly [number, number, number];
const PDF_COLOURS = {
  page: [0.973, 0.982, 0.994] as Rgb,
  white: [1, 1, 1] as Rgb,
  ink: [0.063, 0.094, 0.153] as Rgb,
  body: [0.278, 0.337, 0.404] as Rgb,
  muted: [0.400, 0.439, 0.522] as Rgb,
  line: [0.878, 0.906, 0.941] as Rgb,
  soft: [0.984, 0.992, 1] as Rgb,
  softBlue: [0.941, 0.965, 1] as Rgb,
  blue: [0.082, 0.373, 0.937] as Rgb,
  teal: [0.059, 0.463, 0.431] as Rgb,
};

function textRgbOp(text: string, x: number, y: number, size = 10, bold = false, color: Rgb = PDF_COLOURS.ink): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(text)}) Tj ET\n`;
}
function lineRgbOp(x1: number, y1: number, x2: number, y2: number, width: number, color: Rgb): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG ${width.toFixed(2)} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
}
function roundedRectOp(x: number, y: number, width: number, height: number, radius: number, fill: Rgb, stroke: Rgb = PDF_COLOURS.line, strokeWidth = 0.8): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const k = 0.5522847498;
  const c = r * k;
  const x2 = x + width;
  const y2 = y + height;
  const path = [
    `${(x + r).toFixed(1)} ${y.toFixed(1)} m`,
    `${(x2 - r).toFixed(1)} ${y.toFixed(1)} l`,
    `${(x2 - r + c).toFixed(1)} ${y.toFixed(1)} ${x2.toFixed(1)} ${(y + r - c).toFixed(1)} ${x2.toFixed(1)} ${(y + r).toFixed(1)} c`,
    `${x2.toFixed(1)} ${(y2 - r).toFixed(1)} l`,
    `${x2.toFixed(1)} ${(y2 - r + c).toFixed(1)} ${(x2 - r + c).toFixed(1)} ${y2.toFixed(1)} ${(x2 - r).toFixed(1)} ${y2.toFixed(1)} c`,
    `${(x + r).toFixed(1)} ${y2.toFixed(1)} l`,
    `${(x + r - c).toFixed(1)} ${y2.toFixed(1)} ${x.toFixed(1)} ${(y2 - r + c).toFixed(1)} ${x.toFixed(1)} ${(y2 - r).toFixed(1)} c`,
    `${x.toFixed(1)} ${(y + r).toFixed(1)} l`,
    `${x.toFixed(1)} ${(y + r - c).toFixed(1)} ${(x + r - c).toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} c`,
    "h",
  ].join(" ");
  return `${fill[0].toFixed(3)} ${fill[1].toFixed(3)} ${fill[2].toFixed(3)} rg ${stroke[0].toFixed(3)} ${stroke[1].toFixed(3)} ${stroke[2].toFixed(3)} RG ${strokeWidth.toFixed(2)} w ${path} B\n`;
}
function imageOp(resourceName: string, image: EmbeddedImage, x: number, y: number, maxWidth: number, maxHeight: number): string {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const dx = x + (maxWidth - width) / 2;
  const dy = y + (maxHeight - height) / 2;
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /${resourceName} Do Q\n`;
}
function addressLines(value: string | null | undefined, maxLines = 3): string[] {
  return String(value ?? "")
    .split(/\r?\n/g)
    .map((part) => safeText(part))
    .filter(Boolean)
    .slice(0, maxLines);
}
function noteLines(value: string | null | undefined, maxLines = 4): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const lines: string[] = [];
  for (const paragraph of raw.split(/\r?\n/g).map((part) => safeText(part)).filter(Boolean)) {
    lines.push(...wrapText(paragraph, 94));
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

type QuotePdfContext = {
  clientLogoUrl?: string | null;
  clientAddress?: string | null;
  siteAddress?: string | null;
  clientPurchaseOrderNumber?: string | null;
};

function buildPageContent(input:{
  pageIndex:number;
  pageCount:number;
  quote:QuoteDraftRecord;
  lines:QuoteLineRecord[];
  company:CompanySettingsRecord|null;
  logo:EmbeddedImage|null;
  clientLogo:EmbeddedImage|null;
  lineStart:number;
  lineEnd:number;
  context: QuotePdfContext;
}):string{
  const [pageW,pageH]=A4;
  const pageMargin=20;
  const cardX=24;
  const cardW=pageW-48;
  const innerX=40;
  const innerRight=pageW-40;
  const innerW=innerRight-innerX;
  let out="";
  out+=rectFillOp(0,0,pageW,pageH,...PDF_COLOURS.page);

  const finalPage=input.lineEnd===input.lines.length;
  const firstPage=input.pageIndex===0;
  const pageLineCount=input.lineEnd-input.lineStart;
  const notes=finalPage?noteLines(input.quote.notes,4):[];
  const notesHeight=notes.length?Math.max(66,34+notes.length*12):0;
  const reviewHeight=finalPage?66:0;
  const stackedFooterHeight=finalPage?reviewHeight+(notesHeight?notesHeight+10:0)+20:0;
  const naturalMainBottom=firstPage?410-pageLineCount*62:520-pageLineCount*62;
  const mainCardBottom=finalPage?Math.max(pageMargin+stackedFooterHeight,naturalMainBottom):pageMargin+34;

  // Main document card - visually mirrors the online quote container and closes
  // shortly after the totals instead of leaving a large blank page inside it.
  out+=roundedRectOp(cardX,mainCardBottom,cardW,pageH-pageMargin-mainCardBottom,16,PDF_COLOURS.white,PDF_COLOURS.line,0.9);

  // Header: large logo, company details and quote metadata.
  const headerTop=pageH-38;
  if(input.logo) out+=imageOp("Logo",input.logo,innerX,headerTop-84,155,62);
  else out+=textRgbOp(input.company?.tradingName||input.company?.companyLegalName||"Production Manager",innerX,headerTop-42,16,true,PDF_COLOURS.blue);

  const companyX=214;
  const legalName=input.company?.companyLegalName||input.company?.tradingName||"";
  if(legalName) out+=textRgbOp(legalName,companyX,headerTop-18,10.2,true,PDF_COLOURS.ink);
  let companyY=headerTop-36;
  if(input.company?.abn){out+=textRgbOp(`ABN ${input.company.abn}`,companyX,companyY,8.3,false,PDF_COLOURS.body);companyY-=14;}
  const phoneEmail=[input.company?.phone,input.company?.email].filter(Boolean).join(" · ");
  if(phoneEmail){out+=textRgbOp(phoneEmail,companyX,companyY,8.3,false,PDF_COLOURS.body);companyY-=14;}
  for(const line of addressLines(input.company?.address,3)){out+=textRgbOp(line,companyX,companyY,8.3,false,PDF_COLOURS.body);companyY-=13;}

  const metaX=416;
  out+=lineRgbOp(metaX-12,headerTop-87,metaX-12,headerTop+1,0.7,PDF_COLOURS.line);
  out+=textRgbOp("QUOTE NUMBER",innerRight-92,headerTop-17,7.4,true,PDF_COLOURS.muted);
  out+=textRgbOp(input.quote.quoteNumber||"DRAFT",metaX,headerTop-43,16.5,true,PDF_COLOURS.ink);
  out+=textRgbOp(`Issued ${dateAu(input.quote.sentAt||input.quote.createdAt)}`,metaX,headerTop-63,8,false,PDF_COLOURS.muted);
  out+=lineRgbOp(innerX,headerTop-98,innerRight,headerTop-98,0.7,PDF_COLOURS.line);

  let y=headerTop-117;
  if(firstPage){
    // Client and job information band.
    const clientLogoBox=input.clientLogo?54:0;
    if(input.clientLogo){
      out+=roundedRectOp(innerX,y-58,52,52,8,PDF_COLOURS.white,PDF_COLOURS.line,0.8);
      out+=imageOp("ClientLogo",input.clientLogo,innerX+4,y-54,44,44);
    }
    const clientX=innerX+clientLogoBox+10;
    out+=textRgbOp(input.quote.clientName,clientX,y-11,10.5,true,PDF_COLOURS.ink);
    let clientY=y-29;
    if(input.quote.contactName){out+=textRgbOp(`Contact: ${input.quote.contactName}`,clientX,clientY,8.6,false,PDF_COLOURS.body);clientY-=15;}
    if(input.quote.email){out+=textRgbOp(`Email: ${input.quote.email}`,clientX,clientY,8.6,false,PDF_COLOURS.body);clientY-=15;}
    if(input.quote.phone){out+=textRgbOp(`Phone: ${input.quote.phone}`,clientX,clientY,8.6,false,PDF_COLOURS.body);clientY-=15;}
    const clientAddress=addressLines(input.context.clientAddress,1)[0];
    if(clientAddress) out+=textRgbOp(`Address: ${clientAddress}`,clientX,clientY,8.2,false,PDF_COLOURS.body);

    const jobX=326;
    out+=lineRgbOp(jobX-16,y-62,jobX-16,y-5,0.7,PDF_COLOURS.line);
    out+=textRgbOp(input.quote.jobName||"Quote",jobX,y-11,10.5,true,PDF_COLOURS.ink);
    out+=textRgbOp(`Reference: ${input.quote.quoteNumber||"-"}`,jobX,y-29,8.6,false,PDF_COLOURS.body);
    let jobY=y-44;
    if(input.context.clientPurchaseOrderNumber){out+=textRgbOp(`Client PO: ${input.context.clientPurchaseOrderNumber}`,jobX,jobY,8.6,false,PDF_COLOURS.body);jobY-=15;}
    const site=addressLines(input.context.siteAddress,2);
    site.forEach((line,index)=>{out+=textRgbOp(`${index===0?"Site: ":""}${line}`,jobX,jobY-index*13,8.3,false,PDF_COLOURS.body);});
    y-=78;
    out+=lineRgbOp(innerX,y,innerRight,y,0.7,PDF_COLOURS.line);
    y-=30;
  } else {
    out+=textRgbOp(input.quote.jobName||input.quote.clientName,innerX,y-4,10.2,true,PDF_COLOURS.ink);
    out+=textRgbOp(`Continued · ${input.quote.quoteNumber||"Quote"}`,innerRight-132,y-4,8.2,false,PDF_COLOURS.muted);
    y-=28;
    out+=lineRgbOp(innerX,y,innerRight,y,0.7,PDF_COLOURS.line);
    y-=28;
  }

  out+=textRgbOp("Quote details",innerX,y,15,true,PDF_COLOURS.ink);
  y-=20;

  const lineH=62;
  for(let i=input.lineStart;i<input.lineEnd;i+=1){
    const line=input.lines[i]!;
    const title=clientLineTitle(line);
    const qty=numberValue(line.quantity),unit=numberValue(line.unitPrice),total=numberValue(line.lineTotal);
    const boxY=y-lineH;
    out+=roundedRectOp(innerX,boxY,innerW,lineH-7,11,PDF_COLOURS.soft,PDF_COLOURS.line,0.75);
    const titleLines=wrapText(title,58).slice(0,2);
    titleLines.forEach((part,index)=>{out+=textRgbOp(part,innerX+12,y-20-index*12,9.4,true,PDF_COLOURS.ink);});
    out+=textRgbOp(money(total),innerRight-146,y-21,10.8,true,PDF_COLOURS.ink);
    out+=textRgbOp(`Qty ${qty.toFixed(2).replace(/\.00$/,"" )} · ${money(unit)} ea`,innerRight-194,y-39,8,false,PDF_COLOURS.muted);
    y-=lineH;
  }

  if(finalPage){
    const subtotal=input.lines.reduce((sum,line)=>sum+numberValue(line.lineTotal),0);
    const gst=subtotal*0.1;
    const total=subtotal+gst;
    y-=4;
    out+=lineRgbOp(354,y,innerRight,y,0.65,PDF_COLOURS.line);
    y-=20;
    out+=textRgbOp("Subtotal",376,y,9.1,false,PDF_COLOURS.body); out+=textRgbOp(money(subtotal),innerRight-78,y,10,true,PDF_COLOURS.ink); y-=19;
    out+=textRgbOp("GST",376,y,9.1,false,PDF_COLOURS.body); out+=textRgbOp(money(gst),innerRight-78,y,10,true,PDF_COLOURS.ink); y-=23;
    out+=textRgbOp("Total",376,y,13,false,PDF_COLOURS.ink); out+=textRgbOp(money(total),innerRight-88,y,15,true,PDF_COLOURS.ink);

    // Notes and offline approval sit directly beneath the main quote card, like
    // the separate Notes/response cards on the online quote page.
    let nextTop=mainCardBottom-10;
    if(notes.length){
      const notesY=nextTop-notesHeight;
      out+=roundedRectOp(cardX,notesY,cardW,notesHeight,14,PDF_COLOURS.white,PDF_COLOURS.line,0.8);
      out+=textRgbOp("Notes",innerX,notesY+notesHeight-22,13,true,PDF_COLOURS.ink);
      notes.forEach((part,index)=>{out+=textRgbOp(part,innerX,notesY+notesHeight-41-index*12,8.5,false,PDF_COLOURS.body);});
      nextTop=notesY-10;
    }
    const reviewY=nextTop-reviewHeight;
    out+=roundedRectOp(cardX,reviewY,cardW,reviewHeight,14,PDF_COLOURS.softBlue,PDF_COLOURS.line,0.8);
    out+=textRgbOp("OFFLINE APPROVAL",innerX,reviewY+reviewHeight-19,7.5,true,PDF_COLOURS.blue);
    const review="If your organisation blocks the online quote link, review this PDF and reply to the quote email with APPROVED or list the changes required. Tender Edge staff can record your email response in Production Manager.";
    wrapText(review,102).slice(0,3).forEach((part,index)=>{out+=textRgbOp(part,innerX,reviewY+reviewHeight-36-index*11,7.9,false,PDF_COLOURS.body);});
  }

  out+=textRgbOp(`Page ${input.pageIndex+1} of ${input.pageCount}`,innerRight-54,12,6.8,false,PDF_COLOURS.muted);
  return out;
}

async function maybeEmbedImage(pdf: PdfBuilder, url: string | null | undefined): Promise<EmbeddedImage|null> {
  const value=String(url??"").trim();
  if(!value)return null;
  try{
    const downloaded=await fetchImage(value);
    if(downloaded.bytes[0]===0x89)return embedPng(pdf,downloaded.bytes);
    if(downloaded.bytes[0]===0xff)return embedJpeg(pdf,downloaded.bytes);
  }catch{
    return null;
  }
  return null;
}

export async function buildQuotePdf(input:{
  quote:QuoteDraftRecord;
  lines:QuoteLineRecord[];
  company:CompanySettingsRecord|null;
  companyLogoUrl?:string|null;
  fallbackLogoUrl?:string|null;
  clientLogoUrl?:string|null;
  clientAddress?:string|null;
  siteAddress?:string|null;
  clientPurchaseOrderNumber?:string|null;
}):Promise<QuotePdfResult>{
  const lines=input.lines.filter(line=>!line.clientRevisionExcluded&&line.clientResponseStatus!=="cancelled"&&record(line.configurationSnapshot)?.surveyNeedsConfiguration!==true);
  if(!lines.length)throw new Error("Quote PDF has no configured client-facing line items.");
  const pdf=new PdfBuilder(),catalogId=pdf.reserve(),pagesId=pdf.reserve(),fontId=pdf.reserve(),boldFontId=pdf.reserve();
  pdf.set(fontId,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pdf.set(boldFontId,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const logo=await maybeEmbedImage(pdf,input.companyLogoUrl||input.fallbackLogoUrl||null);
  const clientLogo=await maybeEmbedImage(pdf,input.clientLogoUrl||null);

  const firstCapacity=4,nextCapacity=4;
  const ranges:Array<[number,number]>=[];
  let start=0;
  while(start<lines.length){const cap=start===0?firstCapacity:nextCapacity;ranges.push([start,Math.min(lines.length,start+cap)]);start+=cap;}
  const context: QuotePdfContext={
    clientLogoUrl:input.clientLogoUrl,
    clientAddress:input.clientAddress,
    siteAddress:input.siteAddress,
    clientPurchaseOrderNumber:input.clientPurchaseOrderNumber,
  };
  const pageIds:number[]=[];
  ranges.forEach(([lineStart,lineEnd],pageIndex)=>{
    const xobjects=[logo?`/Logo ${logo.objectId} 0 R`:null,clientLogo?`/ClientLogo ${clientLogo.objectId} 0 R`:null].filter(Boolean).join(" ");
    const resources=`/Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>${xobjects?` /XObject << ${xobjects} >>`:""}`;
    const content=buildPageContent({pageIndex,pageCount:ranges.length,quote:input.quote,lines,company:input.company,logo,clientLogo,lineStart,lineEnd,context});
    const stream=pdf.stream("",Buffer.from(content,"ascii"));
    pageIds.push(pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << ${resources} >> /Contents ${stream} 0 R >>`));
  });
  pdf.set(pagesId,`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] >>`);
  pdf.set(catalogId,`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const fileName=`${safeFilePart(input.quote.quoteNumber||"Quote","Quote")}-${safeFilePart(input.quote.jobName||input.quote.clientName||"Quote","Quote")}.pdf`;
  return {fileName,bytes:pdf.serialize(catalogId)};
}
