import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Database,
  Loader2,
  Network,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Users as UsersIcon,
  XCircle,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";

/**
 * /admin/integrations — единый «Интеграционный центр» TasksFlow
 * с WeSetup. Зеркалит:
 *   • health (двусторонний)
 *   • sync-users (форвард + reverse pending invites)
 *   • sync-tasks (pull выполненных)
 *   • sync-hierarchy (ManagerScope → managedWorkerIds)
 *   • bulk-assign-today (массовое назначение задач из активных журналов)
 *   • linked-users (счётчик)
 *   • webhook delivery queue (pending / failed)
 *
 * Каждая «фишечка» из WeSetup-side тут как кнопка с человеческим
 * названием и понятным результатом — раньше админу TasksFlow
 * приходилось лезть в WeSetup админку и руками жать. См.
 * docs/THREAD_TASKSFLOW.md (P1).
 */

type WesetupHealth = {
  ok: boolean;
  message?: string;
  journalsCount?: number;
  formsCount?: number;
  assignableUsersCount?: number;
  upstreamStatus?: number;
};

type LinksResponse = {
  links?: Array<{
    wesetupUserId: string;
    name: string;
    phone: string | null;
    role: string;
    positionTitle: string | null;
    link: { tasksflowUserId: number | null; source: string; updatedAt: string } | null;
    status: "linked" | "no_phone" | "no_match" | "pending";
  }>;
};

type SyncUsersResponse = {
  totals?: {
    linked?: number;
    wesetupUsers?: number;
    createdRemote?: number;
    withoutPhone?: number;
    withoutMatch?: number;
    manualSkipped?: number;
    promotedAdmin?: number;
  };
  failures?: Array<{ name: string | null; phone: string; reason: string; message: string }>;
  reverseSync?: {
    imported: number;
    failures?: Array<{ tasksflowUserId: number; phone: string; message: string }>;
  };
};

type WebhookQueueStats = {
  stats: { pending: number; delivered: number; failed: number; cancelled: number };
  recentFailed: Array<{
    id: number;
    taskId: number;
    eventType: string;
    attempts: number;
    lastError: string | null;
    updatedAt: number;
  }>;
  migrationNeeded?: boolean;
};

function formatTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("ru-RU");
}

