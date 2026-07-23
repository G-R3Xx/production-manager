# Quote line clickable breakdown editor

Version: `V26.07.23.09`

## Change

Saved quote lines now use one combined **Line breakdown** instead of showing a read-only breakdown followed by a duplicate editor.

- Editable cards show an **Edit** indicator and open their control in place.
- Saved-product fields use their configured dropdowns, dependent lists, checkboxes, and numeric/text controls.
- Line title, quantity, legacy details, and internal notes are edited directly from their cards.
- Unit price and line total remain read-only calculated cards.
- The active editor expands across the full breakdown row for easier selection.
- Enter closes text/number editors instead of submitting the entire form.
- Saving still rebuilds the client-facing/production summary and recalculates product-linked pricing.

Unlinked legacy quote lines do not have a saved option recipe, so their existing detail cards remain editable in place as text. Saving the line as a reusable product gives future lines configured option controls.
