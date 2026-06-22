# Quote ink charge and placeholder field fix

This batch fixes two problems found while testing the visual product recipe builder:

1. **Ink answer-line charges were not affecting quote prices.**
   - The quote page was cleaning product template component JSON too aggressively before passing it to the client-side quote calculator.
   - It preserved the component trigger, but dropped important `stockUsage` values such as `sellRate`, `chargeName`, `partsPerSheet`, `metresPerUnit`, and sheet/roll overrides.
   - Because `sellRate` was missing, `$ per m²` answer lines such as CMYK Ink or White Ink displayed as `$0.00/sqm` on the quote page.
   - The quote loader now preserves the full pricing recipe values needed by the quote calculator.

2. **Blank placeholder question appeared on the quote page as `Quote choice`.**
   - This came from a custom quote card saved without a question name/answers in an earlier version.
   - The quote page now hides empty placeholder `Quote choice` fields with no selectable answers.
   - The product action now rejects new or updated quote cards without a question name, so the blank placeholder cannot be created again.

Also adjusted number parsing in the quote calculator so empty/missing values use the provided fallback instead of becoming `0` unexpectedly.
