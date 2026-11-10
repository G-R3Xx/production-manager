/** Quote sections are organisational only; they never change quote line pricing. */
export type QuoteSubJob = { id: string; quoteId: string; title: string; sortOrder: number };
export type SectionLine = {
  id: string;
  lineTotal: string;
  configurationSnapshot: Record<string, unknown>;
};

/** New quote lines belong to the most recently added section, not General.
 * Sections arrive ordered by creation time; their sortOrder determines which
 * section is current. In a tie, the later row in the query wins.
 * This does not move or change any previously saved quote lines.
 */
export function currentQuoteSubJob(subJobs: QuoteSubJob[]): QuoteSubJob | null {
  if (!subJobs.length) return null;
  return subJobs.reduce<QuoteSubJob | null>((latest, job) =>
    !latest || job.sortOrder >= latest.sortOrder ? job : latest, null);
}

/**
 * A newly created line must follow the quote's current section at save time,
 * even if an open/lazy-loaded builder was mounted before that section existed.
 * Apply the same section to linked dispatch and access-equipment charges.
 * This is called ONLY for new lines: editing must never move an existing line.
 */
export function assignCurrentSubJobToNewQuoteLine(
  currentSubJobId: string | null,
  ...snapshots: Array<Record<string, unknown> | null>
): void {
  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    if (currentSubJobId) snapshot.subJobId = currentSubJobId;
    else delete snapshot.subJobId;
  }
}

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
  gst: number;
  totalIncGst: number;
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
  const groups = general.lines.length ? [...sections, general] : sections;
  // Round to cents and allocate GST cents across sections so their displayed
  // totals always add up to the overall quote. Rounding each section's GST
  // independently can otherwise make the overall total differ by a cent.
  const cents = groups.map((group) => Math.round(group.subtotal * 100));
  const exactGstCents = cents.map((value) => value / 10); // Australian GST: 10%
  const gstCents = exactGstCents.map((value) => Math.floor(value));
  let remainder = Math.round(cents.reduce((sum, value) => sum + value, 0) / 10)
    - gstCents.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exactGstCents
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of remainderOrder) {
    if (remainder <= 0) break;
    gstCents[index]! += 1;
    remainder--;
  }
  return groups.map((group, index) => ({
    ...group,
    gst: gstCents[index]! / 100,
    totalIncGst: (cents[index]! + gstCents[index]!) / 100
  }));
}
