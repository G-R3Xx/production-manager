# Production Manager V26.08.18.09

## Survey → quote → production continuity

- Completed Install Scheduler surveys now create/reuse the linked PM quote directly and create one draft quote line per surveyed sign/location.
- Each imported survey line carries its own measurements, quantity, notes, fixing/access details and survey photos in an internal `surveyContext` snapshot.
- Imported survey lines start as **needs pricing/configuration** with quantity and measured width/height prefilled; staff configure the real material/print/finishing in the normal quote builder.
- Saving the configured line preserves its survey reference while clearing the needs-configuration state.
- PM blocks Email Quote / Mark Quote Sent while any surveyed line still needs configuration, and unconfigured survey placeholders are never rendered on the client-facing quote.
- Quote Setup shows the internal survey reference and line-specific photos beside the correct quote line.
- Production Job Sheets show a line-specific **Site Survey Reference** section with measurements, work/access/fixing notes and up to four tied survey photos. Survey reference content remains internal and is not shown to clients.
- Existing survey quotes are reused; pressing the survey quote button again adds only missing surveyed sign lines, avoiding duplicates.
