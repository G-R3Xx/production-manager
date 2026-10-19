# Production Manager V26.10.19.10

## Labour operation decimal-time fix

- Shop Operation labour time now accepts hundredths of a minute, so values such as `0.25` and `0.75` are valid.
- Minimum labour time also accepts hundredths of a minute.
- The live cost example now preserves two decimal places where needed instead of rounding `0.25` to `0.3`.
- This fixes the Eyelets quick-start template validation error.

Version: V26.10.19.10
