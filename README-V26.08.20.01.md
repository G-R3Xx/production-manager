# Production Manager V26.08.20.01

- Makes the complete one-page quote-line form the canonical editor for new, survey-created and existing structured quote lines.
- Removes the redundant stepped, alternate quick-entry and saved-product render paths from the standard material quote builder.
- Safely reconstructs older summary-only quote lines in the canonical editor and converts them to the current structured snapshot when saved.
- Restores relevant preset finished sizes for signage, small-format, plan and poster quote lines while retaining custom width and height entry.
- Adds an explicit installation labour basis: `Total line item` charges the entered installation time once, while `Per item` multiplies it by the quoted quantity.
- Gives linked `Sign Install` lines the correct quantity and unit price for the selected basis, so a six-item sign line can produce either one total install line or six per-item installs.
- Labels travel as `Travel / call-out charge ($)` and treats it as a one-off dollar total; travel and fixing totals are not accidentally multiplied by the sign quantity.
- Shows live labour and linked-install price previews before saving.
- Requires all applicable quote fields to be complete before the quote line can be saved.

No database migration is required.
