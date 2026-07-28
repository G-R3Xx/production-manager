# Guided production steps setup

Version: V26.07.28.09

## Purpose

The former Processes page exposed internal database fields without explaining how they connect to machines, labour and manufacturing methods. The page is now presented as Production steps and guides the user through creating one clear action at a time.

## Workflow

1. Choose a common step such as Direct print, Laminate, Trim / cut, Finishing or Install.
2. Confirm the staff-facing name and work area.
3. Optionally link default labour when hands-on staff time should be costed.
4. Add the step, then use it in Machines and Manufacturing methods.

A recommended signage starter set can be created in one action. Existing names are detected so the starter action does not create duplicates.

## Compatibility

The existing `catalog.processes` records and actions are retained. No migration is required. Existing machines and manufacturing methods continue to reference the same process IDs.
