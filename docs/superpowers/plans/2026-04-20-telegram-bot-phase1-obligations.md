# Telegram Bot Phase 1 Obligations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first Telegram bot foundation where employee and manager `/start` are obligation-aware and the Mini App home is powered by explicit journal obligations instead of today's missing-entry heuristics.

**Architecture:** This plan intentionally covers only Phase 1 from the approved Telegram roadmap. It introduces a small `JournalObligation` persistence layer, a pure helper for target-path resolution, a sync/query service that mirrors today's ACL and daily-journal rules, and thin integrations for Mini App home plus Telegram `/start`. Employee reminders, cooldown policy, and manager digests are deferred to follow-on plans once the obligation foundation is live.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, NextAuth, grammy, node:test with `tsx`

---

## Scope Split

The approved roadmap spec spans multiple subsystems. Do not implement all phases in one pass.

This plan covers:

- AC1 foundation for a first-class obligation model
- AC2 employee `/start` next-action CTA
- AC3 manager `/start` summary CTA
- AC4 nearest exact target links for phase 1
- AC6 Mini App home backed by obligations
- AC7 shared access model reuse
- AC8 backward-compatible rollout

This plan does **not** cover yet:

- manager digest cron
- reminder cooldown policy
- employee completion confirmations
- document-row-level obligations

Those belong in the next plan after this phase is verified.

## File Structure

**Create:**

- `src/lib/journal-obligation-links.ts`
- `src/lib/journal-obligation-links.test.ts`
- `src/lib/journal-obligations.ts`
- `src/lib/journal-obligations.test.ts`
- `src/lib/bot/start-home.ts`
- `src/lib/bot/start-home.test.ts`
- `src/app/mini/o/[id]/page.tsx`

**Modify:**

- `prisma/schema.prisma`
- `src/app/api/mini/home/route.ts`
- `src/app/mini/page.tsx`
- `src/lib/bot/start-response.ts`
- `src/lib/bot/start-response.test.ts`
- `src/lib/bot/handlers/start.ts`

**Verification commands:**

- `node --import tsx --test src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.test.ts`
- `npm run lint -- src/lib/journal-obligation-links.ts src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.ts src/lib/bot/start-response.test.ts src/lib/bot/handlers/start.ts src/app/api/mini/home/route.ts src/app/mini/page.tsx src/app/mini/o/[id]/page.tsx`
- `npx tsc --noEmit --pretty false`
- `npm run build`

## Design Notes For The Implementer

- Reuse `ALL_DAILY_JOURNAL_CODES` and `getTemplateTodaySummary` instead of inventing new daily logic.
- Reuse `getAllowedJournalCodes`, `aclActorFromSession`, and existing access helpers. Do not fork access logic for Telegram.
- Keep manager summary read-only in phase 1. No callback menus, no nudge buttons yet.
- Phase 1 "exact target" means:
  - entry journals -> `/mini/journals/<code>/new`
  - document journals -> `/mini/journals/<code>`
  - Telegram button -> `/mini/o/<obligationId>` which records open and redirects to the target path
- Keep `/start` backward compatible:
  - unlinked users still receive the short invite guidance
  - linked users still get one primary Web App button

### Task 1: Add obligation target-path helpers

**Files:**
- Create: `src/lib/journal-obligation-links.ts`
- Test: `src/lib/journal-obligation-links.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMiniObligationEntryUrl,
  resolveJournalObligationTargetPath,
} from "@/lib/journal-obligation-links";

test("resolveJournalObligationTargetPath sends entry journals to the new-entry form", () => {
  assert.equal(
    resolveJournalObligationTargetPath({
      journalCode: "incoming_control",
      isDocument: false,
      activeDocumentId: null,
    }),
    "/mini/journals/incoming_control/new"
  );
});

test("resolveJournalObligationTargetPath keeps document journals on the journal page", () => {
  assert.equal(
    resolveJournalObligationTargetPath({
      journalCode: "hygiene",
      isDocument: true,
      activeDocumentId: "doc_1",
    }),
    "/mini/journals/hygiene"
  );
});

test("buildMiniObligationEntryUrl appends the obligation redirect path to the mini base url", () => {
  assert.equal(
    buildMiniObligationEntryUrl("https://wesetup.ru/mini", "obl_1"),
    "https://wesetup.ru/mini/o/obl_1"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --import tsx --test src/lib/journal-obligation-links.test.ts
```

Expected: FAIL with module-not-found or missing export errors for `journal-obligation-links`.

- [ ] **Step 3: Write minimal implementation**

