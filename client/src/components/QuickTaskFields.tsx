import { useMemo, type ChangeEvent, type RefObject } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { CalendarClock, X, type LucideIcon } from "lucide-react";
import { dueShortcuts, formatDueInput } from "@/lib/task-schedule";
import { getDueStatus, parseDueDateInput } from "@shared/task-visibility";
import { cn } from "@/lib/utils";

/**
 * «Устранить до» разовой задачи: поле даты, у которого подпись — сама
 * кнопка, и быстрые сроки (сегодня … до конца месяца). Пусто — без срока.
 */
export function DueDateQuick({ form }: { form: UseFormReturn<any> }) {
  const value = (useWatch({ control: form.control, name: "dueDateInput" }) as string | undefined) ?? "";
  const shortcuts = useMemo(() => dueShortcuts(), []);
  const label = formatDueInput(value);
  const overdue = label !== null && getDueStatus(parseDueDateInput(value), Math.floor(Date.now() / 1000)).kind === "overdue";
  const set = (next: string) => form.setValue("dueDateInput", next, { shouldDirty: true });

  return (
    <div className="due-quick">
      <div className={cn("due-quick-field", label && "has-value")}>
        <CalendarClock aria-hidden className="due-quick-icon" />
        <span className={cn("due-quick-text", !label && "is-placeholder")}>
          {label ? `Устранить до ${label}` : "Устранить до"}
        </span>
        {/* Невидимое поле даты поверх подписи: касание открывает системный календарь. */}
        <input
          type="date"
          value={value}
          onChange={(e) => set(e.target.value)}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* Старые браузеры: календарь откроется сам по касанию. */
            }
          }}
          aria-label="Устранить до"
          className="due-quick-input"
          data-testid="input-due-date"
        />
        {value && (
          <button type="button" className="due-quick-clear" onClick={() => set("")} aria-label="Убрать срок" title="Убрать срок">
            <X aria-hidden />
          </button>
        )}
      </div>
      <div className="due-quick-chips" role="group" aria-label="Быстрый срок">
        {shortcuts.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={value === s.value}
            onClick={() => set(value === s.value ? "" : s.value)}
            className="due-quick-chip"
            data-testid={`due-${s.key}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {overdue && <p className="quick-task-hint quick-task-hint--error">Дата уже прошла — задача сразу будет «Просрочено»</p>}
    </div>
  );
}

/** Место под фото у задачи: кнопка «добавить» или миниатюра с «убрать». */
export function PhotoSlot({
  id,
  title,
  hint,
  icon: Icon,
  preview,
  inputRef,
  onSelect,
  onRemove,
}: {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  preview: string | null;
  inputRef: RefObject<HTMLInputElement>;
  onSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={onSelect} className="hidden" id={id} data-testid={id} />
      {preview ? (
        <div className="photo-slot">
          <img src={preview} alt={title} />
          <div className="photo-slot-text">
            <b>{title}</b>
            <span>{hint}</span>
          </div>
          <button type="button" onClick={onRemove} className="photo-slot-remove" aria-label="Убрать фото" title="Убрать фото">
            <X aria-hidden />
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="photo-slot-add">
          <Icon aria-hidden />
          <span>{title}</span>
          <small>необязательно</small>
        </label>
      )}
    </>
  );
}
