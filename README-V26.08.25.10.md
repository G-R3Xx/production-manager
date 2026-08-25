# Production Manager V26.08.25.10

## V26.08.25.10

- Fixed oversized rigid-sheet panel stock usage so panels that can nest together on one parent sheet are no longer charged as separate sheets.
- Example: a 4000 × 500mm ACM sign on 2440 × 1220mm stock is split into two 2000 × 500mm panels, which nest on one parent sheet, so calculated stock usage is 1 sheet.
- Panel splitting stays conservative: Production Manager only uses the minimum panel grid required to fit the finished size and does not introduce extra seams simply to improve yield.

