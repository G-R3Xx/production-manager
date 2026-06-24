# Artwork approval substrate / stock cleanup

This batch cleans the artwork approval production details panel so the substrate/stock section no longer repeats the same material multiple times.

## Changes

- Artwork approval page details now de-duplicate repeated summary lines before display.
- Public artwork approval page uses the same cleaned details.
- Laminate/coating lines are removed from `Substrate / stock` and stay in `Install / finishing`.
- Quote-line artwork page creation now separates substrate/stock from laminate/finishing more cleanly.
- Production item primary stock display also uses the cleaned stock summary so old duplicated artwork page data does not leak into production.

## Why

Quote lines can contain the same material in multiple places:

- product name
- quote option summary
- stock/material option
- finishing/laminate option

Before this batch, the artwork proof panel could show things like:

```text
ACM - 3mm ACM 2440x1220mm
ACM
3mm ACM 2440x1220mm
Laminate: LAM-7yr-Gloss
```

Now the panel keeps the most specific stock line and moves laminate to finishing.
