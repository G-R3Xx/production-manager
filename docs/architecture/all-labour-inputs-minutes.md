# All labour inputs use minutes

Version: `V26.07.23.07`

All user-facing time entry in Production Manager is entered as ordinary minutes. Staff no longer need to enter decimal or part hours.

Covered fields include:

- Artwork/design time
- Print setup labour
- Laminate application
- Signage finishing and eyelet placement
- Plan/poster/small-format finishing and bindery
- Custom component/assembly labour
- Installation time
- Product recipe labour
- Labour attached to a saved product option

The configured labour rate remains an hourly rate. Pricing converts minutes automatically using:

`labour cost = minutes / 60 × hourly rate × number of people (when applicable)`

Existing product recipes remain backwards compatible. Stored labour quantities continue to use hours internally, are converted to minutes when displayed for editing, and are converted back to hours when saved. Quote cost breakdowns display labour in minutes so users do not see or enter fractional hours.
