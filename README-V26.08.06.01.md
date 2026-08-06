# Production Manager V26.08.06.01

## Calculated hole and fixing quantities

- Added reusable drilled-hole and standoff setup to the guided product builder for acrylic, ACM, aluminium, PVC and other rigid signs.
- Hole choices support No holes, Top Corners (2), All Corners (4) and a custom number per sign.
- Silver and Black standoff materials can be linked as inventory items.
- Standoff material usage is automatically calculated from the selected holes per sign and the quote/order quantity.
- Added a generic `option_quantity` component quantity source so the same calculation can be reused later for screws, brackets, clips, magnets and similar fixings.
- Saved-product quote snapshots now retain option answers and the calculated material breakdown.
- WordPress live pricing uses the same option-driven quantity calculation.

## Setup

1. Add the Silver Standoff and Black Standoff stock items under Materials with their purchase cost recorded per `each`.
2. Open any applicable product and go to **Build product → Finishing**.
3. Enable **Drilled holes and standoffs**, choose the default hole layout, and link the Silver and Black stock items.
4. When quoting, the selected hole count is calculated per finished sign. The quote or WooCommerce quantity then multiplies the standoff requirement.

Example: 6 signs with All Corners (4) and Silver standoffs consumes 24 Silver Standoff material items.
