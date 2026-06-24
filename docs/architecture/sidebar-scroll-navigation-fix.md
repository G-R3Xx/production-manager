# Sidebar scroll navigation fix

The application sidebar now keeps the workspace/logo/footer visible while allowing the primary navigation list to scroll inside the available vertical space.

This fixes smaller browser windows where the menu could extend past the bottom of the viewport and hide lower sections such as Settings and Integrations.

Changed file:

- `apps/web/src/app/(app)/layout.tsx`

No database changes are required.
