import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2 } from "lucide-react";
import { PLAN_IDS, PLANS, type PlanId } from "@shared/plans";
import { useAuth } from "@/contexts/AuthContext";
import { PageSkeleton, ListSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type RootCompany = {
  id: number;
  name: string;
  email: string | null;
  createdAt: number;
  plan: string | null;
  planUntil: number | null;
  effectivePlan: PlanId;
  usersCount: number;
  tasksCount: number;
  lastCompletedAt: number | null;
};

const KEY = ["root-companies"];
const dateInput = (sec: number | null) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : "");
const shortDate = (sec: number | null) => (sec ? new Date(sec * 1000).toLocaleDateString("ru-RU") : "—");

/**
 * Root: компании сервиса и их тарифы. Платёжного шлюза нет — тариф и срок
 * ставятся здесь вручную после оплаты по счёту.
 */
export default function RootCompanies() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const isRoot = !!(user as { isRoot?: boolean } | null)?.isRoot;
  const query = useQuery<{ enforced: boolean; companies: RootCompany[] }>({
    queryKey: KEY,
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError("/api/root/companies", { credentials: "include", signal: withTimeout(signal, 30_000) });
      if (!res.ok) throw new Error("Не удалось загрузить компании");
      return res.json();
    },
    enabled: isRoot,
  });

  if (isLoading) return <PageSkeleton />;
  if (!user) return <Redirect to="/login" />;
  if (!isRoot) return <Redirect to="/dashboard" />;

  return (
    <div className="page-screen">
      <div className="page-container">
        <button type="button" onClick={() => setLocation("/dashboard")} className="page-back group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          К задачам
        </button>
        <div className="page-header flex items-center gap-3">
          <div className="page-icon">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="page-title">Компании</h1>
            <p className="page-subtitle">
              Тарифы клиентов.{" "}
              {query.data?.enforced
                ? "Лимиты включены (PLAN_LIMITS=on)."
                : "Лимиты выключены: тариф только показывается. Включить — PLAN_LIMITS=on в .env сервера."}
            </p>
          </div>
        </div>

        <section className="content-panel">
          {query.isLoading ? (
            <ListSkeleton rows={4} />
          ) : query.isError ? (
            <QueryError onRetry={() => void query.refetch()} />
          ) : (
            <div className="root-companies">
              {(query.data?.companies ?? []).map((c) => (
                <CompanyRow key={c.id} company={c} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CompanyRow({ company }: { company: RootCompany }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [plan, setPlan] = useState<PlanId>((company.plan as PlanId) || "start");
  const [until, setUntil] = useState(dateInput(company.planUntil));
  const save = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/root/companies/${company.id}/plan`, {
        plan,
        until: plan === "start" || !until ? null : Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: `«${company.name}»: тариф «${PLANS[plan].name}»` });
    },
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });
  const limit = PLANS[company.effectivePlan].maxUsers;
  const over = limit !== null && company.usersCount > limit;
  const dirty = plan !== ((company.plan as PlanId) || "start") || until !== dateInput(company.planUntil);

  return (
    <article className="root-company">
      <div className="root-company-main">
        <p className="root-company-name">{company.name}</p>
        <p className="root-company-meta">
          <span>#{company.id}</span>
          {company.email && <span>{company.email}</span>}
          <span>с {shortDate(company.createdAt)}</span>
          <span className={over ? "text-destructive font-medium" : undefined}>
            людей: {company.usersCount}
            {limit !== null ? ` из ${limit}` : ""}
          </span>
          <span>задач: {company.tasksCount}</span>
          <span>последнее выполнение: {shortDate(company.lastCompletedAt)}</span>
        </p>
      </div>
      <div className="root-company-plan">
        <select className="reports-select" aria-label={`Тариф: ${company.name}`} value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
          {PLAN_IDS.map((id) => (
            <option key={id} value={id}>
              {PLANS[id].name}
            </option>
          ))}
        </select>
        {plan !== "start" && (
          <input
            type="date"
            className="schedule-time"
            aria-label={`Действует до: ${company.name}`}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            title="Пусто — бессрочно"
          />
        )}
        <Button type="button" size="sm" disabled={!dirty} loading={save.isPending} loadingLabel="…" onClick={() => save.mutate()}>
          Сохранить
        </Button>
      </div>
    </article>
  );
}
