# Single quote editor and installation billing

## Canonical quote-line editor

`QuoteMaterialFlowBuilder` now has one rendering path: the complete one-page form. New quote lines, survey-generated lines and existing structured material lines all use that path. The removed stepped and alternate quick renderers were presentation duplicates over the same quote snapshot and were a source of inconsistent controls.

Older summary-only quote lines are reconstructed through `inferLegacyQuickQuoteSnapshot`. Opening one displays the recovered values in the canonical form; saving replaces the legacy summary-only representation with the current structured snapshot.

Reusable products remain a source of recipe data and selectable defaults. Their stored recipe and option schema is preserved for compatibility, but they do not introduce another standard raw-material quote creation layout.

## Installation labour basis

The structured quote snapshot stores `installLabourBasis` with one of two values:

- `line_total`: the entered minutes cover the complete quote line and the linked install service line has quantity 1.
- `per_item`: the entered minutes apply to each quoted item and the linked install service line uses the parent quote quantity.

Installer count multiplies person-time for both bases. The live preview exposes entered site time, quote quantity, crew size, total person-time and labour value before saving.

Travel is a dollar input, not a time input. Travel and explicit fixing costs are whole-line totals. When an install is billed per item, those whole-line extras are distributed into the linked service unit price so multiplying by the linked quantity still recovers the intended total exactly once.

Existing snapshots without `installLabourBasis` default to `line_total`, preserving their former single-line installation behaviour.

## Size presets

The canonical finished-size section exposes the presets relevant to the active department and includes the current saved size when it does not match a standard preset. Selecting a preset fills width and height; custom dimensions remain supported.

No database migration is required because the new basis is stored inside the existing quote-line configuration snapshot.
