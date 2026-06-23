# Products obvious delete/restore batch

- Added obvious Delete/Restore actions on the selected product header so housekeeping is no longer hidden in the Advanced panel.
- Added Delete/Restore actions directly on product search result cards.
- Updated the Drizzle product status enum to include `deleted`.
- Product delete now self-heals older databases by adding the missing `deleted` enum value before retrying the status update.
