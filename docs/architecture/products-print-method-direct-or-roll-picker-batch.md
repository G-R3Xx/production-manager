# Products: print method direct-or-roll picker batch

## Purpose

The Product Builder print media row now behaves like a real print-method choice instead of only a material picker.

## Changes

- Renamed the signage builder row from **Print media** to **Print method**.
- Clicking **Choose print method** opens the existing popover picker.
- The popover now shows a clear **Direct print** option at the top.
- Below Direct print, roll stock/material options are listed as roll media choices.
- Direct print saves a choice-only product component with no material cost.
- Roll stock choices still save the selected roll material and use linear metre costing.
- Roll stock rows continue to show calculated **$/lm** as the primary cost, with the full roll price shown only as supporting text.

## Reasoning

This matches the intended PCPartPicker-style workflow:

1. Choose whether the product is direct printed or uses roll stock.
2. If using roll stock, choose one applicable roll material.
3. Keep ink/print charges separate, so direct print can still add CMYK/white ink charges without pretending a roll material is used.

## Notes

Direct print has rule type `choice_only`, so it appears in the product build but contributes no material cost to quote calculations.
