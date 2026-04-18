import { db } from "@/lib/db";

type StaffTelegramEmployee = {
  id: string;
  name: string;
  organizationId: string;
  archivedAt: Date | null;
  telegramChatId: string | null;
};

type StaffTelegramManagementDeps = {
  findEmployeeById: (args: {
    employeeId: string;
    organizationId: string;
  }) => Promise<StaffTelegramEmployee | null>;
  clearTelegramLink: (args: {
    employeeId: string;
    organizationId: string;
  }) => Promise<void>;
  deleteInviteToken: (args: { employeeId: string }) => Promise<void>;
  dismissInviteNotification: (args: { employeeId: string }) => Promise<void>;
};

export class StaffTelegramManagementError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StaffTelegramManagementError";
    this.status = status;
  }
}

function defaultDeps(): StaffTelegramManagementDeps {
  return {
    async findEmployeeById({ employeeId, organizationId }) {
      return db.user.findFirst({
        where: { id: employeeId, organizationId },
        select: {
          id: true,
          name: true,
          organizationId: true,
          archivedAt: true,
          telegramChatId: true,
        },
      });
    },
    async clearTelegramLink({ employeeId, organizationId }) {
      await db.user.updateMany({
        where: { id: employeeId, organizationId },
        data: { telegramChatId: null },
      });
    },
    async deleteInviteToken({ employeeId }) {
      await db.botInviteToken.deleteMany({ where: { userId: employeeId } });
    },
    async dismissInviteNotification({ employeeId }) {
      await db.notification.deleteMany({
        where: {
          userId: employeeId,
          kind: "staff.telegram-invite",
        },
      });
    },
  };
}

export async function unlinkStaffTelegram(
  args: {
    employeeId: string;
    organizationId: string;
  },
  overrides?: Partial<StaffTelegramManagementDeps>
) {
  const deps = { ...defaultDeps(), ...overrides };
  const target = await deps.findEmployeeById({
    employeeId: args.employeeId,
    organizationId: args.organizationId,
  });

  if (!target) {
    throw new StaffTelegramManagementError("Сотрудник не найден", 404);
  }

  await deps.clearTelegramLink({
    employeeId: target.id,
    organizationId: args.organizationId,
  });
  await deps.deleteInviteToken({ employeeId: target.id });
  await deps.dismissInviteNotification({ employeeId: target.id });

  return {
    user: {
      id: target.id,
      name: target.name,
      telegramLinked: false,
    },
  };
}
