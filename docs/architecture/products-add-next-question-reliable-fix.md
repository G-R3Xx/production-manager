# Products add-next-question reliable fix

This batch fixes the quick question buttons on the Products page.

## What changed

- Added a dedicated `addQuickProductQuestionAction` server action.
- Quick buttons now submit only `productId`, `presetKey`, and the fallback material id instead of a large hidden custom-question form.
- Common question presets are created server-side so the quick buttons cannot silently drop answer/pricing fields.
- Questions that already exist are no longer shown as clickable buttons. They appear as ticked "added" chips.
- Missing questions remain clickable.

## Why

The previous UI made it look like every common question could be added repeatedly, but if a matching question already existed the save could appear to do nothing. The new UI makes the state obvious and routes quick buttons through a simpler action path.
