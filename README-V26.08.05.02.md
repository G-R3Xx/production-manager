# Production Manager V26.08.05.02

## WooCommerce production-job import repair

- Corrects the PostgreSQL upsert alias used when creating or refreshing a production job from a WooCommerce order.
- Fixes `missing FROM-clause entry for table "existing_job"` during the WordPress order handoff.
- Charge-to-account orders can remain `On hold`; Production Manager treats that status as accepted production work.
- Existing WooCommerce order #269 can be recovered using **Order actions → Send to Production Manager** after deploying this build.

Use with Tender Edge WordPress plugin V3.3.28.
