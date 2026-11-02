/** Quote sections are organisational only; they never change quote line pricing. */
export type QuoteSubJob = { id: string; quoteId: string; title: string; sortOrder: number };
export type SectionLine = {
  id: string;
  lineTotal: string;
  configurationSnapshot: Record<string, unknown>;
};

export function quoteLineSubJobId(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>).subJobId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Linked dispatch/access lines inherit their parent's section when absent. */
export function groupQuoteLinesBySubJob<T extends SectionLine>(lines: T[], subJobs: QuoteSubJob[]): Array<{
  id: string | null;
  title: string;
  lines: T[];
  subtotal: number;
}> {
  const ordered = [...subJobs].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const sections = ordered.map((job) => ({ id: job.id as string | null, title: job.title, lines: [] as T[], subtotal: 0 }));
  const general = { id: null as string | null, title: "General / Unassigned", lines: [] as T[], subtotal: 0 };
  const bySection = new Map(sections.map((job) => [job.id, job]));
  const byLine = new Map(lines.map((line) => [line.id, line]));
  function sectionId(line: T, visited = new Set<string>()): string | null {
    if (visited.has(line.id)) return null;
    visited.add(line.id);
    const direct = quoteLineSubJobId(line.configurationSnapshot);
    if (direct && bySection.has(direct)) return direct;
    const parentId = line.configurationSnapshot?.parentLineId;
    const parent = typeof parentId === "string" ? byLine.get(parentId) : undefined;
    return parent ? sectionId(parent, visited) : null;
  }
  for (const line of lines) {
    const section = bySection.get(sectionId(line)) ?? general;
    section.lines.push(line);
    const value = Number(String(line.lineTotal ?? "0").replace(/[$,]/g, ""));
    if (Number.isFinite(value) && (line as { clientResponseStatus?: string }).clientResponseStatus !== "cancelled") section.subtotal += value;
  }
  return general.lines.length ? [...sections, general] : sections;
}
