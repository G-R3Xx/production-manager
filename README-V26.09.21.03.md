# Production Manager V26.09.21.03

Australian release date: 21 September 2026.

This update continues directly from V26.09.21.02.

## Installation materials / consumables

- Removes the hard-coded Silicone, VHB, screws, cable ties and similar choices from **new** Install quote lines.
- Adds **Show as installation option** to Add/Edit Material.
- Adds an **Install option** checkbox to the in-app Material Price Manager table.
- Install quote lines now list the saved Materials that have this option enabled.
- Adds **Custom allowance** for ad-hoc items such as rags/cleaner that are not worth saving as a Material.
- Removes the need for material names to contain words such as `Silicone`, `VHB`, `Screws` or `Cable ties`.
- Preserves legacy matching only when reopening an older quote that already contains one of the previous hard-coded keys.

## Unit-cost handling

Installation material pricing now uses the saved purchasing setup automatically, including:

- box -> tube / each
- bag -> each
- carton -> bottle
- roll -> linear metre
- other purchase-unit -> stock-unit combinations where a pack/roll quantity is supplied

Wastage is included in the underlying material cost before the normal quote pricing stack is applied.

This also fixes VHB/tape roll costing: for example a $120 roll with a saved stock length of 20 lm resolves to $6.00/lm before wastage and quote pricing.

The detailed Material form now includes tube, bottle, carton and related UOM choices and preserves existing custom UOM values when editing.

## Compatibility

- No database migration is required for this update. The installation-option flag is stored in the existing material `cost_json` data.
- Existing materials default to **not** being shown on Install quote lines until **Show as installation option** is enabled.
- Existing historical quotes retain their old fixing/consumable selections when reopened.
- Install labour continues to be entered in **hours** in the UI.

## Verification

- All changed TypeScript/TSX files passed TypeScript syntax/transpile diagnostics with TypeScript 5.8.3.
- A full pnpm/Vercel production build could not be run in this isolated source package because dependencies are not bundled and external package download is unavailable in the build environment.
