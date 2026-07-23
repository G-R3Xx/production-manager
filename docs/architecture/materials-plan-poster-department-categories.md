# Materials plan and poster department categories

Version: V26.07.23.02

## Change

The Materials page now has five explicit active-stock categories:

- Signage
- Plan printing
- Poster printing
- Small format
- Shared / consumables

A material's category is selected independently from its physical material type. This allows, for example, roll media to belong specifically to Signage, Plan printing, or Poster printing without changing how its width, roll length, stock units, or cost are calculated.

## Data compatibility

A nullable `catalog.materials.material_group` column is created automatically when the material library is used. Existing materials remain compatible: records without a saved category continue to use the previous material-type inference until edited and assigned explicitly.

## Quote picker behaviour

Plan printing, Poster printing, Small format, and Signage quote material lists now prefer materials assigned to the matching category. Existing uncategorised stock remains available through the previous fallback matching so older setups do not regress.
