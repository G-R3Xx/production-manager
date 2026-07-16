# Quote roll stock quantity nesting fix

Roll stock pricing in the quick quote builder now calculates from the full quote-line quantity instead of pricing one face and multiplying it blindly.

- Roll print media and cut vinyl use the full quantity and side count to nest pieces across the roll width.
- Total roll metres are rounded up consistently and then divided back to a per-unit price for the existing quote-line pricing model.
- The current item summary now shows `Roll use` for roll-stock jobs.
- Fixed setup-style labour entries such as artwork, print setup, laminate labour and general finishing labour are treated as once-per-quote-line allowances, so quantity no longer multiplies setup time 100x.

Example: 100 × 297 × 210mm stickers on a roll can now nest across the roll and price from the total roll metres required, rather than charging 100 separate single pieces.
