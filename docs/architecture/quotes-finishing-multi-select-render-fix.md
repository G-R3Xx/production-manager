# Quotes finishing multi-select render fix

This batch fixes an issue where existing Finishing questions could still appear on the quote page as a single dropdown even after the Products page supported "Tick multiple choices".

## Changes

- Quote line builder now normalises multi-choice question types before rendering.
- Existing Finishing questions stored as normal dropdowns are treated as multi-choice on the quote page when they contain multiple answers.
- Multi-choice fields render as checkboxes and submit a comma-separated answer list to the quote line action.
- Quote calculation already reads comma-separated values, so all ticked finishing answers can trigger their own labour/material rows.
- "None" / "No" style answers behave like exclusive choices: selecting a real finishing option automatically removes None, and selecting None clears the other choices.

## Result

A finishing setup such as:

- None
- Jingwei cutting
- Drill holes

now shows on the quote page as tickable choices so both Jingwei cutting and Drill holes can be selected on the same quote line.
