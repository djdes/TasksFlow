"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  KeyRound,
  Plug,
  RefreshCw,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Integration = {
  id: string;
  baseUrl: string;
  apiKeyPrefix: string;
  tasksflowCompanyId: number | null;
  enabled: boolean;
  lastSyncAt: string | null;
  label: string | null;
  linkedUserCount: number;
  taskLinkCount: number;
};

type LinkRow = {
  wesetupUserId: string;
  name: string;
  phone: string | null;
  role: string;
  positionTitle: string | null;
  link: {
    tasksflowUserId: number | null;
    source: string;
    updatedAt: string;
  } | null;
  status: "linked" | "no_phone" | "no_match" | "pending";
};

export function TasksFlowSettingsClient({
  organizationName,
  initialIntegration,
}: {
  organizationName: string;
  initialIntegration: Integration | null;
}) {
  const router = useRouter();
  const [integration, setIntegration] = useState<Integration | null>(
    initialIntegration
  );
  const [baseUrl, setBaseUrl] = useState(
    initialIntegration?.baseUrl ?? "https://tasksflow.ru"
  );
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState(initialIntegration?.label ?? "");
  const [pendingConnect, startConnect] = useTransition();
  const [pendingSync, startSync] = useTransition();
  const [pendingDisconnect, startDisconnect] = useTransition();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [lastFailures, setLastFailures] = useState<
    Array<{
      wesetupUserId: string;
      name: string | null;
      phone: string;
      reason: string;
      message: string;
      httpStatus?: number;
    }>
  >([]);
  const integrationId = integration?.id ?? null;
  const integrationLastSyncAt = integration?.lastSyncAt ?? null;

  // Load the user-link table whenever an integration exists. Re-fetches
  // after a successful sync — the server bumps `updatedAt`, so the UI
  // reflects "auto / manual" + current TasksFlow id without refresh.
  useEffect(() => {
    if (!integrationId) {
      setLinks(null);
      return;
    }
    let cancelled = false;
    setLinksLoading(true);
    fetch("/api/integrations/tasksflow/links", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("links fetch failed");
        const data = await r.json();
        if (!cancelled) setLinks(data.links ?? []);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      })
      .finally(() => {
        if (!cancelled) setLinksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [integrationId, integrationLastSyncAt]);

  function handleConnect() {
    startConnect(async () => {
      try {
        const response = await fetch("/api/integrations/tasksflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            label: label.trim() || null,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "Не удалось подключить TasksFlow");
        }
        toast.success(
          `TasksFlow подключён. Найдено ${data.probedUserCount ?? 0} сотрудников.`
        );
        // Re-fetch the full integration via status endpoint so the UI
        // gets all the derived fields (companyId, lastSyncAt, counts).
        const status = await fetch("/api/integrations/tasksflow", {
          cache: "no-store",
        }).then((r) => r.json());
        setIntegration(status.integration);
        setApiKey("");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Ошибка подключения"
        );
      }
    });
  }

  function handleSync() {
    startSync(async () => {
      try {
        const response = await fetch(
          "/api/integrations/tasksflow/sync-users",
          { method: "POST" }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "Не удалось синхронизировать");
        }
        const t = data.totals;
        const failures = Array.isArray(data.failures) ? data.failures : [];
        setLastFailures(failures);
        const summary =
          `Связано ${t.linked} из ${t.wesetupUsers}. ` +
          `Создано в TasksFlow: ${t.createdRemote}, без телефона: ${t.withoutPhone}, не связаны: ${t.withoutMatch}.`;
        if (failures.length > 0) {
          toast.warning(summary + ` Не удалось создать ${failures.length} — см. детали ниже.`);
        } else {
          toast.success(summary);
        }
        const status = await fetch("/api/integrations/tasksflow", {
          cache: "no-store",
        }).then((r) => r.json());
        setIntegration(status.integration);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Ошибка синхронизации"
        );
      }
    });
  }

  function handleDisconnect() {
    if (
      !window.confirm(
        "Отключить интеграцию с TasksFlow? Маппинг сотрудников и связи задач будут удалены."
      )
    ) {
      return;
    }
    startDisconnect(async () => {
      try {
        const response = await fetch("/api/integrations/tasksflow", {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error("Не удалось отключить");
        }
        toast.success("TasksFlow отключён");
        setIntegration(null);
        setApiKey("");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Ошибка отключения"
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-[#0b1024] text-white shadow-[0_20px_60px_-30px_rgba(11,16,36,0.55)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[460px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
        </div>
        <div className="relative z-10 p-8 md:p-10">
          <Link
            href="/settings"
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Настройки
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <Plug className="size-6" />
              </div>
              <div>
                <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold leading-tight tracking-[-0.02em]">
                  TasksFlow
                </h1>
                <p className="mt-2 max-w-[560px] text-[15px] text-white/70">
                  Автоматическая отправка задач уборщикам через{" "}
                  <a
                    href="https://tasksflow.ru"
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-white/30 underline-offset-2 hover:decoration-white"
                  >
                    tasksflow.ru
                    <ExternalLink className="ml-1 inline size-3" />
                  </a>
                  . Синхронизация сотрудников автоматически создаёт отсутствующих
                  людей в TasksFlow, а строки журнала уборки превращаются в
                  recurring-задачи для уборщицы. Когда задача отмечена
                  выполненной — клетка журнала проставляется автоматически.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
              <CheckCircle2 className="size-3.5" />
              {integration ? "Подключено" : "Не подключено"}
            </div>
          </div>
        </div>
      </section>

      {/* Connect / status card */}
      <section className="rounded-3xl border border-[#ececf4] bg-white p-6 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] md:p-7">
        {integration ? (
          <ConnectedView
            integration={integration}
            organizationName={organizationName}
            onSync={handleSync}
            onDisconnect={handleDisconnect}
            pendingSync={pendingSync}
            pendingDisconnect={pendingDisconnect}
          />
        ) : (
          <ConnectForm
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            label={label}
            setLabel={setLabel}
            onSubmit={handleConnect}
            pending={pendingConnect}
          />
        )}
      </section>

      {/* Linked users table */}
      {integration ? (
        <section className="rounded-3xl border border-[#ececf4] bg-white p-6 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] md:p-7">
          <div className="mb-4 flex items-center gap-2">
            <UsersIcon className="size-4 text-[#5566f6]" />
            <h2 className="text-[15px] font-semibold text-[#0b1024]">
              Сопоставление сотрудников
            </h2>
          </div>
          <p className="mb-4 max-w-[640px] text-[13px] text-[#6f7282]">
            Синхронизация идёт по номеру телефона. Если сотрудник уже есть в
            TasksFlow, он свяжется автоматически. Если его там ещё нет, WeSetup
            создаст его в компании, к которой привязан API-ключ. Номер телефона
            должен быть в формате
            <code className="mx-1 rounded bg-[#f5f6ff] px-1.5 py-0.5 font-mono text-[12px] text-[#3848c7]">
              +7XXXXXXXXXX
            </code>
            — тогда синхронизация пройдет без ручной магии.
          </p>
          {linksLoading ? (
            <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] px-6 py-10 text-center text-[13px] text-[#6f7282]">
              Загрузка…
            </div>
          ) : !links || links.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] px-6 py-10 text-center">
              <div className="text-[14px] font-medium text-[#0b1024]">
                Нет сотрудников с активным аккаунтом
              </div>
              <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] text-[#6f7282]">
                Добавьте сотрудников в разделе «Сотрудники», заполните им
                номер телефона, затем нажмите «Синхронизировать».
              </p>
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[640px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-[#ececf4] bg-[#fafbff] text-left text-[12px] uppercase tracking-wider text-[#6f7282]">
                    <th className="px-4 py-3 font-medium">Сотрудник</th>
                    <th className="px-4 py-3 font-medium">Телефон</th>
                    <th className="px-4 py-3 font-medium">TasksFlow</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((row) => (
                    <tr
                      key={row.wesetupUserId}
                      className="border-b border-[#ececf4] last:border-b-0"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-[#0b1024]">
                          {row.name}
                        </div>
                        {row.positionTitle ? (
                          <div className="text-[12px] text-[#6f7282]">
                            {row.positionTitle}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top text-[13px] text-[#3c4053]">
                        {row.phone ? (
                          <span className="font-mono">{row.phone}</span>
                        ) : (
                          <span className="text-[#9b9fb3]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-[13px]">
                        {row.link?.tasksflowUserId ? (
                          <span className="font-mono text-[#3848c7]">
                            #{row.link.tasksflowUserId}
                          </span>
                        ) : (
                          <span className="text-[#9b9fb3]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Sync-failures diagnostic panel. Shown only after a sync that
          came back with problems. Without it the manager saw 0/N and
          had zero clue why; now we expose the TasksFlow response verbatim. */}
      {lastFailures.length > 0 ? (
        <section className="rounded-3xl border border-[#ffd2cd] bg-[#fff4f2] p-6 shadow-[0_0_0_1px_rgba(255,195,185,0.35)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#a13a32]" />
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold text-[#0b1024]">
                Не получилось связать {lastFailures.length}{" "}
                {pluralPeople(lastFailures.length)}
              </h2>
              {hasForbiddenFailure(lastFailures) ? (
                <div className="mt-1 space-y-3 text-[13px] leading-relaxed text-[#3c4053]">
                  <p>
                    TasksFlow не даёт создать пользователей по Bearer
                    API-ключу — это ограничение на их стороне. Есть два
                    способа продолжить:
                  </p>
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>
                      <strong>Выдать ключу право создавать</strong> —
                      если в вашем TasksFlow есть роль API-ключа с
                      правом «Создание пользователей», выпустите такой
                      ключ, подставьте его сюда и нажмите
                      «Синхронизировать» заново.
                    </li>
                    <li>
                      <strong>Добавить руками в TasksFlow</strong> —
                      откройте TasksFlow, добавьте сотрудника с тем же
                      телефоном (через «+Сотрудник»), вернитесь сюда и
                      нажмите «Синхронизировать». WeSetup свяжется по
                      номеру автоматически.
                    </li>
                  </ol>
                  {integration?.baseUrl ? (
                    <a
                      href={integration.baseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[13px] font-medium text-[#3848c7] hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
                    >
                      Открыть TasksFlow
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-[13px] leading-relaxed text-[#3c4053]">
                  Смотрите точную причину по каждому сотруднику ниже.
                  Часто дело в формате телефона или в отсутствии
                  сотрудника в TasksFlow.
                </p>
              )}
              <ul className="mt-4 space-y-2">
                {lastFailures.map((f) => (
                  <li
                    key={f.wesetupUserId}
                    className="rounded-2xl border border-[#ffb0a6] bg-white px-4 py-3 text-[13px]"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium text-[#0b1024]">
                        {f.name ?? "(без имени)"}
                      </span>
                      <span className="font-mono text-[12px] text-[#6f7282]">
                        {f.phone}
                      </span>
                      {typeof f.httpStatus === "number" && f.httpStatus > 0 ? (
                        <span className="ml-auto rounded-full bg-[#fff4f2] px-2 py-0.5 text-[11px] font-semibold text-[#a13a32]">
                          HTTP {f.httpStatus}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[12px] leading-relaxed text-[#6f7282]">
                      {friendlyReason(f.reason)}: {f.message}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CopyChip
                        label="Скопировать телефон"
                        value={f.phone}
                      />
                      {f.name ? (
                        <CopyChip label="Скопировать ФИО" value={f.name} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error("Не удалось скопировать. Выделите вручную.");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#dcdfed] bg-white px-3 py-1 text-[11px] font-medium text-[#3c4053] hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
    >
      {done ? (
        <CheckCircle2 className="size-3 text-[#136b2a]" />
      ) : (
        <ClipboardCopy className="size-3 text-[#6f7282]" />
      )}
      {done ? "Скопировано" : label}
    </button>
  );
}

function friendlyReason(reason: string): string {
  switch (reason) {
    case "remote_create_forbidden":
      return "TasksFlow не даёт создать";
    case "remote_create_failed":
      return "Ошибка создания";
    case "phone_invalid":
      return "Плохой телефон";
    default:
      return "Не удалось связать";
  }
}

function hasForbiddenFailure(
  list: Array<{ reason: string }>
): boolean {
  return list.some((f) => f.reason === "remote_create_forbidden");
}

function pluralPeople(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "сотрудника";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
    return "сотрудников";
  return "сотрудников";
}

function ConnectForm({
  baseUrl,
  setBaseUrl,
  apiKey,
  setApiKey,
  label,
  setLabel,
  onSubmit,
  pending,
}: {
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-5"
    >
      <div>
        <h2 className="text-[16px] font-semibold text-[#0b1024]">
          Подключить TasksFlow
        </h2>
        <p className="mt-1 text-[13px] text-[#6f7282]">
          Создайте API-ключ в TasksFlow:{" "}
          <span className="font-mono text-[12px] text-[#3848c7]">
            Настройки → API ключи → Создать
          </span>
          . Ключ начинается с <code className="font-mono">tfk_</code> и
          показывается один раз.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[13px] font-medium text-[#3c4053]">
            URL TasksFlow
          </Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://tasksflow.ru"
            required
            className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[13px] font-medium text-[#3c4053]">
            Метка (для себя)
          </Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Production"
            className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-[13px] font-medium text-[#3c4053]">
          API ключ
        </Label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#9b9fb3]" />
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="tfk_…"
            required
            autoComplete="off"
            spellCheck={false}
            className="h-11 rounded-2xl border-[#dcdfed] pl-11 pr-4 font-mono text-[14px]"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={pending || !apiKey.trim() || !baseUrl.trim()}
          className="h-11 rounded-2xl bg-[#5566f6] px-5 text-[15px] font-medium text-white hover:bg-[#4a5bf0]"
        >
          <Plug className="size-4" />
          {pending ? "Проверяю…" : "Подключить"}
        </Button>
      </div>
    </form>
  );
}

function ConnectedView({
  integration,
  organizationName,
  onSync,
  onDisconnect,
  pendingSync,
  pendingDisconnect,
}: {
  integration: Integration;
  organizationName: string;
  onSync: () => void;
  onDisconnect: () => void;
  pendingSync: boolean;
  pendingDisconnect: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="URL"
          value={
            <a
              href={integration.baseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#3848c7] hover:underline"
            >
              {integration.baseUrl}
              <ExternalLink className="ml-1 inline size-3" />
            </a>
          }
        />
        <Field
          label="Ключ"
          value={
            <span className="font-mono text-[13px]">
              {integration.apiKeyPrefix}…
            </span>
          }
        />
        <Field
          label="Компания в TasksFlow"
          value={
            integration.tasksflowCompanyId !== null ? (
              <span className="font-mono">#{integration.tasksflowCompanyId}</span>
            ) : (
              <span className="text-[#9b9fb3]">не определена</span>
            )
          }
        />
        <Field
          label="Метка"
          value={
            integration.label || (
              <span className="text-[#9b9fb3]">—</span>
            )
          }
        />
        <Field
          label="Связано сотрудников"
          value={`${integration.linkedUserCount}`}
        />
        <Field
          label="Активных задач"
          value={`${integration.taskLinkCount}`}
        />
        <Field
          label="Последняя синхронизация"
          value={
            integration.lastSyncAt
              ? new Date(integration.lastSyncAt).toLocaleString("ru-RU")
              : "не проводилась"
          }
        />
        <Field label="Организация" value={organizationName} />
      </div>
      <div className="flex flex-col gap-2 border-t border-[#ececf4] pt-5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onSync}
          disabled={pendingSync}
          className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[14px]"
        >
          <RefreshCw
            className={`size-4 ${pendingSync ? "animate-spin" : ""}`}
          />
          {pendingSync ? "Синхронизирую…" : "Синхронизировать сотрудников"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDisconnect}
          disabled={pendingDisconnect}
          className="h-11 rounded-2xl border-[#ffd2cd] px-4 text-[14px] text-[#a13a32] hover:bg-[#fff4f2]"
        >
          <Trash2 className="size-4" />
          Отключить
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#9b9fb3]">
        {label}
      </div>
      <div className="mt-1 text-[14px] text-[#0b1024]">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: LinkRow["status"] }) {
  const map: Record<
    LinkRow["status"],
    { label: string; bg: string; fg: string }
  > = {
    linked: { label: "Связан", bg: "#ecfdf5", fg: "#116b2a" },
    no_phone: { label: "Без телефона", bg: "#fff4f2", fg: "#a13a32" },
    no_match: { label: "Не найден в TasksFlow", bg: "#fff8eb", fg: "#92400e" },
    pending: { label: "Не синхронизирован", bg: "#f5f6ff", fg: "#3848c7" },
  };
  const cfg = map[status];
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}
