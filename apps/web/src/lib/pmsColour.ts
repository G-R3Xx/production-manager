/**
 * Screen-only RGB approximations for common Pantone/PMS spot colours.
 * The PMS code remains the authoritative production/approval reference.
 * Values are intentionally used only for UI swatches and are never used for colour production.
 */
const PMS_HEX: Record<string, string> = {
  "yellow": "#FEDD00",
  "process-yellow": "#FCE300",
  "orange-021": "#FE5000",
  "warm-red": "#F9423A",
  "red-032": "#EF3340",
  "rubine-red": "#CE0058",
  "rhodamine-red": "#E10098",
  "purple": "#BB29BB",
  "violet": "#440099",
  "blue-072": "#10069F",
  "reflex-blue": "#001489",
  "process-blue": "#0085CA",
  "green": "#00AB84",
  "black": "#2D2926",
  "black-6": "#101820",

  "100": "#F6EB61", "101": "#F7EA48", "102": "#FCE300", "106": "#F9E547", "109": "#FFD100", "116": "#FFCD00",
  "123": "#FFC72C", "1235": "#FFB81C", "130": "#F2A900", "137": "#FFA300", "1495": "#FF8F1C", "151": "#FF8200",
  "158": "#E87722", "165": "#FF671F", "166": "#E35205", "177": "#FF808B", "178": "#FF585D", "1788": "#EE2737",
  "185": "#E4002B", "186": "#C8102E", "187": "#A6192E", "194": "#9B2743", "200": "#BA0C2F", "201": "#9D2235",
  "202": "#862633", "208": "#862041", "215": "#AC145A", "219": "#DA1884", "226": "#D0006F", "231": "#F277C6",
  "236": "#F1A7DC", "238": "#A45DBF", "253": "#AD1AAC", "254": "#981E97", "2592": "#9B26B6", "2602": "#87189D",
  "266": "#753BBD", "267": "#5F249F", "2685": "#330072", "270": "#B4B5DF", "2727": "#307FE2", "2728": "#0047BB",
  "278": "#8BB8E8", "279": "#418FDE", "285": "#0072CE", "286": "#0033A0", "287": "#003087", "288": "#002D72",
  "293": "#003DA5", "2935": "#0057B8", "2945": "#004C97", "296": "#051C2C", "299": "#00A3E0", "2995": "#00A9E0",
  "300": "#005EB8", "3005": "#0077C8", "301": "#004B87", "3015": "#00629B", "306": "#00B5E2", "307": "#006BA6",
  "320": "#009CA6", "321": "#008C95", "324": "#9CDBD9", "327": "#008675", "328": "#007367", "336": "#00664F",
  "340": "#00965E", "347": "#009A44", "348": "#00843D", "354": "#00B140", "355": "#009639", "361": "#43B02A",
  "368": "#78BE20", "373": "#CDEA80", "375": "#97D700", "376": "#84BD00", "382": "#C4D600", "386": "#E9EC6B",
  "420": "#C7C9C7", "423": "#898D8D", "425": "#545859", "427": "#D0D3D4", "428": "#C1C6C8", "429": "#A2AAAD",
  "430": "#7C878E", "431": "#5B6770", "432": "#333F48", "4505": "#998542", "471": "#B86125", "4715": "#956C58",
  "473": "#F0BF9B", "4755": "#D7C4B7", "485": "#DA291C", "4975": "#3F2021", "5235": "#D0BEC7", "5265": "#403A60",
  "5275": "#595478", "537": "#BBC7D6", "550": "#8DB9CA", "5615": "#5E7461", "5773": "#899064", "611": "#D7C826",
  "631": "#3EB1C8", "634": "#005F83", "644": "#9BB8D3", "667": "#7C6992", "699": "#F4C3CC", "709": "#EF6079",
  "721": "#DDA46F", "732": "#623412", "7402": "#ECD898", "7417": "#E04F39", "7455": "#3A5DAE", "7541": "#D9E1E2",
  "7542": "#A4BCC2", "7543": "#98A4AE", "7589": "#5C4738", "7611": "#DDBCB0", "7633": "#C4A4A7", "7639": "#936D73",
  "7666": "#5C4E63", "7740": "#3A913F",

  "cool-gray-1": "#D9D9D6", "cool-gray-2": "#D0D0CE", "cool-gray-3": "#C8C9C7", "cool-gray-4": "#BBBCBC",
  "cool-gray-5": "#B1B3B3", "cool-gray-6": "#A7A8AA", "cool-gray-7": "#97999B", "cool-gray-8": "#888B8D",
  "cool-gray-9": "#75787B", "cool-gray-10": "#63666A", "cool-gray-11": "#53565A",
  "warm-gray-1": "#D7D2CB", "warm-gray-2": "#CBC4BC", "warm-gray-3": "#BFB8AF", "warm-gray-4": "#B6ADA5",
  "warm-gray-5": "#ACA39A", "warm-gray-6": "#A59C94", "warm-gray-7": "#968C83", "warm-gray-8": "#8C8279",
  "warm-gray-9": "#83786F", "warm-gray-10": "#796E65", "warm-gray-11": "#6E6259",

  // Metallics cannot be faithfully represented on screen; these are only visual cues.
  "871": "#84754E", "872": "#85714D", "873": "#866D4B", "874": "#8B6F4E", "875": "#87674F", "876": "#8A6349", "877": "#8A8D8F",
};

function normalisePantoneKey(value: string): string {
  let key = String(value || "").trim().toLowerCase();
  key = key.replace(/^pantone\s+/i, "").replace(/^pms\s+/i, "");
  key = key.replace(/\s+(?:solid\s+)?(?:coated|uncoated)$/i, "");
  key = key.replace(/\s+[cu]$/i, "");
  key = key.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return key;
}

export type PmsScreenSwatch = {
  label: string;
  hex: string | null;
  metallic: boolean;
};

export function pmsScreenSwatch(value: string): PmsScreenSwatch {
  const label = String(value || "").trim();
  const key = normalisePantoneKey(label);
  const numeric = key.match(/^0*(\d{2,4})$/)?.[1] ?? "";
  const lookupKey = numeric || key;
  const metallic = /^(?:871|872|873|874|875|876|877)$/.test(lookupKey) || /metallic/i.test(label);
  return { label, hex: PMS_HEX[lookupKey] ?? null, metallic };
}

export function pmsScreenSwatches(value: string): PmsScreenSwatch[] {
  return String(value || "")
    .split(/\s+[·•]\s+|[,;\n]+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(pmsScreenSwatch);
}
