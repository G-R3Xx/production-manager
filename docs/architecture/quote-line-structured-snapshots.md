# Structured quick-quote line snapshots

Quick quote lines now store the selections used to build the line in `sales.quote_lines.configuration_snapshot`.

The snapshot includes the builder flow, material IDs and historical material copies, finished dimensions, print and artwork choices, finishing and labour inputs, quantity, pricing inputs, dispatch selections, and links between the main line and a separately priced dispatch line.

## Editing

- Lines with a snapshot reopen the quick quote builder at the relevant step when a breakdown card is clicked.
- The builder recalculates the unit price and line total from the saved selections.
- Older lines without a snapshot show **Rebuild line options**. Their existing summary is used to infer as much structured data as possible before the user confirms or corrects it.
- Direct free-text editing of legacy quick-builder breakdown details is intentionally disabled.

## Historical materials

A compact copy of every selected material is stored in the snapshot. If a material is later archived or removed from active pickers, the historical quote line can still reopen and calculate from the saved material details. New selections continue to use active material records.

## Dispatch lines

When delivery or installation creates a separate charge line, the main line snapshot records the linked dispatch line ID and the dispatch line records its parent. Rebuilding the main line updates, creates, or removes that linked line as required. Deleting the main line also removes its linked dispatch charge.
