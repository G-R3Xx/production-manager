# Production Manager V26.08.17.10

## Production status fix

- `Waiting on files` now means an actual production item is missing its print-ready file.
- Attaching the print-ready artwork clears `Waiting on files` immediately and moves the job to `Ready to start` when production has not otherwise begun.
- `Artwork checked` remains an independent production checklist step and no longer causes the job-level status to incorrectly report `Waiting on files`.
- Existing automatic progression remains: real production activity -> `In production`, dispatch handoff -> `Ready for install / pickup`, all steps -> `Complete`.
- Manual `Waiting on material` remains preserved until production begins.
