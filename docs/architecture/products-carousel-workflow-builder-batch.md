# Products carousel workflow builder batch

This batch changes the signage product creator away from scattered materials/questions sections and into a guided card workflow.

## Goal

Product creation should feel like a visual build process, not a database editor.

Normal signage setup now follows:

1. Choose main material
2. Choose available print types for quoting
3. If roll stock is enabled, choose the roll media
4. Choose ink choices: CMYK, White, or CMYK + White
5. Choose laminate options: None plus selected laminate materials
6. Choose finishing options
7. Review the product build

Each step is a single focused card. Completing or saving a step moves the user to the next step.

## What changed

- Added `saveProductWorkflowStepAction` for guided product setup steps.
- Added a new signage workflow/carousel style product builder UI.
- Replaced the normal product builder surface with one active step at a time.
- Existing raw quote questions and recipe rows are still available, but only inside an Advanced section.
- The workflow creates/updates quote fields and linked recipe rows behind the scenes.
- Main material, roll media, ink, laminate and finishing are now set up from visual choices.

## Notes

- Direct print and roll stock are now chosen as available quote print types.
- Roll media is only needed when roll stock is enabled.
- Ink is now a single quote question rather than separate hidden CMYK/white logic.
- Laminate options are generated from selected laminate materials.
- Finishing is a multi-select quote question; common finishing labour rows are created automatically.
- Eyelets support quantity/placement follow-up presets when an eyelet material is linked.

## Why

The previous approach kept drifting back into separate materials, quote questions, and costing sections. This batch makes signage product setup feel closer to a PCPartPicker style flow: choose the part/process, save it, move to the next logical step.
