import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { requireRoot } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PLATFORM_ORG_ID = process.env.PLATFORM_ORG_ID || "platform";

export default async function RootOrganizationsPage() {
  await requireRoot();

  const organizations = await db.organization.findMany({
    where: { id: { not: PLATFORM_ORG_ID } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      inn: true,
      subscriptionPlan: true,
      subscriptionEnd: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          journalDocuments: true,
        },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-black">
          Все организации
        </h1>
        <p className="mt-2 text-[15px] text-[#6f7282]">
          Платформенный уровень. Всего организаций: {organizations.length}.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#ececf4] bg-white">
        <table className="w-full min-w-[820px] text-[15px]">
          <thead className="bg-[#f6f7fb] text-[14px] text-[#6f7282]">
            <tr>
              <th className="px-6 py-3 text-left font-medium">Название</th>
              <th className="px-6 py-3 text-left font-medium">Тип</th>
              <th className="px-6 py-3 text-left font-medium">ИНН</th>
              <th className="px-6 py-3 text-left font-medium">Тариф</th>
              <th className="px-6 py-3 text-center font-medium">Сотрудники</th>
              <th className="px-6 py-3 text-center font-medium">Документы</th>
              <th className="w-[56px] px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {organizations.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-12 text-center text-[#6f7282]"
                >
                  Пока нет зарегистрированных организаций.
                </td>
              </tr>
            )}
            {organizations.map((org) => (
              <tr
                key={org.id}
                className="border-t border-[#eef0f6] transition-colors hover:bg-[#fafbff]"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-[#eef1ff] text-[#5566f6]">
                      <Building2 className="size-5" />
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-black">
                        {org.name}
                      </div>
                      <div className="text-[13px] text-[#8a8ea4]">
                        {new Date(org.createdAt).toLocaleDateString("ru-RU")}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-[14px] text-black">{org.type}</td>
                <td className="px-6 py-4 text-[14px] text-[#6f7282]">
                  {org.inn || "—"}
                </td>
                <td className="px-6 py-4 text-[14px]">
                  <span className="inline-flex items-center rounded-full bg-[#eef1ff] px-3 py-1 text-[#5566f6]">
                    {org.subscriptionPlan}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-[14px] text-black">
                  {org._count.users}
                </td>
                <td className="px-6 py-4 text-center text-[14px] text-black">
                  {org._count.journalDocuments}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/root/organizations/${org.id}`}
                    className="inline-flex size-9 items-center justify-center rounded-full text-[#5566f6] hover:bg-[#eef1ff]"
                    aria-label="Открыть"
                  >
                    <ArrowRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
