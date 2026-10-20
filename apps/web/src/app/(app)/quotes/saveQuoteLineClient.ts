export type FastQuoteLineSaveResult = {
  ok: boolean;
  quoteId: string;
  lineId: string | null;
  message: string;
  error: string | null;
  serverElapsedMs: number;
  authElapsedMs: number;
  dbElapsedMs: number;
  dbSchemaElapsedMs?: number;
  dbConnectionElapsedMs?: number;
  dbQueryElapsedMs?: number;
  runtimeRegion?: string | null;
};

export async function saveQuoteLineFast(formData: FormData): Promise<FastQuoteLineSaveResult> {
  const response = await fetch("/api/quotes/line", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "x-production-manager-fast-save": "1"
    }
  });

  const payload = await response.json().catch(() => null) as FastQuoteLineSaveResult | null;
  if (payload) return payload;

  return {
    ok: false,
    quoteId: String(formData.get("quoteId") ?? ""),
    lineId: null,
    message: "",
    error: response.ok ? "The quote line could not be saved." : `The quote line could not be saved (${response.status}).`,
    serverElapsedMs: 0,
    authElapsedMs: 0,
    dbElapsedMs: 0
  };
}
