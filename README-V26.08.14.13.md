# Production Manager V26.08.14.13

## Quote revision response lifecycle

- Resending a quote after client change requests now preserves prior client cancellations instead of resetting every line to pending.
- Cancelled lines are retained internally for history/audit but are excluded from the next client-facing quote revision.
- Only lines still marked `changes_requested` are reset to `pending` on resend.
- A line amended by staff is explicitly returned to the active client-facing scope and gets fresh Approve / Cancel / Request changes controls.
- Public quote totals and response completion logic operate only on the active client-facing revision scope.
- Direct Gmail quote sending, inline quote-line editing, MYOB integration and Purchasing are unchanged.
