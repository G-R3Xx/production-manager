# Small format duplicate/triplicate template visibility fix

This batch restores the Duplicate / triplicate books starter template to the visible product creation flow.

## Why

The product starter card grid was only rendering the first eight starter templates. The `carbon_books` starter still existed in the preset logic, but it was the ninth starter in the list, so it disappeared from the visible Create Product UI.

## Changes

- Replaced the limited starter grid with grouped starter sections:
  - Signage / large format
  - Small format
- Small format starters are now visually separated with the purple small-format treatment.
- Duplicate / triplicate books is visible again as a first-class small format template.
- The underlying `carbon_books` preset remains unchanged and still creates copy set, copy colours, cover colour, tape colour, sequential numbering, and quantity quote questions.

