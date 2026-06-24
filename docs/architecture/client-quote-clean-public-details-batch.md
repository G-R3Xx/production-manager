# Client quote clean public details batch

## Goal
Make the public client quote page read like a proper customer-facing quote instead of exposing internal setup allowances and costing workflow details.

## Changes
- Rebuilt the public quote header with:
  - brand logo
  - trading/legal company name
  - ABN
  - company phone/email/address
  - quote number, status and issued date
- Added client detail cards to the top of the public quote:
  - client name
  - contact
  - email
  - phone
  - billing address when available
  - site address when available from the source enquiry/survey/client record
- Added a Job / quote details card using the source enquiry summary, survey details or first quote line as the customer-facing job name.
- Added client-facing quote line formatting so internal quoting allowances are hidden from the public view.

## Client-facing line formatting
- Signage lines now show a clean title such as:
  - `ACM 1220x2440mm Gloss Laminate`
- Signage sub-lines now show only useful production details such as:
  - `ACM 3mm - 1220x2440mm, Direct Print, CMYK, Gloss Laminate Single sided`
- Print setup labour, artwork labour and other internal setup allowances are not displayed on the public quote line.
- Install lines now show:
  - `Sign Install`
  - fixing types only, when available
- Installer count and install hours are hidden from the public install line.

## Files changed
- `apps/web/src/app/public/quotes/[token]/page.tsx`
