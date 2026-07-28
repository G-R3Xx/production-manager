# Production resources and recipes foundation

Version: V26.07.28.01

This batch introduces tenant-scoped Machines, Labour Operations and Production Recipes while preserving existing materials, products, quoting and production workflows.

## New modules

- `/machines`: machine capability, speed, setup, hourly and ink cost records.
- `/labour`: reusable labour operations with fixed/per-area/per-sheet/per-metre/per-item bases.
- `/recipes`: combines material, machine, labour, waste, markup and profit.
- Shared domain costing engine in `packages/domain/src/productionCosting.ts`.

## Database

Run `infra/sql/036_production_resources_and_recipes.sql` before using the new pages.

Products now have an optional `production_recipe_id` ready for the next quote/product linking batch.
