# Material minimum billable sheet fraction

Version: V26.07.23.05

Sheet materials can define a minimum billable increment independently of physical nesting. The quote first calculates actual fractional sheet use across the whole line quantity, then rounds that total to the configured increment and divides it back to a per-unit cost.

Options are recommended, exact usage, quarter sheet, half sheet, and full sheet. Recommended defaults are quarter-sheet increments for acrylic/ACM/aluminium and half-sheet increments for PVC/corflute. Existing materials use the recommended mode until explicitly edited.
