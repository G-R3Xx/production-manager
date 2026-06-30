# Staff roles management batch

Adds a visible Staff & roles management screen for tenant owners/managers.

## Added
- `/users` is now a Staff & roles page.
- Sidebar navigation now includes Staff & roles.
- Owners/managers can edit each registered user's workspace role.
- Owners/managers can set status to Active, Pending, or Disabled.
- Disabled users keep their history but cannot access the workspace.
- Pending/disabled domain members are no longer silently reactivated on Google sign-in.
- Last active owner/manager cannot be demoted or disabled.
- Managers cannot edit owner accounts or promote users to owner.

## Version
- Updated visible app version to `V26.06.30.03`.
- Active tenant resolution now only returns active memberships, so pending/disabled users cannot load workspace data through stale cookies.
