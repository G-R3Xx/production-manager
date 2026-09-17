# Production Manager V26.09.17.03

## Faster machine detail saves

- Machine edits now save inline instead of redirecting through a complete Machines page navigation.
- The edit panel shows a clear saving state, closes after success and refreshes the machine card in the background.
- Save errors remain visible inside the edit panel, preserving the entered values for correction.
- A machine update now uses one database round trip instead of opening and committing a transaction around a single `UPDATE` statement.

App and WordPress catalogue version updated to **V26.09.17.03**.
