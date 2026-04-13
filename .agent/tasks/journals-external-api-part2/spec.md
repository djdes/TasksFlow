# HACCP-Online external journals API part 2

## Summary
- Extend the external API so posted data is not only persisted, but rendered correctly in journal UI and PDF for all 35 production journals.
- Preserve the current default entry-upsert behavior for simple journals.
- Add explicit per-code writer strategies for journals whose UI/PDF reads `JournalDocument.config` or expects a normalized entry shape.

## Acceptance criteria
- AC1: `.agent/tasks/journals-external-api-part2/plan.md` exists and lists all 35 journal codes with a verification checklist.
- AC2: `src/lib/external/dispatch.ts` supports a strategy table with backward-compatible default entry writing plus per-code entry/config mapping where required.
- AC3: External payloads for `climate_control`, `cold_equipment_control`, and `cleaning` normalize into the shapes expected by the existing UI components and do not break autofill.
- AC4: Config-driven journals can be populated through the external API without manual UI edits by merging payloads into `JournalDocument.config` via existing normalizers.
- AC5: An automated verification path exists for POST + authenticated UI + authenticated PDF checks, with raw artifacts and per-code evidence files under `.agent/tasks/journals-external-api-part2/`.
- AC6: Final rollup artifacts exist: `FINAL.md`, and `problems.md` if any journal remains unresolved after three attempts.
- AC7: No changes are made to `src/components/journals/hygiene-document-client.tsx` or `src/components/journals/hygiene-documents-client.tsx`.
- AC8: No secrets, backups, or unrelated dirty worktree artifacts are added to git.

## Constraints
- Do not remove or modify production organizations, users, or journal templates.
- Only delete test documents created by this task.
- Do not change `.github/workflows/deploy.yml`.
- Do not run destructive database reset commands.
- Before any Prisma migration, take a production dump and tag a snapshot first.
