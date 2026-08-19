# Production procedure calendar allocation batch

## Purpose

Production scheduling uses the same item-level procedure records as Production and the Production Board. Calendar does not create a parallel checklist.

## Procedure model

- Printed work includes a distinct `RIP / setup` procedure before `Print`.
- Existing applicable procedures remain separate, including laminate, apply / mount, cut / route / finish, small-format finishing, quality, pack and dispatch handoff.
- The procedure list remains quote-driven, so direct-print work does not gain an unnecessary apply / mount step.
- Existing print jobs missing RIP / setup are reconciled idempotently. If Print is already complete, RIP / setup is inserted as complete with the same check-off details.

## Assignment behaviour

- Every procedure initially inherits the staff and due date from its Production or Dispatch process.
- Editing a procedure in Calendar creates a manual override for that procedure only.
- Multiple staff can be assigned to the same procedure.
- `Use process defaults` removes the override and immediately restores inherited values.
- Dragging an inherited procedure to another date deliberately creates a date override.

## Calendar behaviour

- Procedure cards carry the production item name so repeated operations can be distinguished by sign or quote line.
- The broad Production process card is omitted once real procedure records exist for the job.
- Procedure status comes directly from Production check-off; completed procedures follow the Calendar `Show completed` filter.
- All filters, assignment changes, date changes and inheritance resets save inline without a full-page reload.
