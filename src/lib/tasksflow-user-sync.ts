import { normalizeRussianPhone } from "@/lib/tasksflow-client";

export type SyncTasksflowUserInput = {
  name?: string;
  phone: string;
};

type WeSetupSyncUser = {
  id: string;
  name: string | null;
  phone: string | null;
  role: string | null;
};

type ExistingSyncLink = {
  wesetupUserId: string;
  source: string;
};

type RemoteSyncUser = {
  id: number;
  name: string | null;
  phone: string;
};

type UpsertSyncLinkInput = {
  integrationId: string;
  wesetupUserId: string;
  phone: string;
  tasksflowUserId: number;
  tasksflowWorkerId: number;
  source: "auto";
};

export async function syncTasksflowUsers(args: {
  integrationId: string;
  wesetupUsers: WeSetupSyncUser[];
  existingLinks: ExistingSyncLink[];
  remoteUsers: RemoteSyncUser[];
  createRemoteUser: (
    input: SyncTasksflowUserInput
  ) => Promise<RemoteSyncUser>;
  upsertLink: (input: UpsertSyncLinkInput) => Promise<void>;
}): Promise<{
  totals: {
    wesetupUsers: number;
    remoteUsers: number;
    linked: number;
    createdRemote: number;
    withoutPhone: number;
    withoutMatch: number;
    manualSkipped: number;
  };
}> {
  const remoteByPhone = new Map<string, RemoteSyncUser>();
  for (const user of args.remoteUsers) {
    const normalized = normalizeRussianPhone(user.phone);
    if (!normalized || remoteByPhone.has(normalized)) continue;
    remoteByPhone.set(normalized, {
      id: user.id,
      name: user.name ?? null,
      phone: normalized,
    });
  }

  const existingByUser = new Map(
    args.existingLinks.map((link) => [link.wesetupUserId, link])
  );

  let linked = 0;
  let createdRemote = 0;
  let withoutPhone = 0;
  let withoutMatch = 0;
  let manualSkipped = 0;

  for (const user of args.wesetupUsers) {
    const phone = normalizeRussianPhone(user.phone);
    if (!phone) {
      withoutPhone += 1;
      continue;
    }

    const existing = existingByUser.get(user.id);
    if (existing?.source === "manual") {
      manualSkipped += 1;
      continue;
    }

    let remote = remoteByPhone.get(phone) ?? null;
    if (!remote) {
      const nextRemote = await args.createRemoteUser({
        name: user.name?.trim() || undefined,
        phone,
      });
      remote = {
        id: nextRemote.id,
        name: nextRemote.name ?? null,
        phone: normalizeRussianPhone(nextRemote.phone) ?? phone,
      };
      remoteByPhone.set(phone, remote);
      createdRemote += 1;
    }

    if (!remote) {
      withoutMatch += 1;
      continue;
    }

    await args.upsertLink({
      integrationId: args.integrationId,
      wesetupUserId: user.id,
      phone,
      tasksflowUserId: remote.id,
      tasksflowWorkerId: remote.id,
      source: "auto",
    });
    linked += 1;
  }

  return {
    totals: {
      wesetupUsers: args.wesetupUsers.length,
      remoteUsers: args.remoteUsers.length,
      linked,
      createdRemote,
      withoutPhone,
      withoutMatch,
      manualSkipped,
    },
  };
}
