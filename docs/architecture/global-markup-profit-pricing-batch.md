# Global markup and profit pricing batch

Adds tenant-level quote pricing multipliers so entered prices stay as cost prices.

## Behaviour

Quote unit sell price is now calculated as:

```text
calculated product cost × global markup × global profit
```

Default values are:

```text
Global markup: x1.5
Global profit: x1.2
Total multiplier: x1.8
```

## UI

Company settings now includes a **Global quote pricing** section with:

- Global markup multiplier
- Global profit multiplier

## Quote page

The calculated price panel now shows:

- raw cost before markup
- markup multiplier result
- profit multiplier
- final sell price per unit

## Database

`infra/sql/017_global_markup_profit_settings.sql` adds:

- `app.tenant_settings.global_markup_multiplier`
- `app.tenant_settings.global_profit_multiplier`

The server also safely creates these columns if they are missing, so existing dev databases should not crash before the SQL file is applied.
