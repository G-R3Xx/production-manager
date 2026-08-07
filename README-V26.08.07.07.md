# Production Manager V26.08.07.07

## Reverse-printable roll media

- Roll media materials now have a **Reverse printable** capability checkbox.
- When a product uses reverse-printable roll media, the guided product definition adds **Print orientation: Standard print / Reverse print**.
- Choosing Reverse print exposes the configured vinyl-backing choices (for example White or Frosted) while normal laminate choices remain available.
- Backing material costing is protected by the Reverse print + Roll print conditions so hidden/stale answers cannot add backing cost.
- Auto-grouped roll widths only advertise reverse printing when every interchangeable width in that customer-facing group is marked Reverse printable.
- The internal Quick Quote flow also allows Reverse print when the selected roll media is marked Reverse printable.
- Existing clear/transparent sheet-substrate backing behaviour remains unchanged.
- No WordPress plugin update is required; the existing builder renders the new conditional field after products are re-saved and synced.
