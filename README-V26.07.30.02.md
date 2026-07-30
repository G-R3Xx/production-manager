# Production Manager V26.07.30.02

## Saved-product custom size quoting

- Selecting `Custom size` in the saved-product quote builder now reveals required `Width mm` and `Height mm` fields directly below the size selector.
- Custom dimensions immediately drive material, roll length, ink, laminate and labour calculations.
- The quote-line summary records the actual custom finished size instead of only saying `Custom size`.
- Required dimension fields prevent a custom-size line from being added before both measurements are entered.
- Strengthens removal of the redundant Roll stock question when the saved product already has a fixed roll material as its main substrate, including older guided-product recipes without a role marker.
- No database migration is required.
- Visible application/catalogue version: `V26.07.30.02`.
