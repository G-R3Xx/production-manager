# PrintOS-style UI rebuild batch

This batch shifts the Production Manager interface toward a cleaner production-hub feel inspired by HP PrintOS-style production dashboards, without copying the source product directly.

## Scope

- Rebuilt the authenticated app shell with a softer left navigation, workspace card, cleaner spacing and production-hub branding.
- Added Dashboard to the primary navigation.
- Reworked the dashboard into a production control home with quick actions, operational count cards and placeholder production-flow lanes.
- Restyled Quotes with lighter cards, softer borders and the new quote-card language.
- Restyled the Quote Line Builder so quote users answer product quote cards and see a clearer calculated-price panel.
- Reworked Products wording from configurator/rules language to quote-card language.
- Moved advanced stock/process rows behind a collapsed "usually skip this" area.
- Simplified answer-line setup so normal setup is: card name -> answer lines -> what each answer adds.

## Product setup direction

The no-training model is now:

1. Open or create a product.
2. Add quote cards such as Size, Print type, Laminate, White ink or Finishing.
3. Add answer lines inside each card.
4. Each answer line can be:
   - choice only
   - material auto from size
   - material parts per sheet
   - material sheets per item
   - material metres per item
   - charge dollars per square metre
   - charge dollars each

Advanced stock/process rows remain available for unusual products, but they are no longer part of the main workflow.

## Files changed

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/components/AppNavLink.tsx`
- `apps/web/src/app/(app)/dashboard/page.tsx`
- `apps/web/src/app/(app)/quotes/page.tsx`
- `apps/web/src/app/(app)/quotes/QuoteLineBuilder.tsx`
- `apps/web/src/app/(app)/products/page.tsx`

## Notes

This batch intentionally focuses on layout, wording and workflow clarity. It does not add a new production jobs database table or kanban persistence yet. The dashboard lanes are ready for that next step.
