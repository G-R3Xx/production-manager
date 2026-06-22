# Products quote question edit/remove batch

This batch makes the common quote question chips actionable instead of read-only.

## Problem
The `Add the next question` panel showed already-added questions as checked chips only. Users could see Size, Print type, White ink, Laminate, Finishing, and Quantity, but there was no obvious edit or remove action in that panel.

## Change
- Renamed the panel to `Quote questions`.
- Missing common questions remain clickable quick-add buttons.
- Existing common questions now appear under `Manage existing questions`.
- Each existing question has:
  - `Edit`
  - `Remove`
- Edit opens the existing full question editor.
- Remove deletes the question and its linked costing rows using the existing delete action.

## Intent
A user should not have to hunt elsewhere to edit or remove questions that are already shown in the common question area.
