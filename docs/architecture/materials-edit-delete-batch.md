# Materials edit/delete batch

Adds material management actions to the Materials page.

## Changes

- Current material cards now include an **Edit material** expandable section.
- Existing material records can be updated without recreating them.
- Editable fields include supplier, SKU, type, UOMs, quantity/roll length, purchase cost, dimensions, roll width, GSM/thickness and notes.
- The delete action is implemented as a safe deactivate/archive, not a hard database delete, so old references are not accidentally destroyed.
- Inactive materials show as inactive and can be restored.
- Product builders continue to use active materials for new selections.

## Reasoning

Materials can be linked to products and historical quote calculations. A hard delete risks breaking existing records, so the visible **Delete** action marks the material inactive. This removes it from active selection lists while keeping the record available for audit/history.
