# Install Scheduler survey bridge batch

This build adds the first practical bridge between Production Manager enquiries/survey requests and the existing Install Scheduler site survey workflow.

## Workflow

1. Create an enquiry in Production Manager.
2. Click **Create site survey request**.
3. Production Manager creates the local survey request and calls the Install Scheduler Firebase function.
4. Install Scheduler creates a `site_survey` job and returns a job id/link.
5. Staff complete the site survey inside Install Scheduler.
6. When the survey is submitted as completed, Install Scheduler posts the collected survey data back to Production Manager.
7. Production Manager updates the survey request with the completed survey details and payload.

## Production Manager environment variables

```text
INSTALL_SCHEDULER_CREATE_SURVEY_URL=
INSTALL_SCHEDULER_BRIDGE_KEY=
INSTALL_SCHEDULER_BASE_URL=https://install-scheduler.web.app
```

`INSTALL_SCHEDULER_BRIDGE_KEY` must match the Firebase secret `PM_BRIDGE_KEY`.

## Database migration

Run this SQL once:

```text
infra/sql/019_install_scheduler_survey_bridge.sql
```

It adds Install Scheduler link/status/payload fields to `app.survey_requests`.

## Callback endpoint

Install Scheduler posts completed survey data to:

```text
/api/install-scheduler/survey-completed
```

This endpoint requires:

```text
Authorization: Bearer <INSTALL_SCHEDULER_BRIDGE_KEY>
```

## Notes

This first bridge stores Firebase photo URLs and survey metadata in the Production Manager survey payload. It does not copy Firebase Storage files into Supabase Storage yet.
