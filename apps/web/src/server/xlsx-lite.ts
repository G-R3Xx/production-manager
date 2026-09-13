import "server-only";

import { inflateRawSync } from "node:zlib";

export type XlsxCell = string | number | boolean | null | undefined;
export type XlsxDataValidation = {
  sqref: string;
  values: string[];
  allowBlank?: boolean;
};

export type XlsxSheetInput = {
  name: string;
  rows: XlsxCell[][];
  columnWidths?: number[];
  freezeRows?: number;
  headerRow?: number;
  moneyColumns?: number[];
  sectionRows?: number[];
  dataValidations?: XlsxDataValidation[];
};

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function colName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function colIndex(reference: string): number {
  const letters = reference.replace(/[^A-Z]/gi, "").toUpperCase();
  let value = 0;
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

function cellXml(value: XlsxCell, row: number, col: number, styleId = 0): string {
  const ref = `${colName(col)}${row}`;
  const style = styleId ? ` s="${styleId}"` : "";
  if (value == null || value === "") return `<c r="${ref}"${style}/>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheetInput): string {
  const headerRow = sheet.headerRow ?? 1;
  const money = new Set(sheet.moneyColumns ?? []);
  const sections = new Set(sheet.sectionRows ?? []);
  const cols = (sheet.columnWidths ?? []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(8, Math.min(48, width))}" customWidth="1"/>`).join("");
  const rows = sheet.rows.map((values, zeroIndex) => {
    const rowNo = zeroIndex + 1;
    const cells = values.map((value, col) => {
      let styleId = 0;
      if (rowNo === 1) styleId = 1;
      else if (rowNo < headerRow) styleId = 2;
      else if (rowNo === headerRow) styleId = 3;
      else if (sections.has(rowNo)) styleId = 5;
      else if (money.has(col)) styleId = 4;
      return cellXml(value, rowNo, col, styleId);
    }).join("");
    return `<row r="${rowNo}">${cells}</row>`;
  }).join("");
  const freeze = (sheet.freezeRows ?? 0) > 0
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${(sheet.freezeRows ?? 0) + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const maxCols = Math.max(1, ...sheet.rows.map((row) => row.length));
  const maxRows = Math.max(1, sheet.rows.length);
  const validations = (sheet.dataValidations ?? []).filter((item) => item.sqref && item.values.length).map((item) => {
    const list = item.values.join(",").replace(/"/g, '""');
    return `<dataValidation type="list" allowBlank="${item.allowBlank === false ? 0 : 1}" showErrorMessage="1" errorTitle="Choose a value from the list" error="Use the dropdown values supplied by Production Manager." sqref="${xmlEscape(item.sqref)}"><formula1>&quot;${xmlEscape(list)}&quot;</formula1></dataValidation>`;
  }).join("");
  const dataValidations = validations ? `<dataValidations count="${sheet.dataValidations?.filter((item) => item.sqref && item.values.length).length ?? 0}">${validations}</dataValidations>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${colName(maxCols - 1)}${maxRows}"/>${freeze}` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows}</sheetData>${dataValidations}<autoFilter ref="A${headerRow}:${colName(maxCols - 1)}${maxRows}"/>` +
    `</worksheet>`;
}

export function buildXlsxWorkbook(sheets: XlsxSheetInput[]): Buffer {
  const safeSheets = sheets.map((sheet, index) => ({ ...sheet, name: (sheet.name || `Sheet ${index + 1}`).replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) }));
  const workbookSheets = safeSheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbookRels = safeSheets.map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const contentSheets = safeSheets.map((_sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");

  const entries: Array<{ name: string; data: Buffer }> = [
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentSheets}</Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00000"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF1D4ED8"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0"><alignment wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0"><alignment wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) }
  ];
  safeSheets.forEach((sheet, index) => entries.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: Buffer.from(sheetXml(sheet)) }));
  return zipStore(entries);
}

function unzipEntries(buffer: Buffer): Map<string, Buffer> {
  let eocd = -1;
  const min = Math.max(0, buffer.length - 65557);
  for (let index = buffer.length - 22; index >= min; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("Invalid XLSX file: ZIP directory was not found.");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid XLSX ZIP directory.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid XLSX ZIP entry.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported XLSX compression method ${method}.`);
    files.set(name.replace(/^\/+/, ""), data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function attrMap(fragment: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  fragment.replace(/([\w:.-]+)="([^"]*)"/g, (_match, key, value) => { attrs[key] = xmlDecode(value); return ""; });
  return attrs;
}

function sharedStringValues(xml: string): string[] {
  const values: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlDecode(part[1]));
    values.push(parts.join(""));
  }
  return values;
}

function parseWorksheet(xml: string, shared: string[]): XlsxCell[][] {
  const cells = new Map<number, Map<number, XlsxCell>>();
  let maxRow = 0;
  let maxCol = 0;
  for (const match of xml.matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = attrMap(match[1] || match[2] || "");
    const ref = attrs.r || "A1";
    const rowMatch = ref.match(/(\d+)$/);
    const row = rowMatch ? Math.max(0, Number(rowMatch[1]) - 1) : 0;
    const col = colIndex(ref);
    const body = match[3] || "";
    const type = attrs.t || "";
    let value: XlsxCell = "";
    if (type === "inlineStr") {
      value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => xmlDecode(item[1])).join("");
    } else {
      const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      const raw = valueMatch ? xmlDecode(valueMatch[1]) : "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "b") value = raw === "1";
      else if (type === "str") value = raw;
      else value = raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    }
    if (!cells.has(row)) cells.set(row, new Map());
    cells.get(row)!.set(col, value);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }
  const rows: XlsxCell[][] = [];
  for (let row = 0; row <= maxRow; row += 1) {
    const values: XlsxCell[] = [];
    for (let col = 0; col <= maxCol; col += 1) values.push(cells.get(row)?.get(col) ?? "");
    rows.push(values);
  }
  return rows;
}

function normaliseZipPath(base: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const parts = `${base}/${target}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop(); else stack.push(part);
  }
  return stack.join("/");
}

export function parseXlsxWorkbook(buffer: Buffer): Array<{ name: string; rows: XlsxCell[][] }> {
  const files = unzipEntries(buffer);
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) throw new Error("Invalid XLSX workbook structure.");
  const relationshipMap = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
    const attrs = attrMap(match[1]);
    if (attrs.Id && attrs.Target) relationshipMap.set(attrs.Id, normaliseZipPath("xl", attrs.Target));
  }
  const shared = files.get("xl/sharedStrings.xml") ? sharedStringValues(files.get("xl/sharedStrings.xml")!.toString("utf8")) : [];
  const result: Array<{ name: string; rows: XlsxCell[][] }> = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/g)) {
    const attrs = attrMap(match[1]);
    const target = relationshipMap.get(attrs["r:id"] || "");
    if (!target) continue;
    const xml = files.get(target)?.toString("utf8");
    if (!xml) continue;
    result.push({ name: attrs.name || `Sheet ${result.length + 1}`, rows: parseWorksheet(xml, shared) });
  }
  return result;
}
