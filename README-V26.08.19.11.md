# Production Manager V26.08.19.11

- Adds an instant dashboard Job Type filter for Signage, Small format, Plans / posters, Installation / service, Mixed work and Other.
- Derives job type from main quote lines, then enquiry and survey details when a quote does not yet exist.
- Ignores linked installation charge lines when classifying the parent signage job.
- Resolves dashboard logos from a correctly matched PM client, the enquiry logo or an exact client-name match without requiring MYOB linkage.
- Rejects a mismatched linked-client logo so one client's branding cannot appear on another client's job.
- Loads job-type metadata in one grouped query to preserve fast dashboard startup.
