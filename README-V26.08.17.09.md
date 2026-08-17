# Production Manager V26.08.17.09

## Automatic production status progression

Production job status now follows the procedure checklist automatically during normal work:

- Missing pre-production checks/files -> `Waiting on files`.
- Artwork checked + print-ready file attached -> `Ready to start`.
- Completing the first real production step (including Material / stock allocated, Print, Laminate, Cut / route / finish, etc.) -> `In production`.
- Completing all dispatch-ready handoff steps -> `Ready for install / pickup` when other required steps remain.
- Completing every procedure step -> `Complete`.
- Reopening procedure steps recalculates the appropriate job status.
- A manually selected `Waiting on material` state is preserved until a real production step is completed.
- Manual job-status buttons remain available as overrides.

The same progression runs whether a procedure step is changed from the normal Production page or the Production Board API. Attaching a print-ready file also recalculates the pre-production status.

No pricing, quoting, Artwork Approval, MYOB, Purchasing, Gmail, job-sheet or approved-artwork preview logic was changed.
