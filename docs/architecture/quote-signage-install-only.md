# Quote signage install-only flow

Version: `V26.07.27.01`

## Purpose

Clients can supply completed signage for installation. The Signage quote flow now includes an **Install only — client-supplied signage** choice that does not require a substrate, stock, finished size, artwork, printing or production finishing selection.

## Behaviour

- Available directly beneath Large format / signage in the quick quote type selector.
- Also available as the first card inside the advanced Signage base-material step.
- Reuses the existing install pricing fields for installer count, install minutes, travel/call-out cost, fixings and consumables.
- Saves one primary `Sign Install` quote line rather than creating a zero-value signage line plus a second dispatch line.
- Quantity is fixed to one install job.
- The structured quote-line snapshot keeps the install inputs editable when the saved line is reopened.
- The line remains compatible with the existing client quote display, production workflow and Install Scheduler hand-off recognition.
