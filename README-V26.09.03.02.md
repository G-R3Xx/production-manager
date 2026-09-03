# Production Manager V26.09.03.02

## Client-facing material names + stacked Tender Edge quote logo

- Public quote and emailed/downloadable Quote PDF now prefer the saved customer-facing material name from the quote-line material snapshot (`media`, `main`, or `smallStock`) before falling back to legacy/internal summary text.
- This prevents supplier/internal stock names (for example Avery/Aslan stock naming) from leaking onto client quote output when a public material name has been configured.
- Quote PDF now uses the configured company logo first, matching the public quote. For Tender Edge this is the stacked master logo. The bundled horizontal logo remains a fallback only.
- Quote email header behaviour is unchanged.
- No database migration required.
