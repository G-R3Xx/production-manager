# Labour operations guided minutes UI

Version: V26.07.28.11

## Purpose

The labour resource page now presents costing rules in the language staff actually use: minutes and dollars. The underlying production costing engine remains unchanged.

## Storage compatibility

The database continues to store:

- `fixed_minutes` values directly as minutes;
- scalable bases (`per_sqm_hours`, `per_sheet_hours`, `per_linear_metre_hours`, `per_item_hours`) as hours per unit.

The UI converts scalable values from stored hours to minutes when loading and converts entered minutes back to hours when saving. Existing labour records therefore remain compatible and require no migration.

## Guided setup

1. Name the operation and choose its work area.
2. Enter the hourly labour rate.
3. Choose what makes the time grow and enter that time in minutes.
4. Optionally set a minimum total charge.
5. Review the live time and Australian-dollar cost example before saving.

## Compatibility

- Existing production recipes and Product Build labour selections continue to reference the same labour-operation IDs.
- The production costing domain and database schema are unchanged.
- Older forms posting `calculationValue` directly remain supported by the server action.
