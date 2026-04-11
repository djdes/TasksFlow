# Problems: general-cleaning-parity-2026-04-11

## Verification blocker

Full `next build` could not be taken to `PASS` for this task because the current repo state fails in an isolated build copy on an unrelated import resolution error:

- `src/app/(dashboard)/journals/[code]/page.tsx`
- Error: `Module not found: Can't resolve '@/components/journals/finished-product-documents-client'`

## Collaboration blocker

The worktree contains concurrent unrelated edits in overlapping files used by the journals flow. Because the user explicitly said many parallel streams are running, staging and pushing from the current worktree would risk bundling unrelated changes into the `master` deploy commit.

## Smallest safe next step

1. Stabilize or finish the unrelated overlapping journal changes in the worktree.
2. Resolve the repo-level build failure around `finished-product-documents-client`.
3. Re-run `next build`.
4. Stage only the intended `general_cleaning` deltas.
5. Push to `master` and verify GitHub Actions deploy.
