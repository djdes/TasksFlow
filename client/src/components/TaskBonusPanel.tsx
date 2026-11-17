import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { monthlyBonus, rub, TASK_BONUS_MAX, TASKS_PER_DAY, WORK_DAYS } from "@shared/task-bonus";

/**
 * «Премия за задачу» в настройках компании: сумма по умолчанию для новых
 * задач и — по желанию — уже созданным задачам без премии. Начисляется
 * сотруднику на баланс, когда задача выполнена (или принята проверяющим).
 */
export function TaskBonusPanel({ company }: { company: { taskBonus?: number | null } }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inputId = useId();
  const saved = company.taskBonus ?? 0;
  const [value, setValue] = useState(saved > 0 ? String(saved) : "");
  const [applyToExisting, setApplyToExisting] = useState(true);
  useEffect(() => setValue(saved > 0 ? String(saved) : ""), [saved]);

  const amount = value.trim() === "" ? 0 : Number(value);
  const valid = Number.isInteger(amount) && amount >= 0 && amount <= TASK_BONUS_MAX;
  const month = valid ? monthlyBonus(amount) : 0;

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/companies/me/task-bonus", { amount, applyToExisting: applyToExisting && amount > 0 });
      return (await res.json()) as { taskBonus: number; open: number; credited: number };
    },
    onSuccess: async (r) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-me"] }),
        queryClient.invalidateQueries({ queryKey: ["companies", "me"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
      ]);
      const parts = [
        r.open > 0 ? `премия у ${r.open} задач` : null,
        r.credited > 0 ? `за сделанные сегодня начислено: ${r.credited}` : null,
      ].filter(Boolean);
      toast({
        title: r.taskBonus > 0 ? `Премия за задачу — ${rub(r.taskBonus)}` : "Премия по умолчанию выключена",
        description: parts.length ? capitalize(parts.join(", ")) : undefined,
      });
    },
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="content-panel" data-testid="task-bonus-panel">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Coins className="w-5 h-5 text-primary" aria-hidden="true" />
        Премия за задачу
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Сотрудник видит «+сумму» у каждой задачи, а выполнил — премия сразу на балансе. Если задача идёт на проверку — после «Принять».
      </p>

      <div className="task-bonus-row">
        <label htmlFor={inputId} className="sr-only">Премия за одну задачу, ₽</label>
        <div className="task-bonus-input">
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            max={TASK_BONUS_MAX}
            step={1}
            placeholder="Например, 30"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="things-input"
            data-testid="task-bonus-input"
          />
          <span aria-hidden>₽ за задачу</span>
        </div>
        <p className="task-bonus-estimate" role="status" aria-live="polite" data-testid="task-bonus-estimate">
          {valid && amount > 0 ? (
            <>
              <span>
                ≈ <b>{rub(month)}</b> в месяц на человека
              </span>
              <small>
                {TASKS_PER_DAY} задач в день × {WORK_DAYS} рабочих дней
              </small>
            </>
          ) : valid ? (
            <small>Пусто или 0 — премию ставите сами у отдельных задач</small>
          ) : (
            <small className="text-destructive">Целое число от 0 до {TASK_BONUS_MAX.toLocaleString("ru-RU")}</small>
          )}
        </p>
      </div>

      {amount > 0 && (
        <label className="mt-4 flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="schedule-check mt-0.5"
            checked={applyToExisting}
            onChange={(e) => setApplyToExisting(e.target.checked)}
            data-testid="task-bonus-apply"
          />
          <span>
            Поставить и уже созданным задачам без премии
            <small className="block text-muted-foreground">
              Задачи с другой суммой не меняются. Регулярные, отмеченные сегодня, получат премию сразу.
            </small>
          </span>
        </label>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          onClick={() => save.mutate()}
          disabled={!valid}
          loading={save.isPending}
          loadingLabel="Сохраняем…"
          data-testid="task-bonus-save"
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
