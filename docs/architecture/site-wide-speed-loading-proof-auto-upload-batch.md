# Site-wide speed, loading visibility and proof auto-upload batch

This batch focuses on day-to-day responsiveness and making waits obvious.

## Loading visibility

- Added a global route/action loading overlay.
- The overlay shows the Production Manager logo pulsing with “I'M LOADING”.
- It appears on app navigation, internal links and form submissions.
- Route loading shells now use the same logo-first loading style.
- Added missing loading states for Enquiries, Surveys and Bootstrap.

## Perceived speed

- Common workflow routes are prefetched after the app becomes idle.
- Navigation still prefetches on hover from sidebar links.
- Quote page follow-up reads now run quote lines, artwork approval lookup and linked client lookup in parallel.
- Artwork page now resolves quote/create lookup in parallel.

## Artwork proof upload

- Existing artwork proof pages now auto-submit when a proof file is selected.
- Pasted proof URLs can also auto-submit with Enter or paste.
- The proof file replaces the existing proof page instead of requiring an extra manual step.
- Manual update button remains as a fallback.
