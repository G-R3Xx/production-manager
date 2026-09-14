# Production Manager V26.09.14.01

## Unified machine + labour costing

- Reconnected Production Resource settings to the current Quote workflow so configured Machines and Labour operations are used by Quick / Custom quote lines and Saved Products.
- Machine setup minutes, speed, speed unit and hourly cost now contribute to PM-calculated quote costs for linked processes.
- Printer ink $/m² comes from the selected print machine when configured; the older Quote Pricing ink rate remains a safe fallback only when the machine has no ink rate.
- Process-linked Labour operations provide the hourly labour rate; the older Quote Pricing labour rate remains a fallback where no labour operation is linked.
- Saved Products with a Production Recipe add machine/labour costs from that recipe to the material/component cost calculation.
- Machine selection is process-based. If more than one active machine can perform a process, PM selects the lowest calculated compatible machine cost unless the recipe explicitly names a machine.
- Max width is now operational. PM compares the relevant parent sheet / roll / media width with the machine capacity and blocks quote saving when configured machines for that process are too narrow.
- Product cost previews now show a clear machine-width warning instead of silently calculating with an incompatible machine.
- The Machines settings page now makes max width units/usage clearer and displays max width and ink rate on each machine card.
- Existing manually-entered setup/finishing minutes remain human labour; machine setup minutes remain equipment time, so both can be costed without being treated as the same charge.

### Costing source of truth

- Materials: stock / consumable cost.
- Machines: equipment speed, setup time, hourly running cost, ink and width capacity.
- Labour: human labour rate and calculation basis.
- Products / Production Recipes: which processes are required.
- Quotes: calculate from the above sources, with legacy quote labour/ink values used only as fallback when a process resource is not configured.

No database migration is required for this release.
