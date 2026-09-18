# Production Manager V26.09.17.04

## Machine save performance correction

- Removed the forced `router.refresh()` that reloaded the Machines page and shared application layout after every edit.
- The editor now closes immediately when Save is pressed and shows a compact saving/saved status on the card.
- Save errors automatically reopen the editor with the entered values and error message intact.
- Combined active-tenant authorization and the machine update into one database query, removing a separate membership lookup from the save path.
- The normal background synchronizer can refresh the machine summary later without holding up the save interaction.

App and WordPress catalogue version updated to **V26.09.17.04**.
