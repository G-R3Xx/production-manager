# Production Manager V26.08.21.01

- Adds an `Is access equipment required?` option whenever Install is selected in the canonical one-page quote-line editor.
- When required, staff enter the equipment type, raw daily charge and number of hire days.
- Applies the quote's normal markup, profit, MYOB client price level and manual quote discount to the daily equipment cost.
- Saves access equipment as a separate quote line immediately after its related `Sign Install` line.
- Keeps generated install and equipment lines linked when a quote line is edited, and removes obsolete linked lines when Install or access equipment is cleared.
- Preserves nested quote-line ordering throughout the staff quote, client quote and downstream order workflow.

No database migration is required.
