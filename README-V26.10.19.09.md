# Production Manager V26.10.19.09

## Typecheck fix for simplified operations refactor

- Fixed the test/starter labour seed records introduced in V26.10.19.08 so they include the new optional consumable fields required by the simplified Shop Operations model.
- Existing test labour rows default to no linked consumable (`0` usage), so their previous costing behaviour is unchanged.
- This resolves the `LabourInput` TypeScript error in `products/actions.ts`.

Version: V26.10.19.09
