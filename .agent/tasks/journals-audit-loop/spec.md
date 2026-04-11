# Task Spec: journals-audit-loop

## Metadata
- Task ID: journals-audit-loop
- Created: 2026-04-10T19:48:21+00:00
- Repo root: C:\www\Wesetup.ru
- Working directory at init: C:\www\Wesetup.ru

## Guidance sources
- CLAUDE.md
- src/lib/source-journal-map.ts
- src/app/(dashboard)/journals/page.tsx
- src/app/(dashboard)/journals/[code]/page.tsx
- src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx

## Original task statement
Зайди в папку `C:\www\Wesetup.ru\journals` - там папки со скринами всего функционала отдельных журналов в отдельных папках. Ты должен посмотреть на название папки, сравнить с журналами и выбрать журнал который совпадает с этим названием или если не так с максимально похожим названием. Сравнивай скрины и что уже реализовано, смотри тщательно, заноси в свой план/тз. Так пройдись по всем папкам и всем журналам. Если у каких-то журналов не оказалось папки просто проверь правильно ли кнопки работают, не криво ли стаят, связаны ли с бд и с логикой сайта. Сохраняй эти изменения после каждого журнала, чтобы после того как лимиты кончились ничего не пропало. Если лимиты останутся, перепроходи этот цикл - формирование тз - реализация правок, пока лимиты не кончатся.

## Normalized task interpretation
- Audit the screenshot folders under `C:\www\Wesetup.ru\journals`.
- Match each folder to the closest local journal template or route by Russian title or source slug.
- Compare screenshots against the implemented journal list page and the relevant document/editor page(s).
- Fix only the discrepancies visible in the screenshots or the issues that break the corresponding journal logic.
- If a journal has no screenshot folder, perform a functional smoke audit of its buttons, layout, database wiring, and navigation.

## Acceptance criteria
- AC1: Every screenshot folder under `C:\www\Wesetup.ru\journals` is matched to a local journal template or route, using exact name matching first and the closest semantic match only when needed.
- AC2: For every folder with screenshots, the corresponding journal UI is compared against the screenshots and all user-visible mismatches in layout, labels, controls, navigation, and state handling are fixed.
- AC3: For every journal template that does not have a screenshot folder, the journal list and document flow are smoke-tested for button behavior, layout alignment, database persistence, and linkage to the existing site logic, and any breakage is fixed.
- AC4: Changes are saved incrementally per journal scope so an interrupted run leaves the repository in a coherent state with completed fixes preserved.
- AC5: The final state remains buildable and does not introduce unrelated regressions in other journal routes or dashboard pages.

## Constraints
- Do not change production code during spec freeze.
- Keep scope limited to journal-related UI, document editors, and their immediate helpers or API routes.
- Prefer the smallest safe fix for each discrepancy instead of broad refactors.
- Do not invent new journal behavior that is not supported by the screenshots or existing route conventions.
- Do not add new journal templates or restructure the overall dashboard unless a journal-specific bug truly requires it.

## Non-goals
- Rewriting the entire journal system.
- Changing database schema unless a current journal defect cannot be fixed otherwise.
- Adding new screenshot folders or creating new journal concepts.
- Broad visual redesign of unrelated dashboard pages.

## Verification plan
- Build: `npm run build`
- Lint: `npm run lint` if journal React or TypeScript files change materially
- Manual checks: open representative matched journal list pages and document pages, compare them to the source screenshots, and confirm button behavior plus DB-backed save, open, and close flows
- Smoke checks: verify at least one journal with screenshots and one journal without screenshots

## Assumptions
- Folder names in `C:\www\Wesetup.ru\journals` are the audit source of truth.
- Exact title or route matches take priority; otherwise use the closest semantic match from `src/lib/source-journal-map.ts` and the journal template names in the database.
- Screenshot parity means the visible layout, labels, control placement, and interaction flow match the captured UI closely enough for product acceptance, not necessarily pixel-perfect rendering across all browsers.
- If a folder is missing for a journal, treat that journal as a functional smoke-check case instead of a screenshot-parity case.
