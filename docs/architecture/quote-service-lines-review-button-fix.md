# Quote service lines and Review button fix

This batch makes the quote review step clearer and adds a dedicated service-line flow.

## Review button clarity

The review step previously still showed a `Review` button, which only navigated to the current review step and felt like it did nothing. On the review step the right-hand action now becomes `Save quote line`.

The lower save action remains available, but the main card footer now makes the intended action clear.

## New pickup / delivery / install quote flow

The quote-side builder now starts with three flow choices:

- Large format / signage
- Small format / print
- Pickup / delivery / install

The service flow supports:

- Pickup / client collection as a no-charge line unless manually overridden
- Delivery charge as a fixed cost line
- Installation labour using: installers × hours × labour rate
- Optional travel / call-out cost
- Install fixings / consumables such as silicone, tape, screws/anchors, screms/special fixings and other consumables

These service lines use the same global markup and profit multipliers as production quote lines.