export default function IntegrationsPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [lastSyncUsersResult, setLastSyncUsersResult] =
    useState<SyncUsersResponse | null>(null);
  const [lastSyncTasksResult, setLastSyncTasksResult] = useState<unknown>(null);
  const [lastSyncHierarchyResult, setLastSyncHierarchyResult] =
    useState<unknown>(null);

  const healthQuery = useQuery<WesetupHealth>({
    queryKey: ["wesetup-health"],
    queryFn: async () => {
      const r = await fetch("/api/wesetup/health", { credentials: "include" });
      const data = await r.json().catch(() => ({ ok: false, message: "не JSON" }));
      if (!r.ok) {
        throw Object.assign(new Error(data?.message || "health failed"), { data });
      }
      return data as WesetupHealth;
    },
    enabled: !!user?.isAdmin,
    refetchInterval: 60_000,
  });

  const linksQuery = useQuery<LinksResponse>({
    queryKey: ["wesetup-links"],
    queryFn: async () => {
      const r = await fetch("/api/wesetup/links", { credentials: "include" });
      if (!r.ok) {
        return {};
      }
      return (await r.json()) as LinksResponse;
    },
    enabled: !!user?.isAdmin,
  });

  const queueQuery = useQuery<WebhookQueueStats>({
    queryKey: ["webhook-queue-stats"],
    queryFn: async () => {
      const r = await fetch("/api/admin/webhook-queue/stats", {
        credentials: "include",
      });
      if (!r.ok) throw new Error("queue stats failed");
      return (await r.json()) as WebhookQueueStats;
    },
    enabled: !!user?.isAdmin,
    refetchInterval: 30_000,
  });

  const syncUsers = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/wesetup/sync-users", {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || data.error || "Ошибка sync-users");
      return data as SyncUsersResponse;
    },
    onSuccess: (data) => {
      setLastSyncUsersResult(data);
      const t = data.totals;
      const reverse = data.reverseSync;
      const lines = [
        t ? `Связано ${t.linked ?? 0} из ${t.wesetupUsers ?? 0}.` : null,
        t ? `Создано в TasksFlow: ${t.createdRemote ?? 0}.` : null,
        reverse ? `Из TasksFlow в WeSetup pending: ${reverse.imported}.` : null,
      ].filter(Boolean);
      toast({
        title: "Синхронизация сотрудников завершена",
        description: lines.join(" "),
      });
      linksQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Ошибка sync-users", description: e.message, variant: "destructive" });
    },
  });

  const syncTasks = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/wesetup/sync-tasks", {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || data.error || "Ошибка sync-tasks");
      return data;
    },
    onSuccess: (data: any) => {
      setLastSyncTasksResult(data);
      toast({
        title: "Подтянули выполненные задачи",
        description: data?.summary
          ? JSON.stringify(data.summary)
          : "Готово",
      });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка sync-tasks", description: e.message, variant: "destructive" });
    },
  });

  const syncHierarchy = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/wesetup/sync-hierarchy", {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(data.message || data.error || "Ошибка sync-hierarchy");
      return data;
    },
    onSuccess: (data: any) => {
      setLastSyncHierarchyResult(data);
      toast({
        title: "Иерархия руководителей обновлена",
        description: data?.summary ? JSON.stringify(data.summary) : "Готово",
      });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка sync-hierarchy", description: e.message, variant: "destructive" });
    },
  });

  const bulkAssign = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/wesetup/bulk-assign-today", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || data.error || "Ошибка bulk-assign");
      return data;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Задачи на сегодня назначены",
        description: data?.summary ? JSON.stringify(data.summary) : "Готово",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Ошибка bulk-assign-today",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Доступ только для администраторов
          </p>
          <Button onClick={() => setLocation("/dashboard")}>На главную</Button>
        </div>
      </div>
    );
  }

  const linksAll = linksQuery.data?.links ?? [];
  const linksLinked = linksAll.filter((l) => l.status === "linked").length;
  const linksPending = linksAll.filter(
    (l) => l.status === "pending" || l.status === "no_match",
  ).length;
  const linksNoPhone = linksAll.filter((l) => l.status === "no_phone").length;

  const health = healthQuery.data;
  const healthError = healthQuery.error as any;
  const healthOk = health?.ok === true;
  const healthLoading = healthQuery.isFetching && !health;
  const healthBadgePalette = healthOk
    ? "bg-green-500/15 border-green-500/30 text-green-700 dark:text-green-400"
    : "bg-destructive/15 border-destructive/30 text-destructive";

  const queue = queueQuery.data;

  return (
    <div className="page-screen">
      <div className="page-container">
        <Button
          variant="ghost"
          onClick={() => setLocation("/admin/settings")}
          className="page-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к настройкам
        </Button>

        <div className="page-header flex items-center gap-3">
          <Network className="w-8 h-8 text-primary" />
          <div className="flex-1">
            <h1 className="page-title">Интеграция с WeSetup</h1>
            <p className="page-subtitle">
              Все мостики TasksFlow ↔ WeSetup в одном месте: статус, синхронизация, очередь доставок.
            </p>
          </div>
          <div
            className={`hidden sm:inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide ${healthBadgePalette}`}
            title={health?.message || (healthError?.data?.message as string) || ""}
          >
            {healthLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Проверяем
              </>
            ) : healthOk ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Связь работает
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                Связь не работает
              </>
            )}
          </div>
        </div>

        {/* HEALTH PANEL */}
        <div className="content-panel mb-6">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Здоровье связи
          </h2>
          {healthLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Проверяем доступ к WeSetup…
            </div>
          ) : !healthOk ? (
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 text-destructive" />
              <div className="text-sm">
                <div className="font-medium text-destructive">
                  WeSetup недоступен
                </div>
                <div className="text-muted-foreground mt-1">
                  {health?.message || healthError?.data?.message || healthError?.message || "Проверьте URL и tfk_ ключ в «Настройках компании»."}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setLocation("/admin/settings")}
                >
                  Открыть настройки
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={<ClipboardList className="w-4 h-4" />}
                label="Журналов"
                value={health?.journalsCount ?? 0}
              />
              <StatCard
                icon={<Database className="w-4 h-4" />}
                label="Форм"
                value={health?.formsCount ?? 0}
              />
              <StatCard
                icon={<UsersIcon className="w-4 h-4" />}
                label="Сотрудников"
                value={health?.assignableUsersCount ?? 0}
              />
              <StatCard
                icon={<Zap className="w-4 h-4" />}
                label="Привязано"
                value={linksLinked}
                hint={
                  linksPending || linksNoPhone
                    ? `Pending: ${linksPending}, без телефона: ${linksNoPhone}`
                    : undefined
                }
              />
            </div>
          )}
        </div>

        {/* SYNC BUTTONS */}
        <div className="content-panel mb-6">
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            Синхронизация
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Дёргает соответствующий endpoint WeSetup тем же tfk_ ключом, что у компании.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SyncCard
              title="Сотрудники"
              description="WeSetup ↔ TasksFlow по телефону. Параллельно: новые TF-юзеры заводятся в WeSetup как pending invite."
              busy={syncUsers.isPending}
              onClick={() => syncUsers.mutate()}
              disabled={!healthOk}
            />
            <SyncCard
              title="Выполненные задачи"
              description="Pull задач, закрытых в TasksFlow, для зеркалирования cell'ов журнала на стороне WeSetup."
              busy={syncTasks.isPending}
              onClick={() => syncTasks.mutate()}
              disabled={!healthOk}
            />
            <SyncCard
              title="Иерархия руководителей"
              description="ManagerScope (WeSetup) → managedWorkerIds на воркерах (TasksFlow)."
              busy={syncHierarchy.isPending}
              onClick={() => syncHierarchy.mutate()}
              disabled={!healthOk}
            />
            <SyncCard
              title="Задачи на сегодня"
              description="Создаёт пачкой задачи в TasksFlow по всем активным журналам с responsibleUserId."
              busy={bulkAssign.isPending}
              onClick={() => bulkAssign.mutate()}
              disabled={!healthOk}
            />
          </div>
          {lastSyncUsersResult ? (
            <SyncResultBlock
              title="Sync-users результат"
              data={lastSyncUsersResult}
            />
          ) : null}
          {lastSyncTasksResult ? (
            <SyncResultBlock title="Sync-tasks результат" data={lastSyncTasksResult} />
          ) : null}
          {lastSyncHierarchyResult ? (
            <SyncResultBlock
              title="Sync-hierarchy результат"
              data={lastSyncHierarchyResult}
            />
          ) : null}
        </div>

        {/* WEBHOOK QUEUE */}
        <div className="content-panel mb-6">
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <PackageOpen className="w-4 h-4 text-primary" />
            Очередь доставок в WeSetup
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Если WeSetup был временно недоступен, события <code>complete</code> ложатся в очередь и worker ретраит по
            экспоненциальной лестнице (5м/15м/1ч/6ч/24ч).
          </p>
          {queueQuery.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : queue?.migrationNeeded ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-sm">
              Миграция таблицы <code>webhook_deliveries</code> не прогнана. На сервере нужно один раз выполнить{" "}
              <code className="font-mono">tsx script/add-webhook-deliveries.ts</code>.
            </div>
          ) : queue ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={<Loader2 className="w-4 h-4" />}
                  label="В очереди"
                  value={queue.stats.pending}
                  highlight={queue.stats.pending > 0 ? "amber" : undefined}
                />
                <StatCard
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  label="Доставлено"
                  value={queue.stats.delivered}
                />
                <StatCard
                  icon={<XCircle className="w-4 h-4" />}
                  label="Сдалось"
                  value={queue.stats.failed}
                  highlight={queue.stats.failed > 0 ? "red" : undefined}
                />
                <StatCard
                  icon={<AlertTriangle className="w-4 h-4" />}
                  label="Отменено"
                  value={queue.stats.cancelled}
                />
              </div>
              {queue.recentFailed.length > 0 ? (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Последние провалы
                  </div>
                  <div className="space-y-2">
                    {queue.recentFailed.map((f) => (
                      <div
                        key={f.id}
                        className="rounded-lg border bg-muted/40 p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-baseline gap-2 mb-1">
                          <span className="font-semibold">
                            #{f.id} · taskId={f.taskId}
                          </span>
                          <span className="text-muted-foreground">{f.eventType}</span>
                          <span className="ml-auto text-muted-foreground">
                            попыток: {f.attempts} · {formatTs(f.updatedAt)}
                          </span>
                        </div>
                        <div className="font-mono text-destructive break-all">
                          {f.lastError ?? "(пусто)"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  highlight?: "amber" | "red";
}) {
  const palette =
    highlight === "amber"
      ? "border-amber-500/30 bg-amber-500/5"
      : highlight === "red"
      ? "border-destructive/30 bg-destructive/5"
      : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 ${palette}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
      ) : null}
    </div>
  );
}

function SyncCard({
  title,
  description,
  busy,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground mt-1">{description}</div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onClick}
        disabled={busy || disabled}
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Синхронизируем…
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Запустить
          </>
        )}
      </Button>
    </div>
  );
}

function SyncResultBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <details className="mt-4 rounded-lg border bg-muted/40 p-3">
      <summary className="text-xs font-medium cursor-pointer">{title}</summary>
      <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
