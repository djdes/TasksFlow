import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, BookText, Users } from "lucide-react";
import { requireRoot } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { getUserRoleLabel } from "@/lib/user-roles";
import { ImpersonateButton } from "./impersonate-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function OrganizationDetailPage({ params }: PageProps) {
  await requireRoot();
  const { id } = await params;

  const org = await db.organization.findUnique({
    where: { id },
    include: {
      users: {
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          telegramChatId: true,
          journalAccessMigrated: true,
        },
      },
      _count: {
        select: {
          users: true,
          journalDocuments: true,
          journalEntries: true,
          auditLogs: true,
        },
      },
    },
  });

  if (!org) notFound();

  const activeDocs = await db.journalDocument.count({
    where: { organizationId: id, status: "active" },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <Link
            href="/root"
            className="inline-flex items-center gap-2 text-[14px] text-[#6f7282] hover:text-black"
          >
            <ArrowLeft className="size-4" />
            Все организации
          </Link>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-black">
            {org.name}
          </h1>
          <p className="mt-1 text-[15px] text-[#6f7282]">
            {org.type} · создана {new Date(org.createdAt).toLocaleDateString("ru-RU")}
            {org.inn ? ` · ИНН ${org.inn}` : ""}
          </p>
        </div>
        <ImpersonateButton organizationId={org.id} organizationName={org.name} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<Users className="size-5" />} label="Сотрудники" value={org._count.users} />
        <StatCard icon={<BookText className="size-5" />} label="Документов" value={org._count.journalDocuments} />
        <StatCard icon={<BadgeCheck className="size-5" />} label="Активных" value={activeDocs} />
        <StatCard icon={<BookText className="size-5" />} label="Записей" value={org._count.journalEntries} />
      </div>

      <div className="rounded-2xl border border-[#ececf4] bg-white p-6 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <div className="mb-4 text-[18px] font-semibold">Подписка</div>
        <dl className="grid grid-cols-3 gap-6 text-[14px]">
          <div>
            <dt className="text-[#8a8ea4]">Тариф</dt>
            <dd className="mt-1 font-semibold text-black">{org.subscriptionPlan}</dd>
          </div>
          <div>
            <dt className="text-[#8a8ea4]">Действует до</dt>
            <dd className="mt-1 font-semibold text-black">
              {org.subscriptionEnd
                ? new Date(org.subscriptionEnd).toLocaleDateString("ru-RU")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[#8a8ea4]">Внешний API-токен</dt>
            <dd className="mt-1 font-semibold text-black">
              {org.externalApiToken ? "выдан" : "не выдан"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <div className="flex items-center justify-between border-b border-[#eef0f6] px-6 py-4">
          <div className="text-[18px] font-semibold">Сотрудники</div>
          <div className="text-[14px] text-[#8a8ea4]">{org.users.length}</div>
        </div>
        <table className="w-full text-[14px]">
          <thead className="bg-[#f8f9fc] text-[13px] text-[#6f7282]">
            <tr>
              <th className="px-6 py-3 text-left font-medium">Имя</th>
              <th className="px-6 py-3 text-left font-medium">Email</th>
              <th className="px-6 py-3 text-left font-medium">Роль</th>
              <th className="px-6 py-3 text-center font-medium">Telegram</th>
              <th className="px-6 py-3 text-center font-medium">ACL</th>
              <th className="px-6 py-3 text-center font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {org.users.map((user) => (
              <tr key={user.id} className="border-t border-[#eef0f6]">
                <td className="px-6 py-3 text-black">{user.name}</td>
                <td className="px-6 py-3 text-[#6f7282]">{user.email}</td>
                <td className="px-6 py-3 text-[#6f7282]">
                  {getUserRoleLabel(user.role)}
                </td>
                <td className="px-6 py-3 text-center">
                  {user.telegramChatId ? "✓" : "—"}
                </td>
                <td className="px-6 py-3 text-center">
                  {user.journalAccessMigrated ? "✓" : "все"}
                </td>
                <td className="px-6 py-3 text-center">
                  {user.isActive ? "активен" : "неактивен"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
      <div className="flex items-center gap-3 text-[#5566f6]">{icon}</div>
      <div className="mt-3 text-[28px] font-semibold leading-none text-black">
        {value}
      </div>
      <div className="mt-2 text-[13px] text-[#8a8ea4]">{label}</div>
    </div>
  );
}
