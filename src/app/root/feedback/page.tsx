import Link from "next/link";
import {
  Bug,
  Lightbulb,
  MessageSquareText,
  Phone,
  User,
  Building2,
  Filter,
} from "lucide-react";
import { requireRoot } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, { label: string; icon: typeof Bug; color: string; bg: string; border: string }> = {
  bug: {
    label: "Ошибка",
    icon: Bug,
    color: "#d2453d",
    bg: "#fff4f2",
    border: "#ffd2cd",
  },
  suggestion: {
    label: "Предложение",
    icon: Lightbulb,
    color: "#5566f6",
    bg: "#eef1ff",
    border: "#c7ccea",
  },
};

type SearchParams = {
  type?: string;
  org?: string;
};

export default async function RootFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRoot();
  const { type: rawType, org: rawOrg } = await searchParams;

  const typeFilter =
    rawType === "bug" || rawType === "suggestion" ? rawType : null;
  const orgFilter = rawOrg && rawOrg.trim() !== "" ? rawOrg : null;

  const where: Prisma.FeedbackReportWhereInput = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(orgFilter ? { organizationId: orgFilter } : {}),
  };

  const [reports, totalAll, totalBugs, totalSuggestions, orgs] =
    await Promise.all([
      db.feedbackReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.feedbackReport.count(),
      db.feedbackReport.count({ where: { type: "bug" } }),
      db.feedbackReport.count({ where: { type: "suggestion" } }),
      db.feedbackReport.groupBy({
        by: ["organizationId", "organizationName"],
        _count: { _all: true },
        orderBy: { _count: { organizationId: "desc" } },
      }),
    ]);

  const orgOptions = orgs
    .filter((o) => o.organizationId)
    .map((o) => ({
      id: o.organizationId as string,
      name: o.organizationName ?? o.organizationId ?? "—",
      count: o._count._all,
    }));

  const filtered = Boolean(typeFilter || orgFilter);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-black">
            Обратная связь
          </h1>
          <p className="mt-2 text-[15px] text-[#6f7282]">
            Все обращения пользователей. Всего: {totalAll} · ошибок: {totalBugs}
            {" "}· предложений: {totalSuggestions}
            {filtered ? ` · отфильтровано: ${reports.length}` : ""}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#ececf4] bg-white p-5">
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#6f7282]">
          <Filter className="size-4" />
          Фильтры
        </div>
        <form
          method="GET"
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="type"
              className="text-[12px] font-medium uppercase tracking-wider text-[#9b9fb3]"
            >
              Тип
            </label>
            <select
              id="type"
              name="type"
              defaultValue={typeFilter ?? ""}
              className="h-10 w-full rounded-xl border border-[#dcdfed] bg-white px-3 text-[14px] text-[#0b1024] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15 sm:w-auto sm:min-w-[180px]"
            >
              <option value="">Все типы</option>
              <option value="bug">Ошибка ({totalBugs})</option>
              <option value="suggestion">Предложение ({totalSuggestions})</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="org"
              className="text-[12px] font-medium uppercase tracking-wider text-[#9b9fb3]"
            >
              Организация
            </label>
            <select
              id="org"
              name="org"
              defaultValue={orgFilter ?? ""}
              className="h-10 w-full rounded-xl border border-[#dcdfed] bg-white px-3 text-[14px] text-[#0b1024] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15 sm:w-auto sm:min-w-[280px]"
            >
              <option value="">Все организации</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.count})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="h-10 rounded-xl bg-[#5566f6] px-4 text-[13px] font-medium text-white shadow-[0_8px_20px_-12px_rgba(85,102,246,0.6)] transition-colors hover:bg-[#4a5bf0]"
          >
            Применить
          </button>

          {filtered ? (
            <Link
              href="/root/feedback"
              className="h-10 rounded-xl border border-[#dcdfed] px-4 text-[13px] font-medium leading-[38px] text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
            >
              Сбросить
            </Link>
          ) : null}
        </form>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-white px-8 py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f5f6ff] text-[#5566f6]">
            <MessageSquareText className="size-7" />
          </div>
          <p className="mt-4 text-[17px] font-semibold text-[#0b1024]">
            Обращений нет
          </p>
          <p className="mt-2 text-[14px] text-[#6f7282]">
            {filtered
              ? "По выбранным фильтрам ничего не найдено."
              : "Пока никто не написал через форму обратной связи."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const theme = TYPE_LABELS[r.type] ?? TYPE_LABELS.suggestion;
            const Icon = theme.icon;
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]"
              >
                <div className="flex items-start gap-4">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: theme.bg,
                      color: theme.color,
                    }}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        )}
                        style={{
                          backgroundColor: theme.bg,
                          color: theme.color,
                        }}
                      >
                        {theme.label}
                      </span>
                      {r.organizationName ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f6ff] px-2 py-0.5 text-[11px] font-medium text-[#5566f6]">
                          <Building2 className="size-3" />
                          {r.organizationName}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[12px] text-[#9b9fb3]">
                        {r.createdAt.toLocaleString("ru-RU", {
                          timeZone: "Europe/Moscow",
                        })}
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-[1.55] text-[#0b1024]">
                      {r.message}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#6f7282]">
                      {r.userName || r.userEmail ? (
                        <span className="inline-flex items-center gap-1.5">
                          <User className="size-3.5" />
                          {[r.userName, r.userEmail]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                      {r.phone ? (
                        <a
                          href={`tel:${r.phone.replace(/[^+\d]/g, "")}`}
                          className="inline-flex items-center gap-1.5 hover:text-[#5566f6]"
                        >
                          <Phone className="size-3.5" />
                          {r.phone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
