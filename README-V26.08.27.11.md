# Production Manager V26.08.27.11

## V26.08.27.11

- Artwork Approval page decisions are now local browser state: clicking **Approve this page** or setting a page change request no longer submits a server form or reloads the page.
- All page decisions are persisted together only from the final review section. All-approved reviews are saved with the final name/signature; reviews containing requested changes are submitted once with **Submit review & change requests**.
- Unsaved page decisions are held in session storage and protected from background auto-refresh, so a status poll cannot wipe an in-progress review.
- Final approval still creates/releases production only after the complete review is submitted.


- Replaced the small hand-maintained PMS swatch table with a bundled Pantone Solid Coated lookup dataset from the MIT-licensed `pantoner` colour library.
- PMS swatches now resolve from the local coated dataset instead of only recognising a short list of common colours.
- PMS entry fields are now searchable: type a number such as `557` to see `PMS 557 C`, `PMS 5575 C` and other matching coated references with live swatches.
- Selecting a search result writes the canonical PMS code into that individual colour field.
- Existing free-text PMS entries remain supported, including friendly descriptions after a PMS code and standalone `White`.
- The staff entry UI shows a live match confirmation while the client Artwork Approval continues to show the same compact PMS swatch + code output.
- PMS/HEX values remain RGB screen approximations only; the PMS code is still the authoritative approval/production reference.