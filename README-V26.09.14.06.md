# Production Manager V26.09.14.06

## Production Setup cleanup + performance

- Removed the duplicate Production Setup tab/navigation system.
- The numbered Resources → Process → Production Method flow is now the single Production Setup navigator across the setup screens.
- Added responsive behaviour for the flow navigator.
- Processes now loads Processes, Machines and Labour in one Postgres round trip instead of three separate serverless DB queries.
- Production Methods reuses the same combined resource snapshot, reducing database round trips.
- Machines no longer performs an extra Processes query merely to repeat assignments; assignments remain managed in the Process Library.
- No database migration is required.
