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

export type SyncFailure = {
  wesetupUserId: string;
  name: string | null;
  phone: string;
  reason:
    | "remote_create_failed"
    | "remote_create_forbidden"
    | "phone_invalid";
  message: string;
  httpStatus?: number;
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
  failures: SyncFailure[];
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
  const failures: SyncFailure[] = [];

  // Как только TasksFlow отказывает «в принципе» (403 на Bearer-ключ, 404
  // на endpoint) — дальнейшие попытки create бессмысленны и только
  // тратят время. Помечаем флаг и пропускаем остальных.
  let remoteCreateDisabled: { status: number; message: string } | null = null;

  for (const user of args.wesetupUsers) {
    const phone = normalizeRussianPhone(user.phone);
    if (!phone) {
      withoutPhone += 1;
      if (user.phone && user.phone.trim().length > 0) {
        failures.push({
          wesetupUserId: user.id,
          name: user.name ?? null,
          phone: user.phone,
          reason: "phone_invalid",
          message:
            "Телефон не в формате +7… — TasksFlow не сможет его принять",
        });
      }
      continue;
    }

    const existing = existingByUser.get(user.id);
    if (existing?.source === "manual") {
      manualSkipped += 1;
      continue;
    }

    let remote = remoteByPhone.get(phone) ?? null;
    if (!remote && !remoteCreateDisabled) {
      let nextRemote: RemoteSyncUser | null = null;
      try {
        nextRemote = await args.createRemoteUser({
          name: user.name?.trim() || undefined,
          phone,
        });
      } catch (err) {
        const status = extractHttpStatus(err);
        const message = err instanceof Error ? err.message : String(err);
        const isGlobalBlock =
          status === 401 ||
          status === 403 ||
          status === 404 ||
          status === 405;
        failures.push({
          wesetupUserId: user.id,
          name: user.name ?? null,
          phone,
          reason: isGlobalBlock
            ? "remote_create_forbidden"
            : "remote_create_failed",
          message,
          httpStatus: status,
        });
        if (isGlobalBlock) {
          remoteCreateDisabled = { status: status ?? 0, message };
        }
      }
      if (nextRemote) {
        remote = {
          id: nextRemote.id,
          name: nextRemote.name ?? null,
          phone: normalizeRussianPhone(nextRemote.phone) ?? phone,
        };
        remoteByPhone.set(phone, remote);
        createdRemote += 1;
      }
    } else if (!remote && remoteCreateDisabled) {
      // Не вызываем API, но всё равно сообщаем UI что пользователь не
      // связан именно потому, что TF отказывается создавать через ключ.
      failures.push({
        wesetupUserId: user.id,
        name: user.name ?? null,
        phone,
        reason: "remote_create_forbidden",
        message: remoteCreateDisabled.message,
        httpStatus: remoteCreateDisabled.status || undefined,
      });
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
    failures,
  };
}

function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const candidate = (err as { status?: unknown; httpStatus?: unknown }).status
    ?? (err as { httpStatus?: unknown }).httpStatus;
  return typeof candidate === "number" ? candidate : undefined;
}
