# Public quote accept response fix

- Updated public quote acceptance so the core response save no longer depends on MYOB sync metadata being present/updatable.
- Acceptance now first saves the client response/status/timestamp, then separately attempts to mark the quote as ready for MYOB sync.
- If the MYOB ready-status update fails, the client acceptance remains saved and the public quote page does not show a false acceptance failure.
- Public quote response display now also treats accepted/declined/change-request timestamps as the source of truth, so the client sees the correct response state even if a legacy status value is present.
- Updated visible app version to `V26.07.15.07`.
