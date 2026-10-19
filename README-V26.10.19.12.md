# Production Manager V26.10.19.12

## Quote builder / Shop Operations linkage

- Simple Shop Operations can now be used directly by the quote builder without creating a redundant Process link first.
- Existing explicit Process → Shop Operation links still take priority.
- Direct fallback uses exact known operation aliases only, avoiding accidental matches between unrelated finishing operations.
- `Eyelets` now automatically supplies its configured labour rule and linked consumable to the quote builder as soon as the Shop Operation exists.
- The `Print / file setup` quick-start operation can be resolved automatically for print labour when there is no explicit process link.
- Added exact Jingwei/Jewei cutting aliases for a directly named Shop Operation.
- Manual labour override fields now accept hundredths of a minute (`0.25`, `0.10`, etc.) instead of being restricted to 0.5-minute increments.

This keeps machine/process mapping available for real equipment while removing the extra setup step from simple consumable + labour operations.
