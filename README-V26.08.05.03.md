# Production Manager V26.08.05.03

## Reliable WooCommerce order recovery

- Includes the PostgreSQL `existing_job` alias repair from V26.08.05.02.
- Recovers the most recent orphaned quote created by an earlier failed handoff instead of creating another quote.
- Records the WooCommerce order before production-job creation so an interrupted import resumes safely.
- Makes repeated WordPress handoffs idempotent and creates only a missing production job.
- Charge-to-account orders remain correctly accepted while their WooCommerce status is `On hold`.

After deployment, resend WooCommerce order #269 using **Order actions → Send to Production Manager**.

Use with Tender Edge WordPress plugin V3.3.28.
