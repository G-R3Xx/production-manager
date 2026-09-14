# Production Manager V26.09.14.04

## Machines layout fix

- Fixed Machine form controls overflowing their CSS grid cells and visually overlapping adjacent fields.
- Inputs and selects now use border-box sizing and are allowed to shrink correctly inside responsive grid columns.
- Machine Details, Performance and Costing grids now use zero-minimum responsive columns, preventing long/select controls from forcing neighbouring cells underneath them.
- No database migration required.
