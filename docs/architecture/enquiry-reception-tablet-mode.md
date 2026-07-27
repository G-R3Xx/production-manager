# Enquiry reception tablet mode

Version: V26.07.27.02

## Purpose

Provide a dedicated reception-friendly enquiry intake screen without exposing or loading the existing enquiry list.

## Behaviour

- New route: `/enquiries/tablet`.
- Uses the active authenticated workspace and existing enquiry creation action.
- Displays only a touch-friendly new enquiry form.
- Does not list, open, edit, delete, quote, or survey previous enquiries.
- Existing client selection still prefills contact details.
- Tablet mode defaults the enquiry source to `Walk-in`.
- Advanced client-logo and correspondence upload sections remain available on the normal Enquiries page but are hidden in tablet mode to keep reception intake fast.
- After saving, tablet mode returns to a fresh blank form and shows a success confirmation.
- Validation errors also return to tablet mode rather than the standard Enquiries page.
- The normal Enquiries page includes an `Open Tablet Mode` button.
- `Exit tablet mode` returns authorised staff to the normal Enquiries page.
