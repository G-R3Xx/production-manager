# Quote preset settings / size card batch

This batch moves quote-builder defaults out of hardcoded UI-only values and into Settings / Company.

## Added Settings controls

Settings now includes quote card preset controls for:

- Signage size preset cards
- Small-format size preset cards
- Factory labour hourly rate
- CMYK / white ink rate per square metre
- Mono print rate per square metre

Size presets are edited one per line using:

```text
Label | width mm | height mm
```

Example:

```text
600 × 900 mm | 600 | 900
A5 | 148 | 210
```

## Quote builder behaviour

The quote-side material card flow now receives these settings and uses them for:

- the signage size buttons
- the small-format size buttons
- artwork / install / finishing labour costs
- CMYK and white ink cost
- mono small-format print cost

Global markup and profit still apply after raw cost calculation.

## Database

New tenant setting columns are added by:

- `infra/sql/018_quote_builder_preset_settings.sql`

The server also self-ensures these columns are present when Settings or Quotes are loaded.
