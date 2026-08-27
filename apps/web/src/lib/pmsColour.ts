import pantoneCoatedSource from "pantoner/json/pantone-coated.json";

/**
 * Screen-only RGB approximations for Pantone/PMS Solid Coated spot colours.
 * The PMS code remains the authoritative production/approval reference.
 * The bundled lookup comes from the MIT-licensed `pantoner` coated dataset.
 */
type PantoneSourceEntry = { pantone: string; hex: string };

export type PmsColourOption = {
  code: string;
  label: string;
  hex: string;
  metallic: boolean;
};

const SPECIAL_COATED: PmsColourOption[] = [
  { code: "yellow", label: "PMS Yellow C", hex: "#FEDD00", metallic: false },
  { code: "yellow-012", label: "PMS Yellow 012 C", hex: "#FFD700", metallic: false },
  { code: "orange-021", label: "PMS Orange 021 C", hex: "#FE5000", metallic: false },
  { code: "warm-red", label: "PMS Warm Red C", hex: "#F9423A", metallic: false },
  { code: "red-032", label: "PMS Red 032 C", hex: "#EF3340", metallic: false },
  { code: "rubine-red", label: "PMS Rubine Red C", hex: "#CE0058", metallic: false },
  { code: "rhodamine-red", label: "PMS Rhodamine Red C", hex: "#E10098", metallic: false },
  { code: "purple", label: "PMS Purple C", hex: "#BB29BB", metallic: false },
  { code: "violet", label: "PMS Violet C", hex: "#440099", metallic: false },
  { code: "blue-072", label: "PMS Blue 072 C", hex: "#10069F", metallic: false },
  { code: "reflex-blue", label: "PMS Reflex Blue C", hex: "#001489", metallic: false },
  { code: "process-blue", label: "PMS Process Blue C", hex: "#0085CA", metallic: false },
  { code: "green", label: "PMS Green C", hex: "#00AB84", metallic: false },
  { code: "white", label: "White", hex: "#FFFFFF", metallic: false },
  { code: "black", label: "PMS Black C", hex: "#2D2926", metallic: false },
  { code: "black-6", label: "PMS Black 6 C", hex: "#101820", metallic: false },
];

function sourceCode(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-c$/, "")
    .replace(/^pantone-?/, "")
    .replace(/\s+/g, "-");
}

function isMetallicCode(code: string): boolean {
  return /^(?:871|872|873|874|875|876|877)$/.test(code);
}

const SOURCE_COATED: PmsColourOption[] = (pantoneCoatedSource as PantoneSourceEntry[])
  .map((entry) => {
    const code = sourceCode(entry.pantone);
    const hex = String(entry.hex || "").trim().toUpperCase();
    if (!code || !/^#[0-9A-F]{6}$/.test(hex)) return null;
    return {
      code,
      label: `PMS ${code.toUpperCase().replace(/-/g, " ")} C`,
      hex,
      metallic: isMetallicCode(code),
    } satisfies PmsColourOption;
  })
  .filter((entry): entry is PmsColourOption => Boolean(entry));

const deduped = new Map<string, PmsColourOption>();
for (const option of [...SPECIAL_COATED, ...SOURCE_COATED]) {
  if (!deduped.has(option.code)) deduped.set(option.code, option);
}

export const PMS_SOLID_COATED: readonly PmsColourOption[] = Array.from(deduped.values());
export const PMS_SOLID_COATED_COUNT = PMS_SOLID_COATED.length;
const PMS_BY_CODE = new Map(PMS_SOLID_COATED.map((option) => [option.code, option]));

function normaliseNamedKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^pantone\s+/i, "")
    .replace(/^pms\s+/i, "")
    .replace(/\s+(?:solid\s+)?coated$/i, "")
    .replace(/\s+c$/i, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalisePantoneKey(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  const explicitNumeric = raw.match(/(?:pantone|pms)\s*0*(\d{2,4})\s*(?:solid\s+)?(?:coated|c)?\b/i);
  if (explicitNumeric?.[1]) return explicitNumeric[1];
  const bareNumeric = raw.match(/^0*(\d{2,4})\s*(?:c|coated)?\b/i);
  if (bareNumeric?.[1]) return bareNumeric[1];
  return normaliseNamedKey(raw);
}

export type PmsScreenSwatch = {
  label: string;
  hex: string | null;
  metallic: boolean;
  canonicalLabel?: string | null;
};

export function pmsScreenSwatch(value: string): PmsScreenSwatch {
  const label = String(value || "").trim();
  const key = normalisePantoneKey(label);
  const option = PMS_BY_CODE.get(key) ?? null;
  return {
    label,
    hex: option?.hex ?? null,
    metallic: option?.metallic ?? /metallic/i.test(label),
    canonicalLabel: option?.label ?? null,
  };
}

function queryParts(value: string): { raw: string; code: string; words: string[] } {
  const raw = String(value || "").trim().toLowerCase();
  const stripped = raw
    .replace(/^pantone\s+/i, "")
    .replace(/^pms\s+/i, "")
    .replace(/\s+(?:solid\s+)?coated\b/gi, " ")
    .replace(/\s+c\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const numeric = stripped.match(/\b0*(\d{2,4})\b/)?.[1] ?? "";
  return { raw, code: numeric, words: stripped.split(/\s+/).filter(Boolean) };
}

/** Search the bundled Solid Coated references for PMS entry suggestions. */
export function searchPmsColours(value: string, limit = 9): PmsColourOption[] {
  const query = queryParts(value);
  if (!query.raw) return [];

  return PMS_SOLID_COATED.flatMap((option) => {
    const haystack = `${option.code} ${option.label}`.toLowerCase();
    if (query.code) {
      if (option.code === query.code) return [{ option, score: 0 }];
      if (option.code.startsWith(query.code)) return [{ option, score: 1 + Math.max(0, option.code.length - query.code.length) }];
      if (option.code.includes(query.code)) return [{ option, score: 20 }];
      return [];
    }
    if (!query.words.every((word) => haystack.includes(word))) return [];
    const starts = query.words.some((word) => option.code.startsWith(word) || option.label.toLowerCase().startsWith(`pms ${word}`));
    return [{ option, score: starts ? 2 : 10 }];
  })
    .sort((a, b) => a.score - b.score || a.option.code.localeCompare(b.option.code, undefined, { numeric: true }))
    .slice(0, Math.max(1, limit))
    .map(({ option }) => option);
}

export function splitPmsColourEntries(value: string): string[] {
  return String(value || "")
    .split(/\s+[·•]\s+|[,;\n]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function pmsScreenSwatches(value: string): PmsScreenSwatch[] {
  return splitPmsColourEntries(value).map(pmsScreenSwatch);
}
