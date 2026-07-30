# Production Manager V26.07.30.03

## TypeScript build correction

- Fixed `saveSimpleProductProductionFlowAction` referencing `mainMaterialId` outside its scope.
- The production-flow form now reads the submitted `materialId` before saving the workflow.
- Preserves the V26.07.30.02 saved-product custom-size fields and roll-stock pricing fixes.
- No database migration is required.
- Visible application/catalogue version: `V26.07.30.03`.
