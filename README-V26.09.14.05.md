# Production Manager V26.09.14.05

## Production Setup consolidation

This release consolidates production configuration into one clear hierarchy:

**Materials + Resources → Processes → Production Methods → Products → Quotes**

### What changed

- Settings now has one **Production setup** entry instead of separate Machine / Labour / Process / Manufacturing Method cards.
- Production Setup has three consistent areas:
  - **Resources** — Machines and Labour
  - **Processes** — one reusable library of production actions
  - **Production Methods** — ordered recipes made from saved Processes
- Machines now store machine facts only: type, capacity, speed, setup, hourly cost, ink and click charges.
- Machine-to-process assignment is no longer edited from Machines.
- Each Process now owns its normal **Machine** and **Labour** resource assignment.
- Manufacturing Methods are renamed in the UI to **Production Methods**.
- Production Methods only define material + ordered Process sequence and pricing controls; they no longer redefine machine/labour resources per step.
- Products now select a reusable Production Method directly.
- Saving Product quote/website options no longer silently creates or rewrites production processes or methods.
- Quote/product costing now resolves machine and labour resources from the Process library.
- Older product-generated methods are preserved for compatibility and shown separately as legacy methods so existing products keep working while they are progressively reassigned.

### Database

No migration is required for this release. The existing process, machine-process, labour and production-recipe tables are reused.
