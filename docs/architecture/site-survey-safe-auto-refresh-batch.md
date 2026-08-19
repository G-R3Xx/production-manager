# Site survey safe auto-refresh batch

## Purpose

Install Scheduler can complete a site survey while Production Manager is already open. The Surveys screen must receive that state without a manual browser refresh and without interrupting local survey editing.

## Behaviour

- Surveys polls a lightweight tenant fingerprint every five seconds.
- The fingerprint contains survey count plus the latest `updated_at`, avoiding repeated transfer of returned survey payloads and photos.
- Polling runs immediately on mount and whenever the browser regains focus, restores the page or makes the tab visible.
- A changed fingerprint triggers `router.refresh()`, preserving the current route and scroll context.
- Dirty inputs, textareas, selects and content-editable fields postpone refresh so unsaved staff input cannot be overwritten.
- The changed survey card is keyed by its update timestamp, ensuring uncontrolled form values and returned photos are rebuilt from current server data.
- Survey `updated_at` is included in the global app activity pulse so other workflow surfaces also detect externally completed surveys.
