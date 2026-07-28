# Product Build production flow

Version: V26.07.28.10

## Purpose

Normal product creation no longer requires staff to separately create a Production Step and Manufacturing Method before returning to the Product editor.

The Product **Build** tab now provides the normal workflow:

1. Choose the main material, or choose no physical material for customer-supplied/install-only work.
2. Add production actions such as Direct print, Laminate, Trim / cut, Eyelets, Pack and Install.
3. Put those actions into production order.
4. Open Costing resources only when a specific machine or labour operation must be used.
5. Save and preview the shared Production Manager / WordPress price.

## Background records

Saving the Product Build flow creates or reuses:

- reusable `catalog.processes` records for the standard production actions;
- one Product-managed `catalog.production_recipes` record identified by `recipe_json.managedBy = product_build` and the Product ID;
- ordered `catalog.recipe_processes` rows.

Per-product machine and labour selections are stored in each recipe-process `settings_json` record. Existing global machine compatibility and default process labour remain the automatic fallback.

## Compatibility

- Existing products that already use a manufacturing method load that material and process order into the new builder.
- Existing manually maintained manufacturing methods are not deleted or changed.
- The detailed Production Steps, Machines, Labour and Manufacturing Methods pages remain available under **Settings → Advanced production setup**.
- The WooCommerce bridge continues to use `production_recipe_id`, so the same saved flow powers internal quotes and website pricing.
- No database migration is required because the existing `recipe_json` and `recipe_processes.settings_json` fields are used.
