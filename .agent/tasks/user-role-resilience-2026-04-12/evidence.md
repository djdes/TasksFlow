# Evidence

## Scope completed
- Canonical role parsing and selection helpers added in `src/lib/user-roles.ts`.
- User update API now validates role payloads and persists canonical role values.
- User invite API also persists canonical role values.
- Edit-user dialog now normalizes legacy DB roles before rendering the select.
- Role-driven default responsible selection was normalized in these journal/document paths:
  - acceptance
  - glass list
  - PPE issuance
  - cleaning
  - intensive cooling
  - climate document auto-fill API
  - cold equipment auto-fill API
  - journal document creation API

## Acceptance criteria
- AC1: PASS — `src/app/api/users/[id]/route.ts` validates role input and writes `toCanonicalUserRole(role)`; invite route does the same.
- AC2: PASS — permission checks in changed document APIs now use normalized helpers (`isManagementRole`, `isManagerRole`) and existing auth mapping remains intact.
- AC3: PASS — changed document helpers now choose responsible users via shared normalized selectors (`pickPrimaryManager`, `pickPrimaryStaff`).
- AC4: PASS — changed journal/document code paths no longer depend on raw legacy role string comparisons for responsible-user selection.
- AC5: PASS — changed document config builders still resolve responsible titles/users from stored users after role updates because labels and selections use normalized roles.
- AC6: PASS — `npx eslint ...changed files...` and `npx tsc --noEmit` passed.
- AC7: PASS — `npx prisma validate` passed.

## Commands
- `npx eslint "src/lib/user-roles.ts" "src/app/api/users/[id]/route.ts" "src/app/api/users/invite/route.ts" "src/components/settings/edit-user-dialog.tsx" "src/lib/acceptance-document.ts" "src/lib/glass-list-document.ts" "src/lib/ppe-issuance-document.ts" "src/lib/cleaning-document.ts" "src/lib/intensive-cooling-document.ts" "src/app/api/journal-documents/[id]/climate/route.ts" "src/app/api/journal-documents/[id]/cold-equipment/route.ts" "src/app/api/journal-documents/route.ts"`
- `npx tsc --noEmit`
- `npx prisma validate`