```ts
type TargetArgs = {
  journalCode: string;
  isDocument: boolean;
  activeDocumentId: string | null;
};

export function resolveJournalObligationTargetPath(args: TargetArgs): string {
  if (args.isDocument) {
    return `/mini/journals/${args.journalCode}`;
  }
  return `/mini/journals/${args.journalCode}/new`;
}

export function buildMiniObligationEntryUrl(
  miniAppBaseUrl: string,
  obligationId: string
): string {
  return `${miniAppBaseUrl.replace(/\/+$/, "")}/o/${obligationId}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --import tsx --test src/lib/journal-obligation-links.test.ts
```

Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/journal-obligation-links.ts src/lib/journal-obligation-links.test.ts
git commit -m "feat(telegram-bot): add obligation links"
```

### Task 2: Add the `JournalObligation` model and sync/query service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/journal-obligations.ts`
- Test: `src/lib/journal-obligations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { syncDailyJournalObligationsForUser } from "@/lib/journal-obligations";

test("syncDailyJournalObligationsForUser creates one pending obligation per allowed daily journal", async () => {
  const writes: Array<Record<string, unknown>> = [];

  const obligations = await syncDailyJournalObligationsForUser(
    {
      userId: "user_1",
      organizationId: "org_1",
      now: new Date("2026-04-20T08:00:00.000Z"),
    },
    {
      getUserActor: async () => ({ id: "user_1", role: "cook", isRoot: false }),
      getAllowedJournalCodes: async () => ["incoming_control", "hygiene", "accident_journal"],
      getDisabledJournalCodes: async () => new Set<string>(),
      listTemplates: async () => [
        { id: "tpl_in", code: "incoming_control", name: "Входной контроль", description: null, isDocument: false },
        { id: "tpl_hy", code: "hygiene", name: "Гигиена", description: null, isDocument: true },
        { id: "tpl_acc", code: "accident_journal", name: "Аварии", description: null, isDocument: false },
      ],
      getTemplateTodaySummary: async (_orgId, templateId) => ({
        filled: templateId === "tpl_in",
        aperiodic: false,
        todayCount: templateId === "tpl_in" ? 1 : 0,
        expectedCount: 1,
        noActiveDocument: false,
        activeDocumentId: templateId === "tpl_hy" ? "doc_7" : null,
      }),
      saveDailyObligations: async (rows) => {
        writes.push(...rows);
        return rows;
      },
    }
  );

  assert.equal(obligations.length, 2);
  assert.deepEqual(
    writes.map((row) => [row.journalCode, row.status, row.targetPath]),
    [
      ["incoming_control", "done", "/mini/journals/incoming_control/new"],
      ["hygiene", "pending", "/mini/journals/hygiene"],
    ]
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --import tsx --test src/lib/journal-obligations.test.ts
```

Expected: FAIL because `syncDailyJournalObligationsForUser` does not exist yet.

- [ ] **Step 3: Add the schema and minimal implementation**

Add this Prisma model inside `prisma/schema.prisma` near `Notification` and `JournalTemplate`:

```prisma
model JournalObligation {
  id             String          @id @default(cuid())
  organizationId String
  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  templateId     String
  template       JournalTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  journalCode    String
  kind           String          @default("daily-journal")
  dateKey        DateTime
  status         String          @default("pending")
  targetPath     String
  source         String          @default("daily-journal-sync")
  dedupeKey      String
  openedAt       DateTime?
  completedAt    DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@unique([userId, dedupeKey])
  @@index([userId, dateKey, status])
  @@index([organizationId, dateKey, status])
}
```

Create `src/lib/journal-obligations.ts` around these signatures:

