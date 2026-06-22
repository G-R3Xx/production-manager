# Product setup: multi-choice finishing and clearer amount labels

This rebuild simplifies two confusing areas in the product creator.

## What changed

- Renamed the answer-line column from **Number** to **Amount / rate**.
- Renamed the question input type **Number** to **Number entry**.
- Added a new staff answer type: **Tick multiple choices**.
- Updated the common **Finishing** preset to use tick boxes instead of a single dropdown.
- Finishing can now allow multiple requirements on one quote line, for example:
  - Jingwei cutting
  - Drill holes
  - Rounded corners
  - Apply tape
- Quote calculation now checks all ticked answers and applies the matching product costing rows for each selected answer.

## Why

Some quote questions are exclusive, such as laminate: `None`, `Gloss`, or `Matt`.

Other quote questions can have more than one answer, especially finishing. A job might need Jingwei cutting and drill holes at the same time. That should not require creating awkward combined answers such as `Jingwei + Drill holes`.

## Recommended setup pattern

For a finishing question:

- Question staff see: `Finishing`
- How staff answer: `Tick multiple choices`
- Required: `Optional`

Answer lines:

| Answer | Adds | Material | Amount / rate | Labour hrs |
| --- | --- | --- | --- | --- |
| Jingwei cutting | No extra cost | No material | blank | 0.25 |
| Drill holes | No extra cost | No material | blank | 0.10 |
| Rounded corners | No extra cost | No material | blank | 0.10 |

On the quote page staff can tick more than one finishing requirement and all matching labour/cost rows will apply.
