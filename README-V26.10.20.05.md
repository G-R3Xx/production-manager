# Production Manager V26.10.20.05

Australian release date: 20 October 2026.

## Enquiry intake — mandatory site-survey decision

New enquiry intake now explicitly asks **Site survey required?** with no preselected answer. Staff must choose **Yes** or **No** before the enquiry can be created, preventing a survey requirement from being silently missed during intake.

When **Yes** is selected:

- the site address becomes required;
- Production Manager creates the enquiry as normal;
- a linked `survey_requests` record is created automatically;
- the enquiry moves immediately to `survey_requested`;
- the existing Install Scheduler bridge is called automatically to create the matching external survey job;
- client/contact/phone/email/site address, enquiry requirement, notes and available client-logo details are carried into the survey bridge payload;
- the enquiry screen reports whether the Install Scheduler survey was created successfully or whether the PM survey exists but the external bridge failed/not configured.

When **No** is selected, the enquiry remains on the normal new-enquiry path and no survey request is created.

The same mandatory survey decision is present in both normal Enquiries intake and Tablet Mode because they share the same intake form.

## Compatibility

- No database migration is required.
- Existing enquiries are unchanged.
- The existing manual **Create site survey request** action remains available for an enquiry if circumstances change later.
- V26.10.20.04 quote-line save performance changes and all earlier catalogue/client-quote fixes are retained.
