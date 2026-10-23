import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  ChefHat,
  Factory,
  ShieldCheck,
  ShoppingBag,
  SprayCan,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { api } from "@shared/routes";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import { useUsers } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { plural } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { formatWeekDaysShort } from "@/lib/week-days";
import {
  TASK_TEMPLATE_INDUSTRIES,
  createTemplateTasks,
  getTaskTemplateIndustry,
  type TaskTemplate,
  type TaskTemplateIndustryId,
  type TemplateTaskFailure,
} from "@/lib/task-templates";

const INDUSTRY_ICONS: Record<TaskTemplateIndustryId, LucideIcon> = {
  cleaning: SprayCan,
  food: ChefHat,
  retail: ShoppingBag,
  service: Wrench,
  logistics: Truck,
  security: ShieldCheck,
  manufacturing: Factory,
};

/** «Создать 1 задачу», «Создать 3 задачи», «Создать 10 задач». */
const tasksAccusative = (n: number) => `${n} ${plural(n, "задачу", "задачи", "задач")}`;

function scheduleLabel(template: TaskTemplate): string {
  return template.weekDays ? formatWeekDaysShort(template.weekDays) : "Каждый день";
}

type Step = "industry" | "tasks";

/**
 * «Из шаблона»: отрасль → галочки (по умолчанию все) → исполнитель →
 * «Создать N задач». Задачи создаются тем же POST /api/tasks по одной;
 * что не создалось, остаётся в окне с причиной и кнопкой повтора.
 */
