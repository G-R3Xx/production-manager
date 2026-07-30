# Roll-stock base-material costing — V26.07.30.01

The Guided Product Builder's **main material** is the fixed base material used by internal quotes, production recipes and website pricing.

For roll materials:

- `purchaseUom = roll` means `purchaseCost` is the full-roll supplier cost.
- `stockQuantity` is the saved roll length in linear metres.
- Cost per linear metre is `purchaseCost / stockQuantity`.
- Finished dimensions and roll width determine the linear metres consumed.
- A separate Roll stock quote question is only relevant when the base is a different substrate and staff must choose an applied roll media. It is not shown when the main material itself is roll stock or a fixed roll media is already linked.
