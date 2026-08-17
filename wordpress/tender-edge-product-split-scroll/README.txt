Tender Edge Product Split Scroll
Version 1.0.4

Desktop-only independent scroll panes for WooCommerce product gallery and Production Manager configurator.

V1.0.4 fixes the root layout issue behind option-image jumps:
- the shared product row is now constrained to the actual visible viewport height
- removes the oversized theme/product wrapper that created the blank gap above the footer
- accounts for sticky WordPress/site headers and the fixed cart bar
- gallery and configurator branches are height-contained so theme wrappers cannot re-expand the page
- retains option-image viewport and pane-position protection from V1.0.2
- mobile/tablet below 1024px remains normal document scrolling

1.0.4: Removed shared-wrapper/branch height manipulation. Only the actual gallery and configurator panes are height-limited; keeps a connected RHS node during asynchronous image swaps and leaves the parent product layout in normal flow.
