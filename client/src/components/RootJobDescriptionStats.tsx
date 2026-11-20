/**
 * Root «Компании и тарифы» → «Инструкции → задачи»: учёт правок.
 * Сколько задач создано из должностных инструкций и сколько из них
 * руководители потом удалили или переименовали — по этому видно, где
 * промпт разбора (server/job-description/prompt.ts) ошибается.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchOrFriendlyError } from "@/lib/queryClient";

type Feedback = {
  instructions: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  created: number;
  deleted: number;
  edited: number;
  topDeleted: Array<{ title: string; count: number }>;
  topEdited: Array<{ from: string; to: string }>;
};

const SOURCE_LABEL: Record<string, string> = {
  text: "текст", docx: "Word", xlsx: "Excel", txt: ".txt", pdf: "PDF", position: "по должности", copy: "как у коллеги",
};
const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

/** Ответ сервера по форме; чужой или старый ответ — пустая статистика, а не падение страницы root. */
export function toFeedback(raw: unknown): Feedback {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const counts = (v: unknown): Record<string, number> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === "number")) as Record<string, number>
      : {};
  const list = <T,>(v: unknown, ok: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(ok) : []);
  return {
    instructions: num(o.instructions),
    bySource: counts(o.bySource),
    byStatus: counts(o.byStatus),
    created: num(o.created),
    deleted: num(o.deleted),
    edited: num(o.edited),
    topDeleted: list(o.topDeleted, (x): x is { title: string; count: number } => !!x && typeof (x as { title?: unknown }).title === "string"),
    topEdited: list(o.topEdited, (x): x is { from: string; to: string } => !!x && typeof (x as { from?: unknown }).from === "string" && typeof (x as { to?: unknown }).to === "string"),
  };
}

export function RootJobDescriptionStats() {
  const q = useQuery<Feedback>({
    queryKey: ["/api/admin/job-descriptions/feedback"],
    queryFn: async () => {
      const res = await fetchOrFriendlyError("/api/admin/job-descriptions/feedback", { credentials: "include", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error("Не удалось загрузить статистику");
      return toFeedback(await res.json().catch(() => null));
    },
  });
  const d = q.data;
  return (
    <section className="content-panel jd-stats" aria-labelledby="jd-stats-title" data-testid="root-job-description-stats">
      <h2 id="jd-stats-title" className="section-title flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden />
        Инструкции → задачи
      </h2>
      {q.isLoading ? (
        <div className="skeleton h-20 rounded-xl" aria-busy="true" />
      ) : q.isError || !d ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="alert">
          {(q.error as Error | null)?.message ?? "Нет данных"}
          <Button type="button" variant="outline" size="sm" onClick={() => q.refetch()}>Повторить</Button>
        </div>
      ) : d.instructions === 0 ? (
        <p className="jd-stats-line">Пока ни одной инструкции: статистика появится после первого разбора.</p>
      ) : (
        <>
          <div className="reports-kpis jd-stats-kpis">
            <div className="reports-kpi"><span className="reports-kpi-label">Инструкций</span><span className="reports-kpi-value">{d.instructions}</span></div>
            <div className="reports-kpi"><span className="reports-kpi-label">Задач создано</span><span className="reports-kpi-value">{d.created}</span></div>
            <div className="reports-kpi"><span className="reports-kpi-label">Потом удалили</span><span className="reports-kpi-value">{d.deleted} <small>{pct(d.deleted, d.created)}</small></span></div>
            <div className="reports-kpi"><span className="reports-kpi-label">Переименовали</span><span className="reports-kpi-value">{d.edited} <small>{pct(d.edited, d.created)}</small></span></div>
          </div>
          {Object.keys(d.bySource).length > 0 && (
            <p className="jd-stats-line">
              Откуда: {Object.entries(d.bySource).map(([k, v]) => `${SOURCE_LABEL[k] ?? k} — ${v}`).join(", ")}
              {d.byStatus.failed ? ` · не разобрали: ${d.byStatus.failed}` : ""}
              {d.byStatus.review ? ` · ждут проверки: ${d.byStatus.review}` : ""}
            </p>
          )}
          {d.topDeleted.length > 0 && (
            <div className="jd-stats-list">
              <h3>Чаще всего удаляют</h3>
              <ul>{d.topDeleted.map((t) => <li key={t.title}>{t.title} <small>× {t.count}</small></li>)}</ul>
            </div>
          )}
          {d.topEdited.length > 0 && (
            <div className="jd-stats-list">
              <h3>Как переименовывают</h3>
              <ul>{d.topEdited.map((t, i) => <li key={i}>«{t.from}» → «{t.to}»</li>)}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
