# Production Manager V26.10.21.11

## Production costing simplification

- Renamed the user-facing manufacturing pricing concept from Operations & labour to **Production Steps**.
- Production costing is now presented as **Materials + Production Steps + Extras + Services**.
- Production Steps are the primary configuration surface; Machines are now a secondary **Manage equipment** resource.
- Replaced the old operation cards with one compact Production Steps table showing machine, labour source, operator time and optional consumable.
- Simplified Production Step create/edit form to three concepts: step/equipment, operator labour, and optional consumable.
- Replaced the labour-basis card wall with a single calculation dropdown.
- Moved quick-start presets and raw-cost preview into optional collapsed sections.
- Updated product, quote, staff and WordPress wording to use Production Steps consistently.
- No database migration is required for this release; the existing labour_operations table remains the internal storage layer.
