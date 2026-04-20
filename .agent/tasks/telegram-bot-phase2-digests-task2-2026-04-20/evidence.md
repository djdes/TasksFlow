# Evidence

- Command: `node --import tsx --test src/lib/telegram-obligation-digests.test.ts`
  - Result: PASS
  - Raw: `.agent/tasks/telegram-bot-phase2-digests-task2-2026-04-20/raw/test-node.txt`
- Command: `npx tsc --noEmit --pretty false`
  - Result: PASS
  - Raw: `.agent/tasks/telegram-bot-phase2-digests-task2-2026-04-20/raw/tsc.txt`

## Acceptance Criteria

- AC1: PASS - `buildStaffObligationDigest(...)` accepts plain inputs and returns `null` when there are no open obligations.
- AC2: PASS - non-empty staff digests include body text, a user/day dedupe key, and a primary CTA for the next exact action via the obligation deep link.
- AC3: PASS - `buildManagerObligationDigest(...)` returns summary body text, an organization/day dedupe key, and the cabinet CTA payload.
- AC4: PASS - both builders are pure and deterministic for a provided `now`; tests use plain inputs without DB access.
- AC5: PASS - both required verification commands now pass on the current branch state.
