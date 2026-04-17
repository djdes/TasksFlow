import Link from "next/link";
import {
  ArrowLeft,
  KeyRound,
  Mail,
  Phone,
  User,
  Users,
} from "lucide-react";
import { requireAuth, getActiveOrgId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { InviteUserDialog } from "@/components/settings/invite-user-dialog";
import { EditUserDialog } from "@/components/settings/edit-user-dialog";
import { DeleteButton } from "@/components/settings/delete-button";
import { getUserDisplayTitle, isManagerRole } from "@/lib/user-roles";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  const session = await requireAuth();
  const orgId = getActiveOrgId(session);

  const users = await db.user.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      positionTitle: true,
      isActive: true,
      phone: true,
      telegramChatId: true,
    },
  });

  const isManager = isManagerRole(session.user.role);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/settings"
            className="mb-3 inline-flex items-center gap-2 text-[14px] text-[#6f7282] hover:text-[#0b1024]"
          >
            <ArrowLeft className="size-4" />
            Настройки
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#e8f7ff] text-[#0ea5e9]">
              <Users className="size-5" />
            </div>
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#0b1024]">
                Сотрудники
              </h1>
              <p className="mt-0.5 text-[14px] text-[#6f7282]">
                Приглашения, роли, доступ к журналам
              </p>
            </div>
          </div>
        </div>
        {isManager && <InviteUserDialog />}
      </div>

      {/* Content */}
      {users.length === 0 ? (
        <div className="rounded-2xl border border-[#ececf4] bg-white px-8 py-16 text-center shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#e8f7ff]">
            <Users className="size-7 text-[#0ea5e9]" />
          </div>
          <h3 className="mt-5 text-[17px] font-semibold text-[#0b1024]">
            Сотрудников пока нет
          </h3>
          <p className="mt-2 text-[14px] text-[#6f7282]">
            {isManager
              ? "Пригласите первого сотрудника — ему придёт письмо со ссылкой."
              : "Администратор пока не добавил сотрудников."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
          <table className="w-full text-[15px]">
            <thead className="bg-[#f8f9fc] text-[13px] text-[#6f7282]">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Сотрудник</th>
                <th className="px-6 py-3 text-left font-medium">Контакты</th>
                <th className="px-6 py-3 text-left font-medium">Должность</th>
                <th className="px-6 py-3 text-center font-medium">Статус</th>
                <th className="px-6 py-3 text-center font-medium">TG</th>
                {isManager && (
                  <th className="w-[130px] px-6 py-3 text-right font-medium">
                    Действия
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={`border-t border-[#f0f1f8] transition-colors hover:bg-[#fafbff] ${
                    !user.isActive ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-[#eef1ff] text-[#5566f6]">
                        <User className="size-4" />
                      </div>
                      <div className="font-medium text-[#0b1024]">
                        {user.name}
                        {user.id === session.user.id && (
                          <span className="ml-2 text-[11px] font-normal text-[#9b9fb3]">
                            (вы)
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-0.5 text-[13px] text-[#6f7282]">
                      <div className="flex items-center gap-1.5">
                        <Mail className="size-3" />
                        {user.email}
                      </div>
                      {user.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3" />
                          {user.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[14px] text-[#6f7282]">
                    {getUserDisplayTitle(user)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        user.isActive
                          ? "bg-[#ecfdf5] text-[#136b2a]"
                          : "bg-[#f3f4f6] text-[#6b7280]"
                      }`}
                    >
                      {user.isActive ? "Активен" : "Неактивен"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-[13px]">
                    {user.telegramChatId ? (
                      <span className="text-[#10b981]">✓</span>
                    ) : (
                      <span className="text-[#c7ccea]">—</span>
                    )}
                  </td>
                  {isManager && (
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Доступ к журналам"
                          className="hover:bg-[#eef1ff] hover:text-[#5566f6]"
                        >
                          <Link href={`/settings/users/${user.id}/access`}>
                            <KeyRound className="size-4" />
                          </Link>
                        </Button>
                        <EditUserDialog
                          user={user}
                          isSelf={user.id === session.user.id}
                        />
                        {user.id !== session.user.id && (
                          <DeleteButton
                            id={user.id}
                            endpoint="/api/users"
                            entityName={`сотрудника "${user.name}"`}
                          />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
