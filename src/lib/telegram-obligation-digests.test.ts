import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManagerObligationDigest,
  buildStaffObligationDigest,
} from "@/lib/telegram-obligation-digests";

test("buildStaffObligationDigest returns null when there are no open obligations", () => {
  const digest = buildStaffObligationDigest({
    userId: "user_1",
    staffName: "Ivan",
    openObligations: [],
    miniAppBaseUrl: "https://wesetup.ru/mini",
    now: new Date("2026-04-20T06:30:00.000Z"),
  });

  assert.equal(digest, null);
});

test("buildStaffObligationDigest builds a morning payload with the next exact action CTA and daily dedupe key", () => {
  const digest = buildStaffObligationDigest({
    userId: "user_1",
    staffName: "Ivan",
    openObligations: [
      {
        id: "obl_1",
        journalCode: "incoming_control",
        targetPath: "/mini/journals/incoming_control/new",
        template: { name: "Входной контроль", description: null },
      },
      {
        id: "obl_2",
        journalCode: "hygiene",
        targetPath: "/mini/journals/hygiene",
        template: { name: "Журнал гигиены", description: "Смена" },
      },
    ],
    miniAppBaseUrl: "https://wesetup.ru/mini",
    now: new Date("2026-04-20T06:30:00.000Z"),
  });

  assert.ok(digest);
  assert.equal(digest?.kind, "staff");
  assert.equal(digest?.dedupeKey, "telegram-digest:staff:2026-04-20:user_1");
  assert.equal(digest?.openCount, 2);
  assert.equal(digest?.nextObligationId, "obl_1");
  assert.deepEqual(digest?.primaryCta, {
    kind: "obligation",
    label: "Открыть задачу",
    url: "https://wesetup.ru/mini/o/obl_1",
  });
  assert.match(digest?.body ?? "", /Доброе утро, Ivan!/);
  assert.match(digest?.body ?? "", /Открыто задач: 2/);
  assert.match(digest?.body ?? "", /Следующее действие: Входной контроль/);
  assert.match(digest?.body ?? "", /• Входной контроль/);
  assert.match(digest?.body ?? "", /• Журнал гигиены/);
});

test("buildManagerObligationDigest builds a summary payload with cabinet CTA and organization-scoped daily dedupe key", () => {
  const digest = buildManagerObligationDigest({
    organizationId: "org_1",
    organizationName: "Kitchen 21",
    summary: {
      total: 10,
      pending: 4,
      done: 6,
      employeesWithPending: 2,
    },
    cabinetUrl: "https://wesetup.ru/mini",
    now: new Date("2026-04-20T06:30:00.000Z"),
  });

  assert.equal(digest.kind, "manager");
  assert.equal(digest.dedupeKey, "telegram-digest:manager:2026-04-20:org_1");
  assert.deepEqual(digest.primaryCta, {
    kind: "cabinet",
    label: "Открыть кабинет",
    url: "https://wesetup.ru/mini",
  });
  assert.deepEqual(digest.summary, {
    total: 10,
    pending: 4,
    done: 6,
    employeesWithPending: 2,
  });
  assert.match(digest.body, /Доброе утро, Kitchen 21!/);
  assert.match(digest.body, /Открыто: 4 · Выполнено: 6/);
  assert.match(digest.body, /Сотрудников с открытыми задачами: 2/);
});
