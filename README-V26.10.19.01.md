# Production Manager V26.10.19.01

## Automatic parent-sheet selection in quote wizard

- The signage quote wizard now groups interchangeable stock sizes by **Customer-facing name** instead of making the estimator choose a specific purchased sheet size.
- Example: multiple ACM 3mm parent-sheet sizes appear as one **ACM 3mm** choice.
- After the finished size, bleed/spacing and quantity are known, Production Manager automatically selects the best linked parent sheet.
- The selector prefers a parent sheet that fits the finished item without adding seams; among valid stock sizes it chooses the lowest calculated material cost using nesting/yield, billable sheet increments and the saved material cost/wastage rules.
- If no linked parent sheet can hold the item whole, the existing panelisation calculation is used and the lowest-cost valid panelised stock is selected.
- Roll-stock families with the same Customer-facing name also use the same grouped-choice behaviour and automatically select the most economical linked roll width.
- The material card shows one customer-facing choice and, once the finished size is entered, identifies the internal stock PM selected.
- Existing quote snapshots remain compatible: their saved material identifies the correct material family when reopened.

Version: V26.10.19.01
