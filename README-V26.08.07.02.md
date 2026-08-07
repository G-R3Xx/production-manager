# Production Manager V26.08.07.02

## Automatic roll-width material selection

- Roll materials that share the same **Customer-facing name** are treated as physical stock-width variants of one customer option.
- Clients and staff can choose one simple answer such as **Frosted**, **White vinyl**, **Gloss laminate**, **Premium SAV** or **Banner**, while Production Manager keeps the exact stock names and widths internal.
- The product builder groups same-name backing and laminate stocks into one customer choice and links every physical width behind that choice.
- Fixed roll substrates and selected roll-print media also carry their same-name width variants automatically.
- Internal quote pricing and WordPress live pricing select a compatible stock based on finished dimensions and rotation, then prefer the lowest calculated material cost.
- WordPress pricing also considers order quantity/lane nesting when comparing roll widths.
- The roll nesting calculator now chooses the orientation that uses the least linear media for the actual quantity instead of choosing orientation only by maximum lane count.
- Website order snapshots retain the exact selected internal material and roll width, and Production jobs show that stock choice internally. Customer-facing quote/web/MYOB descriptions continue to use the friendly material name.
- Materials with no shared Customer-facing name continue to behave exactly as individual stock items.

### Setup example

Create separate stock records such as `Frosted 610 mm` and `Frosted 1220 mm`, give both the Customer-facing name `Frosted`, and maintain each roll width and purchase cost normally. In the product builder, enable Frosted once. The client sees only `Frosted`; the pricing engine selects the best valid physical roll.

No database migration is required for this release.
