# Production Manager V26.08.17.04

Fixes the public Artwork Approval response SQL parameter typing.

- Artwork approval and request-changes responses now explicitly cast PostgreSQL parameters to the target column types.
- Resolves `inconsistent types deduced for parameter $2` when a client approves artwork.
- Keeps the V26.08.17.03 proof watermark and client-facing proof restrictions unchanged.