export function TaskTemplatesDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Все выбранные задачи созданы — например, вернуться к списку. */
  onCreated?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users = [], isLoading: usersLoading, isError: usersError, refetch: retryUsers } = useUsers();

  const [step, setStep] = useState<Step>("industry");
  const [industryId, setIndustryId] = useState<TaskTemplateIndustryId | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [workerId, setWorkerId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState<TemplateTaskFailure[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const stepChanged = useRef(false);

  const industry = industryId ? getTaskTemplateIndustry(industryId) : undefined;
  const chosen = useMemo(
    () => (industry ? industry.tasks.filter((_, index) => selected.has(index)) : []),
    [industry, selected],
  );

  // Закрытое окно начинает заново; если исполнитель один — он и выбран.
  useEffect(() => {
    if (open) return;
    setStep("industry");
    setIndustryId(null);
    setSelected(new Set());
    setFailures([]);
    setProgress({ done: 0, total: 0 });
    stepChanged.current = false;
  }, [open]);
  useEffect(() => {
    if (!workerId && users.length === 1) setWorkerId(String(users[0].id));
  }, [users, workerId]);

  // Смена шага уносит фокус вместе с нажатой кнопкой: возвращаем его на
  // заголовок шага и показываем новый шаг с начала.
  useEffect(() => {
    if (!stepChanged.current) return;
    contentRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, industryId]);

  const goToStep = (next: Step, nextIndustry: TaskTemplateIndustryId | null) => {
    stepChanged.current = true;
    setFailures([]);
    setIndustryId(nextIndustry);
    if (nextIndustry) {
      const found = getTaskTemplateIndustry(nextIndustry);
      setSelected(new Set(found ? found.tasks.map((_, index) => index) : []));
    }
    setStep(next);
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const allSelected = industry ? selected.size === industry.tasks.length : false;
  const assignee = users.find((u) => String(u.id) === workerId);

  const run = async (templates: readonly TaskTemplate[]) => {
    if (!assignee || templates.length === 0 || running) return;
    setRunning(true);
    setFailures([]);
    setProgress({ done: 0, total: templates.length });
    const result = await createTemplateTasks(
      templates,
      assignee.id,
      (payload) => apiRequest("POST", api.tasks.create.path, payload),
      (done, total) => setProgress({ done, total }),
    );
    setRunning(false);
    if (result.created > 0) {
      await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    }
    if (result.failures.length === 0) {
      toast({
        title: result.created === 1 ? "Задача создана" : `Создано задач: ${result.created}`,
        description: `Назначено: ${assignee.name || assignee.phone || "сотрудник"}`,
      });
      onOpenChange(false);
      onCreated?.();
      return;
    }
    // Созданные снимаем с галочек: «Повторить» отправит только упавшие.
    const failedTitles = new Set(result.failures.map((f) => f.template.title));
    setSelected(new Set(
      (industry?.tasks ?? [])
        .map((t, index) => (failedTitles.has(t.title) ? index : -1))
        .filter((index) => index >= 0),
    ));
    setFailures(result.failures);
    toast({
      title: result.created > 0 ? "Создано с ошибками" : "Задачи не созданы",
      description: `Успешно: ${result.created}, ошибок: ${result.failures.length}`,
      variant: "destructive",
    });
  };

  const title = step === "tasks" && industry ? industry.name : "Задачи из шаблона";
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next); }}>
      <DialogContent ref={contentRef} className="templates-dialog max-w-xl">
        <div className="templates-body">
          <div ref={headingRef} tabIndex={-1} className="templates-head">
            {step === "tasks" ? (
              <button
                type="button"
                className="templates-back"
                onClick={() => goToStep("industry", null)}
                disabled={running}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Отрасли
              </button>
            ) : null}
            <DialogTitle className="templates-title">{title}</DialogTitle>
            <DialogDescription className="templates-subtitle">
              {step === "industry"
                ? "Готовый набор задач на смену. Выберите отрасль — лишнее уберёте галочками."
                : "Отметьте нужные задачи и выберите, кому их назначить. Расписание и премию можно поменять потом."}
            </DialogDescription>
          </div>

          {step === "industry" ? (
            <div className="templates-industries">
              {TASK_TEMPLATE_INDUSTRIES.map((item) => {
                const Icon = INDUSTRY_ICONS[item.id];
                const withPhoto = item.tasks.filter((t) => t.requiresPhoto).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="templates-industry"
                    onClick={() => goToStep("tasks", item.id)}
                  >
                    <span className="templates-industry-icon" aria-hidden="true"><Icon /></span>
                    <span className="templates-industry-name">{item.name}</span>
                    <span className="templates-industry-meta">
                      {item.tasks.length} {plural(item.tasks.length, "задача", "задачи", "задач")} · {withPhoto} с фото
                    </span>
                  </button>
                );
              })}
            </div>
          ) : industry ? (
            <>
              {failures.length > 0 ? (
                <div className="templates-failures" role="alert">
                  <p className="templates-failures-title">Не создано: {failures.length}</p>
                  <ul>
                    {failures.map((f) => (
                      <li key={f.template.title}>
                        <b>{f.template.title}</b>
                        <span>{f.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="templates-toolbar">
                <span>
                  Выбрано <b>{selected.size}</b> из {industry.tasks.length}
                </span>
                <button
                  type="button"
                  className="templates-toggle-all"
                  onClick={() =>
                    setSelected(allSelected ? new Set() : new Set(industry.tasks.map((_, index) => index)))
                  }
                  disabled={running}
                >
                  {allSelected ? "Снять все" : "Выбрать все"}
                </button>
              </div>

              <ul className="templates-list">
                {industry.tasks.map((template, index) => {
                  const checked = selected.has(index);
                  return (
                    <li key={template.title}>
                      {/* Строка — сама чекбокс: вложенный radix Checkbox (тоже
                          <button>) внутри кнопки ломал бы разметку и фокус. */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        className="templates-item"
                        data-checked={checked}
                        onClick={() => toggle(index)}
                        disabled={running}
                      >
                        <span className="templates-check" aria-hidden="true">
                          {checked ? <Check /> : null}
                        </span>
                        <span className="templates-item-text">
                          <span className="templates-item-title">{template.title}</span>
                          <span className="templates-item-desc">{template.description}</span>
                          <span className="templates-item-meta">
                            <span>{template.category}</span>
                            <span>{scheduleLabel(template)}</span>
                            {template.requiresPhoto ? (
                              <span className="templates-item-photo">
                                <Camera aria-hidden="true" />
                                Фото
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="templates-footer">
                <div className="templates-assignee">
                  <label className="templates-label" id="templates-assignee-label">Кому назначить</label>
                  {usersError && users.length === 0 ? (
                    <QueryError
                      compact
                      onRetry={() => { void retryUsers(); }}
                      message="Не удалось загрузить сотрудников."
                    />
                  ) : (
                    <Select value={workerId} onValueChange={setWorkerId} disabled={running || usersLoading}>
                      <SelectTrigger aria-labelledby="templates-assignee-label" className="templates-select">
                        <SelectValue placeholder={usersLoading ? "Загружаем сотрудников…" : "Выберите сотрудника"} />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {(u.name || u.phone || u.email || `#${u.id}`) + (u.id === user?.id ? " (вы)" : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {running ? (
                  <div
                    className="templates-progress"
                    role="progressbar"
                    aria-label="Создание задач"
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={progress.done}
                    aria-valuetext={`Создано ${progress.done} из ${progress.total}`}
                  >
                    <span style={{ transform: `scaleX(${percent / 100})` }} />
                  </div>
                ) : null}

                <Button
                  type="button"
                  className="templates-submit"
                  onClick={() => { void run(chosen); }}
                  disabled={!assignee || chosen.length === 0}
                  loading={running}
                  loadingLabel={`Создаём ${Math.min(progress.done + 1, progress.total)} из ${progress.total}…`}
                >
                  {failures.length > 0 ? `Повторить ${tasksAccusative(chosen.length)}` : `Создать ${tasksAccusative(chosen.length)}`}
                </Button>
                {!assignee && !usersLoading && !(usersError && users.length === 0) ? (
                  <p className="templates-hint">Выберите исполнителя — без него задачи не создать.</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