```ts
import { ALL_DAILY_JOURNAL_CODES } from "@/lib/daily-journal-codes";
import { resolveJournalObligationTargetPath } from "@/lib/journal-obligation-links";

export type ObligationTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDocument: boolean;
};

export type ObligationRow = {
  organizationId: string;
  userId: string;
  templateId: string;
  journalCode: string;
  kind: "daily-journal";
  dateKey: Date;
  status: "pending" | "done";
  targetPath: string;
  source: "daily-journal-sync";
  dedupeKey: string;
  completedAt: Date | null;
};

export type ObligationDeps = {
  getUserActor: (userId: string) => Promise<{ id: string; role: string; isRoot: boolean }>;
  getAllowedJournalCodes: (
    actor: { id: string; role: string; isRoot: boolean }
  ) => Promise<string[] | null>;
  getDisabledJournalCodes: (organizationId: string) => Promise<Set<string>>;
  listTemplates: () => Promise<ObligationTemplate[]>;
  getTemplateTodaySummary: (
    organizationId: string,
    templateId: string,
    templateCode: string,
    now: Date
  ) => Promise<{
    filled: boolean;
    aperiodic: boolean;
    todayCount: number;
    expectedCount: number;
    noActiveDocument: boolean;
    activeDocumentId: string | null;
  }>;
  saveDailyObligations: (rows: ObligationRow[]) => Promise<ObligationRow[]>;
  listOpenRows: (args: {
    userId: string;
    dateKey: Date;
  }) => Promise<
    Array<{
      id: string;
      journalCode: string;
      targetPath: string;
      template: { name: string; description: string | null };
    }>
  >;
  findObligationById: (
    id: string,
    userId: string
  ) => Promise<{ id: string; userId: string; targetPath: string; openedAt: Date | null } | null>;
  markOpened: (id: string, userId: string) => Promise<void>;
  listActiveStaffUsers: (
    organizationId: string
  ) => Promise<Array<{ id: string; organizationId: string }>>;
  listSummaryRows: (args: {
    organizationId: string;
    dateKey: Date;
  }) => Promise<Array<{ userId: string; status: "pending" | "done" }>>;
};

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function syncDailyJournalObligationsForUser(
  args: { userId: string; organizationId: string; now?: Date },
  overrides?: Partial<ObligationDeps>
) {
  const deps = { ...defaultDeps(), ...overrides };
  const now = args.now ?? new Date();
  const dateKey = utcDayStart(now);
  const actor = await deps.getUserActor(args.userId);
  const [allowedCodes, disabledCodes, templates] = await Promise.all([
    deps.getAllowedJournalCodes(actor),
    deps.getDisabledJournalCodes(args.organizationId),
    deps.listTemplates(),
  ]);

  const filtered = templates.filter((template) => {
    if (!ALL_DAILY_JOURNAL_CODES.has(template.code)) return false;
    if (disabledCodes.has(template.code)) return false;
    if (allowedCodes !== null && !allowedCodes.includes(template.code)) return false;
    return true;
  });

  const rows: ObligationRow[] = [];
  for (const template of filtered) {
    const summary = await deps.getTemplateTodaySummary(
      args.organizationId,
      template.id,
      template.code,
      now
    );
    rows.push({
      organizationId: args.organizationId,
      userId: args.userId,
      templateId: template.id,
      journalCode: template.code,
      kind: "daily-journal",
      dateKey,
      status: summary.filled ? "done" : "pending",
      targetPath: resolveJournalObligationTargetPath({
        journalCode: template.code,
        isDocument: template.isDocument,
        activeDocumentId: summary.activeDocumentId,
      }),
      source: "daily-journal-sync",
      dedupeKey: `daily:${dateKey.toISOString().slice(0, 10)}:${template.code}`,
      completedAt: summary.filled ? now : null,
    });
  }

  return deps.saveDailyObligations(rows);
}
```

The default dependency layer should call:

- `getAllowedJournalCodes`
- `getDisabledJournalCodes`
- `getTemplateTodaySummary`
- `isDocumentTemplate`
- Prisma `upsert` on `journalObligation`

Also add these query helpers in the same file:

```ts
export async function listOpenJournalObligationsForUser(
  userId: string,
  now = new Date(),
  overrides?: Partial<ObligationDeps>
) {
  const deps = { ...defaultDeps(), ...overrides };
  const dateKey = utcDayStart(now);
  return deps.listOpenRows({ userId, dateKey });
}

export async function getJournalObligationById(
  id: string,
  userId: string,
  overrides?: Partial<ObligationDeps>
) {
  const deps = { ...defaultDeps(), ...overrides };
  return deps.findObligationById(id, userId);
}

export async function markJournalObligationOpened(
  id: string,
  userId: string,
  overrides?: Partial<ObligationDeps>
) {
  const deps = { ...defaultDeps(), ...overrides };
  await deps.markOpened(id, userId);
}

export async function syncDailyJournalObligationsForOrganization(
  organizationId: string,
  now = new Date(),
  overrides?: Partial<ObligationDeps>
) {
  const deps = { ...defaultDeps(), ...overrides };
  const users = await deps.listActiveStaffUsers(organizationId);
  await Promise.all(
    users.map((user) =>
      syncDailyJournalObligationsForUser(
        { userId: user.id, organizationId: user.organizationId, now },
        overrides
      )
    )
  );
}

export async function getManagerObligationSummary(
  organizationId: string,
  now = new Date(),
  overrides?: Partial<ObligationDeps>
) {
  const deps = { ...defaultDeps(), ...overrides };
  const rows = await deps.listSummaryRows({
    organizationId,
    dateKey: utcDayStart(now),
  });
  const pending = rows.filter((row) => row.status === "pending").length;
  const done = rows.filter((row) => row.status === "done").length;
  return {
    total: rows.length,
    pending,
    done,
    employeesWithPending: new Set(
      rows.filter((row) => row.status === "pending").map((row) => row.userId)
    ).size,
  };
}
```

