# Production Manager V26.08.16.01

## MYOB accepted quotes now use Item Orders

- Accepted Production Manager quotes now POST to MYOB `Sale/Order/Item`, matching the Item layout used in AccountRight.
- Saved PM products that are linked to an active MYOB item with **I Sell This Item** enabled use that MYOB Item UID on the sales-order line.
- Quick/custom quote lines, and products without a usable sold-item mapping, use a dedicated MYOB sales item: `PM-CUSTOM` / `Custom Production`.
- Production Manager creates `PM-CUSTOM` automatically if needed, using the configured MYOB Default sales income account and GST tax code. It is sold-only and non-inventoried.
- Item Order lines send the PM quoted quantity, unit price, total, description and MYOB TaxCode UID. Inventoried linked products also carry their default sell-location UID when MYOB provides one.
- MYOB continues to allocate its own sales-order number; the PM quote number remains in the journal memo/mapping.
- The quote screen now describes the Item Order behaviour and warns when an already-synced order was created by an older build using Service layout. Existing MYOB Service Orders are not silently deleted or duplicated.

## Preserved

- Quote revision/cancelled-line behaviour from V26.08.14.14.
- MYOB OAuth/refresh/pagination and automatic master-data sync.
- Client/Supplier/Material sync.
- MYOB purchasing and PO email/PDF workflow.
- Gmail quote email and Tender Edge horizontal branding.
- Inline quote component editing and current quote pricing.
