# Production Manager V26.07.28.12

## Internal workflow first

This build resets the everyday Product workflow around fast internal quoting and production. WordPress publishing remains available, but it is optional and no longer drives the normal product setup.

### Product creation

- Products page now explains the internal purpose first.
- Quick creation starts from common signage and print product types.
- New products open directly on **Build & quote**.
- Added Corflute, Acrylic and PVC rigid-sign starting points.

### Build & quote

- Replaced the technical production-first page with one guided internal setup:
  1. Main material and normal quote size
  2. Print method
  3. Normal finishing actions
  4. Pickup, delivery or installation
- Staff enter normal width, height and quantity once.
- Saving creates or updates the underlying production recipe automatically.
- Saving also creates or updates standard quote fields for size, quantity, print method and fulfilment.
- Products can be made active for quoting directly from the setup screen.
- Advanced production sequence and uncommon steps are collapsed by default.
- Machine and labour selectors were removed from the normal Product screen and remain available under advanced settings.

### Product editor

- Main tabs are now **Build & quote**, **Price check**, **Summary** and **Product details**.
- Website publishing is an optional header action rather than a main workflow tab.
- Extra quote choices are collapsed by default.
- Summary now shows customer quote defaults, production instructions, readiness and internal costing rather than a website storefront preview.

### Performance

- The normal Build page no longer loads machine and labour libraries.
- Product details only load configurator data when the selected view needs it.
- Website controls and resources do not load during normal internal setup.

No database migration is required.