- [ ] **Step 4: Run migration and tests**

Run:

```powershell
npx prisma migrate dev --name add_journal_obligations
node --import tsx --test src/lib/journal-obligations.test.ts
```

Expected:

- Prisma migration completes successfully
- `journal-obligations.test.ts` passes

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts
git commit -m "feat(telegram-bot): add journal obligations"
```

### Task 3: Add the Mini App obligation redirect page

**Files:**
- Create: `src/app/mini/o/[id]/page.tsx`
- Modify: `src/lib/journal-obligations.ts`
- Test: `src/lib/journal-obligations.test.ts`

- [ ] **Step 1: Extend the test suite with the redirect lookup case**

```ts
test("getJournalObligationById returns only the caller-owned obligation", async () => {
  const obligation = await getJournalObligationById(
    "obl_1",
    "user_1",
    {
      findObligationById: async (id, userId) =>
        id === "obl_1" && userId === "user_1"
          ? {
              id: "obl_1",
              userId: "user_1",
              targetPath: "/mini/journals/hygiene",
              openedAt: null,
            }
          : null,
    }
  );

  assert.equal(obligation?.targetPath, "/mini/journals/hygiene");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --import tsx --test src/lib/journal-obligations.test.ts
```

Expected: FAIL because the lookup helper or injectable finder is missing.

- [ ] **Step 3: Implement the route**

Create `src/app/mini/o/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "@/lib/server-session";
import {
  getJournalObligationById,
  markJournalObligationOpened,
} from "@/lib/journal-obligations";

export default async function MiniObligationRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/mini");
  }

  const { id } = await params;
  const obligation = await getJournalObligationById(id, session.user.id);
  if (!obligation) {
    notFound();
  }

  await markJournalObligationOpened(id, session.user.id);
  redirect(obligation.targetPath);
}
```

Keep `markJournalObligationOpened` idempotent:

```ts
await db.journalObligation.updateMany({
  where: { id, userId, openedAt: null },
  data: { openedAt: new Date() },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --import tsx --test src/lib/journal-obligations.test.ts
```

Expected: PASS including the new lookup case.

- [ ] **Step 5: Commit**

```powershell
git add src/app/mini/o/[id]/page.tsx src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts
git commit -m "feat(telegram-bot): add obligation redirect"
```

### Task 4: Switch Mini App home to obligation-backed data

**Files:**
- Modify: `src/app/api/mini/home/route.ts`
- Modify: `src/app/mini/page.tsx`
- Modify: `src/lib/journal-obligations.ts`

- [ ] **Step 1: Write the failing test for the API-backed obligation list**

Add this case to `src/lib/journal-obligations.test.ts`:

```ts
test("listOpenJournalObligationsForUser returns pending obligations ordered by journal name", async () => {
  const rows = await listOpenJournalObligationsForUser("user_1", new Date("2026-04-20T09:00:00.000Z"), {
    listOpenRows: async () => [
      { id: "2", journalCode: "hygiene", targetPath: "/mini/journals/hygiene", template: { name: "Гигиена", description: "Смена" } },
      { id: "1", journalCode: "incoming_control", targetPath: "/mini/journals/incoming_control/new", template: { name: "Входной контроль", description: null } },
    ],
  });

  assert.deepEqual(rows.map((row) => row.id), ["2", "1"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --import tsx --test src/lib/journal-obligations.test.ts
```

Expected: FAIL because `listOpenJournalObligationsForUser` is not complete yet.

- [ ] **Step 3: Implement the API and page changes**

In `src/app/api/mini/home/route.ts`, replace the current "today = templates without today's entry" block with obligation sync + query:

```ts
import {
  listOpenJournalObligationsForUser,
  syncDailyJournalObligationsForUser,
  getManagerObligationSummary,
  syncDailyJournalObligationsForOrganization,
} from "@/lib/journal-obligations";
import { hasFullWorkspaceAccess } from "@/lib/role-access";

// after session + ACL resolution
const fullAccess = hasFullWorkspaceAccess({
  role: session.user.role,
  isRoot: session.user.isRoot === true,
});

if (fullAccess) {
  await syncDailyJournalObligationsForOrganization(session.user.organizationId);
  const summary = await getManagerObligationSummary(session.user.organizationId);
  return NextResponse.json({
    user: { name: session.user.name ?? "", organizationName: session.user.organizationName ?? "" },
    mode: "manager",
    summary,
    all: templates.map((t) => ({
      code: t.code,
      name: t.name,
      description: t.description,
      filled: false,
    })),
  });
}

await syncDailyJournalObligationsForUser({
  userId: session.user.id,
  organizationId: session.user.organizationId,
});
const now = await listOpenJournalObligationsForUser(session.user.id);

return NextResponse.json({
  user: { name: session.user.name ?? "", organizationName: session.user.organizationName ?? "" },
  mode: "staff",
  now: now.map((row) => ({
    id: row.id,
    code: row.journalCode,
    name: row.template.name,
    description: row.template.description,
    href: `/mini/o/${row.id}`,
  })),
  all: templates.map((t) => ({
    code: t.code,
    name: t.name,
    description: t.description,
    filled: !now.some((row) => row.journalCode === t.code),
  })),
});
```

In `src/app/mini/page.tsx`, update the payload types and top section rendering:

```ts
type StaffHomeData = {
  mode: "staff";
  user: { name: string; organizationName: string };
  now: Array<{ id: string; code: string; name: string; description: string | null; href: string }>;
  all: Array<{ code: string; name: string; description: string | null; filled: boolean }>;
};

type ManagerHomeData = {
  mode: "manager";
  user: { name: string; organizationName: string };
  summary: {
    total: number;
    pending: number;
    done: number;
    employeesWithPending: number;
  };
  all: Array<{ code: string; name: string; description: string | null; filled: boolean }>;
};

type HomeData = StaffHomeData | ManagerHomeData;
```

Render the staff top block from `home.now`:

```tsx
{home.mode === "staff" && home.now.length > 0 ? (
  <section className="space-y-2">
    <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
      На сейчас · {home.now.length}
    </h2>
    {home.now.map((item) => (
      <MiniCard
        key={item.id}
        href={item.href}
        title={item.name}
        subtitle={item.description}
        status={{ kind: "todo", label: "нужно заполнить" }}
      />
    ))}
  </section>
) : null}
```

Render the manager summary card above the journal list:

```tsx
{home.mode === "manager" ? (
  <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
    <h2 className="text-[15px] font-semibold text-slate-900">Сводка на сегодня</h2>
    <p className="mt-1 text-[13px] text-slate-500">
      Открыто: {home.summary.pending} · Выполнено: {home.summary.done}
    </p>
    <p className="mt-0.5 text-[13px] text-slate-500">
      Сотрудников с открытыми задачами: {home.summary.employeesWithPending}
    </p>
  </section>
) : null}
```

- [ ] **Step 4: Run tests and a targeted type-check**

Run:

```powershell
node --import tsx --test src/lib/journal-obligations.test.ts
npx tsc --noEmit --pretty false
```

Expected: PASS for the tests and no TypeScript errors.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/mini/home/route.ts src/app/mini/page.tsx src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts
git commit -m "feat(telegram-bot): back mini home with obligations"
```

### Task 5: Add a role-aware `/start` home service

**Files:**
- Create: `src/lib/bot/start-home.ts`
- Test: `src/lib/bot/start-home.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { loadTelegramStartHome } from "@/lib/bot/start-home";

test("loadTelegramStartHome gives staff the next open obligation url", async () => {
  const home = await loadTelegramStartHome(
    { chatId: "777", miniAppBaseUrl: "https://wesetup.ru/mini" },
    {
      findLinkedUserByChatId: async () => ({
        id: "user_1",
        name: "Иван",
        role: "cook",
        isRoot: false,
        organizationId: "org_1",
      }),
      syncDailyJournalObligationsForUser: async () => undefined,
      listOpenJournalObligationsForUser: async () => [
        {
          id: "obl_1",
          journalCode: "incoming_control",
          targetPath: "/mini/journals/incoming_control/new",
          template: { name: "Входной контроль", description: null },
        },
      ],
      syncDailyJournalObligationsForOrganization: async () => undefined,
      getManagerObligationSummary: async () => ({
        total: 0,
        pending: 0,
        done: 0,
        employeesWithPending: 0,
      }),
    }
  );

  assert.equal(home.kind, "staff");
  if (home.kind !== "staff") throw new Error("expected staff");
  assert.equal(home.buttonUrl, "https://wesetup.ru/mini/o/obl_1");
  assert.equal(home.nextAction?.label, "Входной контроль");
});

test("loadTelegramStartHome gives managers a summary instead of a task link", async () => {
  const home = await loadTelegramStartHome(
    { chatId: "888", miniAppBaseUrl: "https://wesetup.ru/mini" },
    {
      findLinkedUserByChatId: async () => ({
        id: "user_2",
        name: "Ольга",
        role: "manager",
        isRoot: false,
        organizationId: "org_1",
      }),
      syncDailyJournalObligationsForUser: async () => undefined,
      listOpenJournalObligationsForUser: async () => [],
      syncDailyJournalObligationsForOrganization: async () => undefined,
      getManagerObligationSummary: async () => ({
        total: 10,
        pending: 4,
        done: 6,
        employeesWithPending: 2,
      }),
    }
  );

  assert.equal(home.kind, "manager");
  if (home.kind !== "manager") throw new Error("expected manager");
  assert.equal(home.summary.pending, 4);
  assert.equal(home.buttonUrl, "https://wesetup.ru/mini");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --import tsx --test src/lib/bot/start-home.test.ts
```

Expected: FAIL because `start-home.ts` does not exist yet.

- [ ] **Step 3: Implement the home-loader**

Create `src/lib/bot/start-home.ts`:

```ts
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { buildMiniObligationEntryUrl } from "@/lib/journal-obligation-links";
import {
  getManagerObligationSummary,
  listOpenJournalObligationsForUser,
  syncDailyJournalObligationsForOrganization,
  syncDailyJournalObligationsForUser,
} from "@/lib/journal-obligations";
import { db } from "@/lib/db";

type StartHomeDeps = {
  findLinkedUserByChatId: (chatId: string) => Promise<{
    id: string;
    name: string;
    role: string;
    isRoot: boolean;
    organizationId: string;
  } | null>;
  syncDailyJournalObligationsForUser: typeof syncDailyJournalObligationsForUser;
  listOpenJournalObligationsForUser: typeof listOpenJournalObligationsForUser;
  syncDailyJournalObligationsForOrganization: typeof syncDailyJournalObligationsForOrganization;
  getManagerObligationSummary: typeof getManagerObligationSummary;
};

export type TelegramStartHome =
  | { kind: "unlinked" }
  | {
      kind: "staff";
      actor: { name: string; role: string; isRoot: boolean };
      nextAction: { label: string; journalCode: string } | null;
      buttonUrl: string;
    }
  | {
      kind: "manager";
      actor: { name: string; role: string; isRoot: boolean };
      summary: { total: number; pending: number; done: number; employeesWithPending: number };
      buttonUrl: string;
    };

export async function loadTelegramStartHome(
  args: { chatId: string; miniAppBaseUrl: string | null },
  overrides?: Partial<StartHomeDeps>
): Promise<TelegramStartHome> {
  const deps = { ...defaultDeps(), ...overrides };
  const user = await deps.findLinkedUserByChatId(args.chatId);
  if (!user) return { kind: "unlinked" };

  const actor = { name: user.name, role: user.role, isRoot: user.isRoot === true };
  const miniAppBaseUrl = args.miniAppBaseUrl;

  if (hasFullWorkspaceAccess(actor)) {
    await deps.syncDailyJournalObligationsForOrganization(user.organizationId);
    return {
      kind: "manager",
      actor,
      summary: await deps.getManagerObligationSummary(user.organizationId),
      buttonUrl: miniAppBaseUrl ?? "",
    };
  }

  await deps.syncDailyJournalObligationsForUser({
    userId: user.id,
    organizationId: user.organizationId,
  });
  const open = await deps.listOpenJournalObligationsForUser(user.id);
  const next = open[0] ?? null;

  return {
    kind: "staff",
    actor,
    nextAction: next
      ? { label: next.template.name, journalCode: next.journalCode }
      : null,
    buttonUrl:
      next && miniAppBaseUrl
        ? buildMiniObligationEntryUrl(miniAppBaseUrl, next.id)
        : (miniAppBaseUrl ?? ""),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --import tsx --test src/lib/bot/start-home.test.ts
```

Expected: PASS for both staff and manager cases.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bot/start-home.ts src/lib/bot/start-home.test.ts
git commit -m "feat(telegram-bot): add start home loader"
```

### Task 6: Make `/start` reply builders and handler obligation-aware

**Files:**
- Modify: `src/lib/bot/start-response.ts`
- Modify: `src/lib/bot/start-response.test.ts`
- Modify: `src/lib/bot/handlers/start.ts`

- [ ] **Step 1: Extend the failing tests**

Append these cases to `src/lib/bot/start-response.test.ts`:

```ts
test("buildTelegramLinkedStartReply mentions the next action for staff", () => {
  const reply = buildTelegramLinkedStartReply(
    {
      name: "Иван",
      role: "cook",
      isRoot: false,
      kind: "staff",
      nextActionLabel: "Входной контроль",
    },
    "https://wesetup.ru/mini/o/obl_1"
  );

  assert.match(reply.text, /Следующее действие: Входной контроль/);
  assert.equal(reply.buttonLabel, "Открыть задачу");
});

test("buildTelegramLinkedStartReply includes a manager summary", () => {
  const reply = buildTelegramLinkedStartReply(
    {
      name: "Ольга",
      role: "manager",
      isRoot: false,
      kind: "manager",
      pendingCount: 4,
      employeesWithPending: 2,
    },
    "https://wesetup.ru/mini"
  );

  assert.match(reply.text, /Открыто задач: 4/);
  assert.match(reply.text, /Сотрудников с открытыми задачами: 2/);
  assert.equal(reply.buttonLabel, "Открыть кабинет");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --import tsx --test src/lib/bot/start-response.test.ts
```

Expected: FAIL because the reply-builder input shape and copy are outdated.

- [ ] **Step 3: Update the reply builder and handler**

In `src/lib/bot/start-response.ts`, replace the narrow actor-only builder input with a phase-1 start payload:

```ts
export type TelegramLinkedStartState =
  | {
      name: string;
      role: string;
      isRoot: boolean;
      kind: "staff";
      nextActionLabel: string | null;
    }
  | {
      name: string;
      role: string;
      isRoot: boolean;
      kind: "manager";
      pendingCount: number;
      employeesWithPending: number;
    };

export function buildTelegramLinkedStartReply(
  state: TelegramLinkedStartState,
  buttonUrl: string | null
): TelegramStartReply {
  if (!buttonUrl) {
    return {
      text: `Готово, ${state.name}. Мини-приложение пока не настроено, свяжитесь с руководителем.`,
    };
  }

  if (state.kind === "manager") {
    return {
      text:
        `Здравствуйте, ${state.name}.\n\n` +
        `Открыто задач: ${state.pendingCount}\n` +
        `Сотрудников с открытыми задачами: ${state.employeesWithPending}\n\n` +
        `Откройте Wesetup кнопкой ниже.`,
      buttonLabel: "Открыть кабинет",
      buttonUrl,
    };
  }

  return {
    text:
      `Готово, ${state.name}!\n\n` +
      (state.nextActionLabel
        ? `Следующее действие: ${state.nextActionLabel}\n\n`
        : `На сегодня обязательные журналы уже закрыты.\n\n`) +
      `Откройте Wesetup кнопкой ниже.`,
    buttonLabel: state.nextActionLabel ? "Открыть задачу" : "Открыть журналы",
    buttonUrl,
  };
}
```

In `src/lib/bot/handlers/start.ts`, load the new start-home state on empty `/start`:

```ts
import { loadTelegramStartHome } from "@/lib/bot/start-home";

// inside the `if (!payload)` branch
const home = await loadTelegramStartHome({
  chatId: String(fromId),
  miniAppBaseUrl: getMiniAppBaseUrl(),
});

if (home.kind === "unlinked") {
  await ctx.reply(buildTelegramUnlinkedStartReply().text);
  return;
}

if (home.kind === "manager") {
  await replyWithLinkedStart(ctx, {
    name: home.actor.name,
    role: home.actor.role,
    isRoot: home.actor.isRoot,
    kind: "manager",
    pendingCount: home.summary.pending,
    employeesWithPending: home.summary.employeesWithPending,
  }, home.buttonUrl || getMiniAppBaseUrl());
  return;
}

await replyWithLinkedStart(ctx, {
  name: home.actor.name,
  role: home.actor.role,
  isRoot: home.actor.isRoot,
  kind: "staff",
  nextActionLabel: home.nextAction?.label ?? null,
}, home.buttonUrl || getMiniAppBaseUrl());
```

Keep the invite-token branch unchanged except for calling the updated reply builder after successful bind.

- [ ] **Step 4: Run tests**

Run:

```powershell
node --import tsx --test src/lib/bot/start-home.test.ts src/lib/bot/start-response.test.ts
```

Expected: PASS for all start-home and start-response tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bot/start-response.ts src/lib/bot/start-response.test.ts src/lib/bot/handlers/start.ts src/lib/bot/start-home.ts src/lib/bot/start-home.test.ts
git commit -m "feat(telegram-bot): make start obligation-aware"
```

### Task 7: Run full verification for Phase 1 and update the roadmap artifacts

**Files:**
- Modify: `.agent/tasks/telegram-bot-ux-roadmap-2026-04-20/evidence.md`
- Modify: `.agent/tasks/telegram-bot-ux-roadmap-2026-04-20/evidence.json`
- Create if needed: `.agent/tasks/telegram-bot-ux-roadmap-2026-04-20/problems.md`

- [ ] **Step 1: Run the focused verification suite**

Run:

```powershell
node --import tsx --test src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.test.ts
npm run lint -- src/lib/journal-obligation-links.ts src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.ts src/lib/bot/start-response.test.ts src/lib/bot/handlers/start.ts src/app/api/mini/home/route.ts src/app/mini/page.tsx src/app/mini/o/[id]/page.tsx
npx tsc --noEmit --pretty false
npm run build
```

Expected:

- all node tests PASS
- targeted lint PASS
- TypeScript PASS
- production build PASS

- [ ] **Step 2: Record evidence**

Write `.agent/tasks/telegram-bot-ux-roadmap-2026-04-20/evidence.md` with:

```md
# Evidence

- Command: `node --import tsx --test ...`
  - Result: PASS
- Command: `npm run lint -- ...`
  - Result: PASS
- Command: `npx tsc --noEmit --pretty false`
  - Result: PASS
- Command: `npm run build`
  - Result: PASS

## AC Status

- AC1: PASS — `JournalObligation` added and synced
- AC2: PASS — staff `/start` shows next-action CTA
- AC3: PASS — manager `/start` shows summary
- AC4: PASS — Telegram button enters `/mini/o/[id]` and redirects to the obligation target
- AC6: PASS — Mini App home consumes obligations
- AC7: PASS — ACL helpers reused
- AC8: PASS — invite and bind flow preserved
```

Write `.agent/tasks/telegram-bot-ux-roadmap-2026-04-20/evidence.json` with:

```json
{
  "taskId": "telegram-bot-ux-roadmap-2026-04-20",
  "phase": "phase1",
  "commands": [
    "node --import tsx --test src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.test.ts",
    "npm run lint -- src/lib/journal-obligation-links.ts src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.ts src/lib/bot/start-response.test.ts src/lib/bot/handlers/start.ts src/app/api/mini/home/route.ts src/app/mini/page.tsx src/app/mini/o/[id]/page.tsx",
    "npx tsc --noEmit --pretty false",
    "npm run build"
  ],
  "acceptanceCriteria": {
    "AC1": "PASS",
    "AC2": "PASS",
    "AC3": "PASS",
    "AC4": "PASS",
    "AC6": "PASS",
    "AC7": "PASS",
    "AC8": "PASS"
  }
}
```

If any command fails, write `.agent/tasks/telegram-bot-ux-roadmap-2026-04-20/problems.md` with the exact failing command, raw error, and the smallest safe follow-up fix.

- [ ] **Step 3: Commit**

```powershell
git add .agent/tasks/telegram-bot-ux-roadmap-2026-04-20
git commit -m "docs(telegram-bot): record phase1 evidence"
```

## Self-Review

### Spec coverage

- AC1 is implemented by Task 2.
- AC2 is implemented by Tasks 5 and 6.
- AC3 is implemented by Tasks 4, 5, and 6.
- AC4 is implemented by Tasks 1 and 3.
- AC6 is implemented by Task 4.
- AC7 is preserved by Task 2 reusing journal ACL and Task 6 reusing role-access helpers.
- AC8 is preserved by Task 6 keeping the invite-token branch intact.

Deferred roadmap items intentionally excluded from this plan:

- manager digest cron
- reminder cooldown policy
- employee completion confirmations
- row-level document obligations

### Placeholder scan

- No `TBD`, `TODO`, or “implement later” placeholders remain.
- Every task lists exact files and commands.
- Every code-changing step includes concrete code.

### Type consistency

- `JournalObligation` uses one status vocabulary in the plan: `pending | done`.
- Telegram start-state names stay consistent across `start-home.ts`, `start-response.ts`, and `start.ts`.
- Mini App target paths use one convention: `/mini/o/<id>` -> redirect -> concrete target path.

## Follow-On Plan After This One

Create a second plan for:

- manager digest cron
- reminder cooldown and dedupe policy using richer Telegram log metadata
- completion confirmations after form and document submissions
- document-row-level obligations
