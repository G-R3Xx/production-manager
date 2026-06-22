# Material create server error fix

Fixes the Materials page crashing to the generic Next.js server error screen after pressing **Create material**.

## What changed

- Material numeric fields are now sanitised before database insert.
- Values such as `$450`, `1,370`, `40lm`, `1220mm` and blank values no longer get passed directly into Postgres numeric columns.
- Optional numeric fields now save as `NULL` when blank instead of crashing.
- Stock quantity and purchase cost default to `0` when blank.
- Create failures now redirect back to Materials with a visible error message instead of showing the full-screen server error.
- New material rows now write both the legacy enum `type` field and the newer text `material_type` field so material filtering remains consistent.

## Why

The Materials form was using text inputs so real-world values like `$450.00`, `1,370mm`, or `40lm` could be entered. Postgres numeric columns reject those raw strings. The action now extracts the numeric value safely before saving.
