# Production Manager V26.09.02.01

Artwork Approval print hotfix.

- PMS colour swatches now render as inline SVG graphics instead of CSS background fills
- printed artwork approvals preserve PMS swatch colours even when browser print background graphics are disabled
- adds print colour-adjust rules to the public Artwork Approval page for more reliable printed colour/status output
- keeps the PMS code as the authoritative approval reference; the swatch remains an on-screen/printed RGB guide

Carried forward from V26.08.28.03:

- schema DDL is kept out of normal hot read paths when the current schema is already present
- concurrent schema checks are deduplicated within a server runtime
- reduced background alert/global-pulse pressure during navigation
- tuned Vercel Postgres pooling to avoid connection bursts
