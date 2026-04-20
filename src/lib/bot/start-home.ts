import { db } from "@/lib/db";
import { buildMiniObligationEntryUrl } from "@/lib/journal-obligation-links";
import {
  getManagerObligationSummary,
  listOpenJournalObligationsForUser,
  syncDailyJournalObligationsForOrganization,
  syncDailyJournalObligationsForUser,
  type OpenJournalObligation,
} from "@/lib/journal-obligations";
import { hasFullWorkspaceAccess } from "@/lib/role-access";

type LinkedTelegramUser = {
  id: string;
  name: string;
  role: string;
  isRoot: boolean;
  organizationId: string;
};

type ManagerSummary = Awaited<
  ReturnType<typeof getManagerObligationSummary>
>;

type StartHomeDeps = {
  findLinkedUserByChatId: (
    chatId: string
  ) => Promise<LinkedTelegramUser | null>;
  syncDailyJournalObligationsForUser: typeof syncDailyJournalObligationsForUser;
  listOpenJournalObligationsForUser: typeof listOpenJournalObligationsForUser;
  syncDailyJournalObligationsForOrganization: typeof syncDailyJournalObligationsForOrganization;
  getManagerObligationSummary: typeof getManagerObligationSummary;
};

type StartHomeActor = {
  name: string;
  role: string;
  isRoot: boolean;
};

type StartHomeStaffAction = Pick<OpenJournalObligation, "journalCode"> & {
  label: string;
};

export type TelegramStartHome =
  | { kind: "unlinked" }
  | {
      kind: "staff";
      actor: StartHomeActor;
      nextAction: StartHomeStaffAction | null;
      buttonUrl: string | null;
    }
  | {
      kind: "manager";
      actor: StartHomeActor;
      summary: ManagerSummary;
      buttonUrl: string | null;
    };

function createDefaultDeps(): StartHomeDeps {
  return {
    async findLinkedUserByChatId(chatId) {
      return db.user.findFirst({
        where: {
          telegramChatId: chatId,
          isActive: true,
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          role: true,
          isRoot: true,
          organizationId: true,
        },
      });
    },
    syncDailyJournalObligationsForUser,
    listOpenJournalObligationsForUser,
    syncDailyJournalObligationsForOrganization,
    getManagerObligationSummary,
  };
}

function resolveDeps(overrides?: Partial<StartHomeDeps>): StartHomeDeps {
  return {
    ...createDefaultDeps(),
    ...overrides,
  };
}

function toActor(user: LinkedTelegramUser): StartHomeActor {
  return {
    name: user.name,
    role: user.role,
    isRoot: user.isRoot === true,
  };
}

function resolveStaffButtonUrl(
  miniAppBaseUrl: string | null,
  nextAction: OpenJournalObligation | null
): string | null {
  if (!miniAppBaseUrl) {
    return null;
  }

  if (!nextAction) {
    return miniAppBaseUrl;
  }

  return buildMiniObligationEntryUrl(miniAppBaseUrl, nextAction.id);
}

export async function loadTelegramStartHome(
  args: { chatId: string; miniAppBaseUrl: string | null },
  overrides?: Partial<StartHomeDeps>
): Promise<TelegramStartHome> {
  const deps = resolveDeps(overrides);
  const user = await deps.findLinkedUserByChatId(args.chatId);
  if (!user) {
    return { kind: "unlinked" };
  }

  const actor = toActor(user);
  const requestNow = new Date();

  if (hasFullWorkspaceAccess(actor)) {
    await deps.syncDailyJournalObligationsForOrganization(
      user.organizationId,
      requestNow
    );

    return {
      kind: "manager",
      actor,
      summary: await deps.getManagerObligationSummary(
        user.organizationId,
        requestNow
      ),
      buttonUrl: args.miniAppBaseUrl,
    };
  }

  await deps.syncDailyJournalObligationsForUser({
    userId: user.id,
    organizationId: user.organizationId,
    now: requestNow,
  });
  const nextAction =
    (await deps.listOpenJournalObligationsForUser(user.id, requestNow))[0] ??
    null;

  return {
    kind: "staff",
    actor,
    nextAction: nextAction
      ? {
          label: nextAction.template.name,
          journalCode: nextAction.journalCode,
        }
      : null,
    buttonUrl: resolveStaffButtonUrl(args.miniAppBaseUrl, nextAction),
  };
}
