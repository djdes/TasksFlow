# TasksFlow Integration Fixes

## Scope

Fix WeSetup TasksFlow integration issues reported on 2026-04-24:

- avoid raw JSON parse errors in the settings UI when API returns HTML, redirects, or empty/non-JSON errors;
- make affected settings API routes return JSON 401/403 responses instead of redirecting unauthenticated fetches to `/login`;
- register the existing `complaint_register` TasksFlow adapter so complaint tasks use the structured form;
- verify the site from manager/staff perspectives and mobile/desktop viewports;
- commit and push the focused fix.

## Acceptance Criteria

AC1. TasksFlow settings client does not call `response.json()` blindly for integration fetches; non-JSON responses surface a readable error.

AC2. TasksFlow integration and settings API routes touched by this workflow return JSON auth failures for unauthenticated fetches.

AC3. `complaintRegisterAdapter` is imported and included in `SPECIFIC_ADAPTERS`.

AC4. Static checks pass, or failures are documented with exact reasons.

AC5. Browser smoke/adaptive pass is run against the local site, with findings documented.

AC6. Focused changes are committed and pushed to `origin/master`, or push failure is documented.
