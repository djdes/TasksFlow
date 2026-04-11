# Evidence

## Summary
- Added demo-sample normalization at the journal page level so demo organizations no longer keep legacy packs of many sample documents.
- Reduced staff journal seed packs to one active and one closed sample.
- Added missing closed samples for journal branches that previously created only active examples.
- Added sample pair creation for scan-only journals and base document journals that had no sample pair.

## Changed files
- `src/app/(dashboard)/journals/[code]/page.tsx`
- `src/lib/hygiene-document.ts`

## Verification
- `npx tsc --noEmit` => PASS
- `npx eslint "src/app/(dashboard)/journals/[code]/page.tsx" src/lib/hygiene-document.ts src/components/journals/pest-control-documents-client.tsx` => PASS

## Notes
- Demo normalization is gated by presence of the fixed demo admin email `admin@haccp.local`.
- Existing duplicate sample packs are normalized away by deleting non-conforming sample sets for the current journal template in the demo environment, then allowing the updated seed logic to recreate exactly one active and one closed sample.
