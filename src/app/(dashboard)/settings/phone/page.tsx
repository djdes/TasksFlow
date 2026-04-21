import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";
import { requireAuth, getActiveOrgId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { PhoneBindingClient } from "./phone-binding-client";

export const dynamic = "force-dynamic";

/**
 * «Привязка телефона» — self-service страница под /settings. Один номер
 * = один ключ к TasksFlow и к внешним уведомлениям.
 */
export default async function PhoneBindingPage() {
  const session = await requireAuth();
  const organizationId = getActiveOrgId(session);

  const [user, integration] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        telegramChatId: true,
      },
    }),
    db.tasksFlowIntegration.findFirst({
      where: { organizationId, enabled: true },
      select: { id: true },
    }),
  ]);

  const link = integration
    ? await db.tasksFlowUserLink.findFirst({
        where: {
          integrationId: integration.id,
          wesetupUserId: session.user.id,
        },
        select: {
          tasksflowUserId: true,
          source: true,
          updatedAt: true,
        },
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-[13px] text-[#6f7282] hover:text-[#0b1024]"
        >
          <ArrowLeft className="size-4" />
          К настройкам
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6]">
            <Phone className="size-5" />
          </span>
          <div>
            <h1 className="text-[clamp(1.625rem,1.5vw+1.2rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
              Привязка телефона
            </h1>
            <p className="mt-1.5 max-w-[640px] text-[14px] leading-relaxed text-[#6f7282]">
              Номер связывает ваш аккаунт с TasksFlow — оттуда уходят
              задачи сотрудникам. Укажите один раз, дальше он
              автоматически подтянется к интеграции по совпадению
              номера.
            </p>
          </div>
        </div>
      </div>

      <PhoneBindingClient
        initialPhone={user?.phone ?? null}
        initialDisplay={user?.phone ? formatPhone(user.phone) : ""}
        hasIntegration={Boolean(integration)}
        hasLink={Boolean(link?.tasksflowUserId)}
        linkSource={link?.source ?? null}
        userName={user?.name ?? ""}
        telegramLinked={Boolean(user?.telegramChatId)}
      />
    </div>
  );
}
