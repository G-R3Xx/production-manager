# Client setup, logos and discount rules batch

This batch focuses on client records as a first-class data source for the full workflow.

## Changed

- Rebuilt the Clients page into a clearer client setup screen.
- Added add/edit/archive/restore/safe-delete client actions.
- Added client details stored in `app.customers.payload_json` so no new SQL is required:
  - ABN / account reference
  - billing address
  - default site/delivery address
  - internal notes
  - logo URL/storage path
  - default discount percentage
  - quantity/product-type discount rules
- Added optional client logo upload using Supabase Storage bucket `client-assets`.
- Added existing-client selection when creating enquiries.
- Linked client contact details can prefill enquiry details.
- Linked client logos are shown on enquiry cards.
- Survey bridge payload now sends client logo fields to Install Scheduler.
- Quote drafts created from linked enquiries/surveys now carry the linked customer ID and default client discount.
- Quote line pricing can apply client default discounts and matching quantity/product-type rules.

## Discount rule format

One rule per line:

```text
Product type | minimum qty | discount % | optional maximum qty | note
Signage | 10 | 5
Small format | 250 | 7.5
Acrylic | 5 | 10 | 20 | bulk acrylic discount
```

The quote builder compares the selected quote flow/product type with the rule and applies the best matching discount to the calculated sell price.

## Logo workflow

A client logo can be uploaded or entered as a URL. It is stored on the client record and passed into the Install Scheduler survey-job bridge payload so survey/install jobs can display the same logo.
