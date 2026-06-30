# Production to Install Scheduler minimal job handoff

## Summary

Install jobs created directly from Production Manager now send a shorter Install Scheduler payload based on the same essentials shown on the fullscreen Production Board card.

## Changes

- Install Scheduler job name is kept concise: client + quote number.
- Job overview/details are reduced to signage production details only:
  - signage line / item code
  - finished size and quantity
  - substrate
  - print method
  - laminate
  - finishing / eyelet notes where present
  - next step
  - quote number
- Verbose survey completion text and full quote internals are no longer sent as the install job description.
- Completed Install Scheduler survey photos stored against the linked survey request are now sent back through as reference photos when creating the install job.
- The Install Scheduler bridge function writes those photos into `jobs/{jobId}/referencePhotos` and avoids duplicate URLs when re-called.

## Version

V26.06.29.12
