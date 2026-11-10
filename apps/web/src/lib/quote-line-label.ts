/** A purely presentational label. Never replace productName: pricing, MYOB item
 * selection and manufacturing rules depend on the original product identity. */
export const QUOTE_LINE_TITLE_OVERRIDE_KEY = "quoteLineTitleOverride";
export const QUOTE_LINE_TITLE_MAX_LENGTH = 200;

export function quoteLineTitleOverride(snapshot: Record<string, unknown> | null | undefined): string | null {
  const raw = snapshot?.[QUOTE_LINE_TITLE_OVERRIDE_KEY];
  if (typeof raw !== "string") return null;
  const title = raw.trim();
  return title.length > 0 ? title.slice(0, QUOTE_LINE_TITLE_MAX_LENGTH) : null;
}

export function quoteLineDisplayTitle(line: { productName: string; configurationSnapshot?: Record<string, unknown> | null }): string {
  return quoteLineTitleOverride(line.configurationSnapshot) ?? line.productName;
}
