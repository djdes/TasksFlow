# Problems

## Residual Verification Failure

`npm run lint` still fails at the repository level after the Telegram invite work.

This failure is not caused by the TG-staff-invite diff. The full lint output in
[raw/lint-full.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/lint-full.txt)
shows existing errors in unrelated paths, for example:

- `.agent/tools/resize-users-shots.js`
- `src/app/(dashboard)/capa/[id]/page.tsx`
- `src/app/(dashboard)/settings/equipment/page.tsx`
- `src/app/invite/[token]/page.tsx`
- `src/components/charts/temperature-chart.tsx`

## Smallest Safe Fix Applied

The smallest safe fix inside this task scope was applied:

- fixed the new staff toolbar JSX so the staff page compiles
- fixed the new Telegram invite dialog hook usage so focused lint passes

After that fix, these task-scoped checks pass:

- [raw/tests.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/tests.txt)
- [raw/lint-targeted.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/lint-targeted.txt)
- [raw/tsc.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/tsc.txt)
- [raw/build.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/build.txt)

## Scope Decision

I did not patch the unrelated repo-wide lint debt in this task because it would
expand the scope beyond the approved Telegram employee invite feature and mix
several existing defects into one delivery.
