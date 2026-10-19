# Production Manager V26.10.20.01

Australian release date: 20 October 2026.

## Catalogue quote quantity

- Adds a dedicated **Quantity** step to the visual/catalogue Quick / Custom quote wizard.
- Quantity is requested immediately after finished size for signage and print jobs, before the later pricing-dependent selections.
- Service and custom-component catalogue flows also request quantity where appropriate; access-equipment-only lines continue to use number of days as their quantity.
- New catalogue lines no longer silently begin at quantity 1. The user must enter a quantity greater than zero before the wizard can continue/save.
- The sticky catalogue footer now shows unit price, entered quantity and current line total.
- Saved-product catalogue cards now show a prominent required **How many?** quantity control at the top of the product builder, and cannot save until a quantity is entered.
- Existing list-style quote entry retains its current default quantity behaviour.

## Quote-line save performance

- Removes a duplicate Supabase `auth.getUser()` call that was being performed by middleware before quote Server Actions authenticated again inside the action.
- The fast quote-line save no longer performs a separate tenant-membership database lookup before writing the line.
- Tenant membership/quote ownership validation is now performed inside the same PostgreSQL statement that saves the main line and any linked delivery/install/access-equipment lines.
- The bundled delete/update path is also constrained by the authorised quote CTE, so linked-line cleanup cannot run unless the user has an active membership for that quote's tenant.
- Save timing now records separate **auth**, **database**, **server total** and **browser request total** timings. Browser DevTools logs these under `[quote-line-save-client]`; Vercel logs retain `[quote-line-save]` with the server breakdown.
- The existing post-save quote refresh still runs after the save returns and does not block the modal from closing.

## Compatibility

- No database migration is required.
- Existing quote snapshots and historical quote-line quantities remain compatible.
- V26.10.19.19 modal containment fixes are retained.
