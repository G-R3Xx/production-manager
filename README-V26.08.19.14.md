# Production Manager V26.08.19.14

- Refreshes the Quotes page immediately after creating a MYOB Item Order so the orange ready state changes to green.
- Shows the returned MYOB order number in the success message and MYOB order panel.
- Adds a clear `Creating MYOB order…` pending state and disables repeat clicks while the request is running.
- Prevents a stale browser page from creating a duplicate MYOB order when the quote is already synced.
