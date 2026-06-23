# MYOB open job / order sync workflow

This batch adds controlled MYOB order sync.

Workflow rule:

- Enquiries stay in Production Manager only.
- Surveys stay in Production Manager / Install Scheduler only.
- Draft quotes stay in Production Manager only.
- Accepted quotes become **ready for MYOB Order**.
- Staff can manually push an accepted quote to MYOB as an open Order.
- Production Manager remains the workflow/source for artwork, production, materials, checkoff and install state.
- MYOB is used for the accepted job/order and final accounting.

Added quote columns:

- `myob_order_uid`
- `myob_order_number`
- `myob_order_status`
- `myob_order_synced_at`
- `myob_order_sync_error`
- `myob_order_payload_json`

The UI now shows MYOB order status on Quotes and Production. The action requires an accepted quote and a linked MYOB customer/client mapping before pushing.
