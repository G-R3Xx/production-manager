# Products answer-line labour batch

This batch simplifies factory labour setup so labour can be added directly on the same quote answer line as stock, ink, laminate, or finishing.

## What changed

- Added a visible `Labour hrs` field to each product quote answer line.
- An answer can now add both:
  - the main cost/material/charge, and
  - extra factory labour hours.
- Added `Labour hours` as a selectable cost type for answers that are labour-only.
- Labour created from answer lines is saved as `labour_hours` product components triggered by that answer.
- Quote calculation already supports `labour_hours`, so labour appears in the quote price breakdown as hours × hourly rate.
- Default answer-line labour rate is $66/hr unless later changed through advanced rows.

## Example

For a Laminate question:

| Answer | Adds | Material | Number | Labour hrs |
| --- | --- | --- | --- | --- |
| None | No extra cost | No material | blank | blank |
| Matt laminate | Material from size | Matt laminate roll | blank | 0.25 |
| Gloss laminate | Material from size | Gloss laminate roll | blank | 0.25 |

For a Finishing question:

| Answer | Adds | Number | Labour hrs |
| --- | --- | --- | --- |
| None | No extra cost | blank | blank |
| Jingwei cutting | No extra cost | blank | 0.25 |
| Drill holes | No extra cost | blank | 0.10 |

This keeps the normal flow as: Question → Answer → What it adds → Labour time.
