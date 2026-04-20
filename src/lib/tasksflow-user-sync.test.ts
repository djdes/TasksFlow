import assert from "node:assert/strict";
import test from "node:test";

import {
  type SyncTasksflowUserInput,
  syncTasksflowUsers,
} from "@/lib/tasksflow-user-sync";

test("syncTasksflowUsers reuses an existing remote user matched by phone", async () => {
  const createdRemote: SyncTasksflowUserInput[] = [];
  const upserts: Array<Record<string, unknown>> = [];

  const result = await syncTasksflowUsers({
    integrationId: "int-1",
    wesetupUsers: [
      {
        id: "user-1",
        name: "Иван",
        phone: "8 (999) 000-11-22",
        role: "cook",
      },
    ],
    existingLinks: [],
    remoteUsers: [
      {
        id: 17,
        name: "Иван",
        phone: "+79990001122",
      },
    ],
    createRemoteUser: async (input) => {
      createdRemote.push(input);
      return {
        id: 99,
        name: input.name ?? null,
        phone: input.phone,
      };
    },
    upsertLink: async (link) => {
      upserts.push(link);
    },
  });

  assert.equal(createdRemote.length, 0);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0]?.tasksflowUserId, 17);
  assert.equal(upserts[0]?.tasksflowWorkerId, 17);
  assert.equal(result.totals.linked, 1);
  assert.equal(result.totals.createdRemote, 0);
  assert.equal(result.totals.withoutMatch, 0);
});

test("syncTasksflowUsers creates a missing remote user and links it", async () => {
  const createdRemote: SyncTasksflowUserInput[] = [];
  const upserts: Array<Record<string, unknown>> = [];

  const result = await syncTasksflowUsers({
    integrationId: "int-1",
    wesetupUsers: [
      {
        id: "user-2",
        name: "Мария",
        phone: "+7 911 222-33-44",
        role: "waiter",
      },
    ],
    existingLinks: [],
    remoteUsers: [],
    createRemoteUser: async (input) => {
      createdRemote.push(input);
      return {
        id: 51,
        name: input.name ?? null,
        phone: input.phone,
      };
    },
    upsertLink: async (link) => {
      upserts.push(link);
    },
  });

  assert.deepEqual(createdRemote, [
    {
      name: "Мария",
      phone: "+79112223344",
    },
  ]);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0]?.tasksflowUserId, 51);
  assert.equal(result.totals.linked, 1);
  assert.equal(result.totals.createdRemote, 1);
  assert.equal(result.totals.withoutMatch, 0);
});

test("syncTasksflowUsers keeps manual links untouched and counts invalid phones", async () => {
  const createdRemote: SyncTasksflowUserInput[] = [];
  const upserts: Array<Record<string, unknown>> = [];

  const result = await syncTasksflowUsers({
    integrationId: "int-1",
    wesetupUsers: [
      {
        id: "user-3",
        name: "Ручная привязка",
        phone: "+7 922 000-00-01",
        role: "manager",
      },
      {
        id: "user-4",
        name: "Без телефона",
        phone: null,
        role: "cook",
      },
    ],
    existingLinks: [
      {
        wesetupUserId: "user-3",
        source: "manual",
      },
    ],
    remoteUsers: [],
    createRemoteUser: async (input) => {
      createdRemote.push(input);
      return {
        id: 77,
        name: input.name ?? null,
        phone: input.phone,
      };
    },
    upsertLink: async (link) => {
      upserts.push(link);
    },
  });

  assert.equal(createdRemote.length, 0);
  assert.equal(upserts.length, 0);
  assert.equal(result.totals.manualSkipped, 1);
  assert.equal(result.totals.withoutPhone, 1);
  assert.equal(result.totals.linked, 0);
});
