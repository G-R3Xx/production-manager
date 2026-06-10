# Products / quotes split rebuild

This batch simplifies the catalogue mental model so product creation is no longer confused with quoting.

## Workflow direction

- Products are base sellable items.
- A product has a base material / purchased stock source.
- Quote-time options live as quote behaviour behind the product.
- Staff choose quote options only after selecting the product on the Quotes page.
- Stock allocation starts from Materials, not finished Products.

## Example

Product:

- `Sign - ACM - 3mm`
- base material: `3mm ACM sheet`
- allocation: part sheet / nested from parent sheet

Quote behaviour after selecting that product:

- Size
- Print type: Direct print or Roll stock applied
- Roll stock: White or Clear reverse, only when Roll stock is chosen
- Laminate: None, Gloss, Matt
- Finishing: None, Jingwei cutting, CNC/router cut, drill holes
- Quantity

## Product setup UX changes

- Product create form now asks for base product name, product type, base material and stock allocation method.
- Product editor is split into:
  1. Base product details
  2. Base material / stock used by this product
  3. Quote behaviour for this product
- Quote behaviour is presented as a preview of what staff will see on the Quotes page, not as product creation fields.
- Advanced custom quote choices are still available, but tucked away.

## Quotes page changes

- Quotes now has a product selection flow.
- Selecting a product renders the quote-time choices from the product's saved setup definition.
- Quotes page also shows a stock allocation preview:
  - base product materials always used
  - optional materials/labour triggered by quote choices

## Compatibility notes

- No new tables were added in this batch.
- The existing internal `catalog.configurator_templates.definition_json` record is still used as the product's hidden quote behaviour/config snapshot store.
- No separate Recipes or Configurators pages were reintroduced.
- Tax code remains hidden from product creation and is saved as `GST`.
