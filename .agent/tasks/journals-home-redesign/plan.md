# Journals home redesign

## Goal
Align `/journals` (the main list) with the new visual language used on the login page and the recent settings redesign: dark hero + stat pills + card grid, `#0b1024` / `#5566f6` palette, `rounded-2xl` / `rounded-3xl`, subtle shadows.

## Scope
- `src/app/(dashboard)/journals/page.tsx` — keep server-side data, pass extra counts.
- `src/components/journals/journals-browser.tsx` — full visual rewrite. Preserve behavior:
  - search + deferred filter
  - tariff grouping (basic / extended)
  - `canAccessTariff` gating (soft: locked badge, still clickable)
  - SanPiN / HACCP mandatory badges
  - navigation to `/journals/<code>`
- No changes to `src/lib/journal-tariffs.ts`.

## Design
1. **Hero** (full-width, `rounded-3xl`, `bg-[#0b1024]`): brand icon, title "Журналы", subtitle, tariff plan pill, 4 stat pills (Всего / Базовых / Расширенных / Обязательных СанПиН).
2. **Search bar** (rounded-2xl, focus-ring indigo) + results counter.
3. **Tariff section headers**: icon tile (Sparkles для basic, Crown для extended) + title + count chip + "требуется апгрейд" pill when locked.
4. **Template cards**: per-journal lucide icon in colored tile (indigo для basic, amber для extended), title + description, SanPiN/HACCP chips, ArrowRight hover-shift. Locked cards: opacity-85 + Premium chip.
5. **Empty state** (search miss): dashed rounded-3xl, SearchX icon, "Очистить поиск" button.

## Red lines
- Don't touch `hygiene-document-client.tsx`, `hygiene-documents-client.tsx`.
- Don't break the link target `/journals/<code>`.
- Don't change Prisma schema.

## Evidence
- Local `npm run build` green.
- Playwright screenshots of `/journals` after deploy.
