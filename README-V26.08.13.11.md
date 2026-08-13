# Production Manager V26.08.13.11

## Structured client / supplier addresses + MYOB field mapping

Refines the now-working PM <-> MYOB contact sync so Production Manager stores and sends address and ABN data in the same structured fields MYOB expects.

### Clients
- Splits the old combined `ABN / account reference` field into separate `ABN` and `Account reference` fields.
- Billing and default site/delivery addresses now have separate Street, Suburb/Town, State, Postcode and Country fields.
- Existing multiline PM addresses are conservatively parsed when displayed/synced. Common Australian forms such as `Street` + `Suburb` + `ACT 2913` are separated automatically; uncertain legacy text is retained intact in Street instead of being guessed or discarded.
- Existing legacy `billingAddress` and `defaultSiteAddress` strings are still maintained from the structured values for compatibility with quotes, enquiries, surveys, Install Scheduler and other existing workflows.
- New/updated MYOB customers receive structured `Addresses[].Street`, `City`, `State`, `PostCode`, `Country`, `Phone1`, `Email` and `ContactName` values.
- Billing uses MYOB Address Location 1. A different default site/delivery address is sent as Location 2; identical addresses are not duplicated.
- Client ABN now maps to `SellingDetails.ABN` while MYOB Price Level A-F and the GST/Freight tax-code fix from V26.08.13.10 remain intact.
- MYOB customer import now reads contact email/phone from the MYOB Addresses collection and brings MYOB Address 1, Address 2 and SellingDetails ABN back into PM structured fields.

### Suppliers
- Adds the same structured Street, Suburb/Town, State, Postcode and Country treatment to supplier records without cluttering the supplier list; existing supplier address editing sits in an expandable Address section.
- PM -> MYOB supplier sync sends the structured address to MYOB Address Location 1.
- MYOB supplier import stores the structured primary address back in PM.

### Compatibility / safety
- No destructive database migration is required: the new structured values live alongside the existing JSON payload fields, and old address strings remain supported.
- Linked MYOB contacts preserve unrelated existing address locations and Selling/Buying details while PM overlays the fields it owns.
- OAuth refresh, full pagination, Purchasing/PO work, MYOB items/material sync, Price Levels A-F, artwork workflows, quoting and all prior V26.08.13.10 functionality remain in place.
