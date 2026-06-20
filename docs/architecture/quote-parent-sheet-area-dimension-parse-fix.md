# Quote parent sheet area dimension parse fix

## Problem

A quoted 600 × 900mm sign using a material named `3mm ACM 2440x1220mm` was calculating the parent sheet as `1.49sqm`, as if the material was `1220 × 1220mm`.

That made the sheet fraction too high and the base sheet material cost incorrect.

## Fix

The quote-side material flow now resolves sheet dimensions from both:

- the saved material width/length fields; and
- real-world dimensions embedded in the material name/SKU/notes, such as `2440x1220mm`.

When both exist, it uses the largest plausible parent sheet area. This protects older material records where one dimension was accidentally saved incorrectly, while still supporting newer correctly-entered materials.

## Result

A `2440 × 1220mm` sheet now calculates as about `2.98sqm`, not `1.49sqm`.

The material picker display also uses the resolved dimensions, so materials named like `2440x1220mm` no longer appear as `1220 × 1220mm` if the saved fields are incomplete/wrong.
