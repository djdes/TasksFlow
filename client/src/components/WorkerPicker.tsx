import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search, UserRound, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckMark } from "@/components/ui/check-mark";
import { cn } from "@/lib/utils";
import { orderByRecent, readRecentWorkers, rememberRecentWorkers } from "@/lib/task-suggestions";

export type PickerUser = { id: number; name?: string | null; phone?: string | null; position?: string | null };

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
const nameOf = (u: PickerUser) => u.name || u.phone || `#${u.id}`;

/** Поиск по имени, должности и телефону (цифры без +, пробелов и скобок). */
export function filterPickerUsers<T extends PickerUser>(users: readonly T[], query: string): T[] {
  const q = norm(query);
  if (!q) return [...users];
  const digits = q.replace(/\D/g, "");
  return users.filter((u) => {
    if (norm(`${u.name ?? ""} ${u.position ?? ""}`).includes(q)) return true;
    return digits.length >= 3 && (u.phone ?? "").replace(/\D/g, "").includes(digits);
  });
}

/** «Анна», «Анна и Денис», «Анна, Денис +3». */
export function pickerSummary(selected: readonly PickerUser[]): string {
  if (selected.length === 0) return "";
  if (selected.length === 1) return nameOf(selected[0]);
  if (selected.length === 2) return `${nameOf(selected[0])} и ${nameOf(selected[1])}`;
  return `${nameOf(selected[0])}, ${nameOf(selected[1])} +${selected.length - 2}`;
}

/**
 * Выпадающий список сотрудников с поиском и галочками. Подпись поля —
 * placeholder в самой кнопке («Ответственный»), отдельного заголовка нет.
 * Строки — кнопки с role="checkbox" и рисунком CheckMark: radix Checkbox
 * внутри <button> роняет окно («Maximum update depth»).
 */
export function WorkerPicker({
  users,
  value,
  onChange,
  placeholder = "Ответственный",
  invalid = false,
}: {
  users: readonly PickerUser[];
  value: readonly number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => users.filter((u) => value.includes(u.id)), [users, value]);
  // Недавно выбранные — сверху (пока ищут — как нашлось). Порядок меняется
  // только после закрытия списка, чтобы строки не прыгали под пальцем.
  const [recent, setRecent] = useState(readRecentWorkers);
  const visible = useMemo(
    () => (query.trim() ? filterPickerUsers(users, query) : orderByRecent(users, recent)),
    [users, query, recent],
  );
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          rememberRecentWorkers(value);
          setRecent(readRecentWorkers());
        }
      }}
    >
      <div className={cn("worker-picker", selected.length > 0 && "has-value")}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn("worker-picker-trigger", invalid && "worker-picker-trigger--invalid")}
            aria-label={selected.length ? `${placeholder}: ${pickerSummary(selected)}` : placeholder}
            aria-invalid={invalid || undefined}
            data-testid="worker-picker"
          >
            <UserRound aria-hidden className="worker-picker-icon" />
            <span className={cn("worker-picker-value", !selected.length && "is-placeholder")}>
              {selected.length ? pickerSummary(selected) : placeholder}
            </span>
            <ChevronDown aria-hidden className="worker-picker-chevron" />
          </button>
        </PopoverTrigger>
        {selected.length > 0 && (
          <button type="button" className="worker-picker-clear" onClick={() => onChange([])} aria-label="Убрать всех" title="Убрать всех">
            <X aria-hidden />
          </button>
        )}
      </div>
      <PopoverContent
        className="worker-picker-panel"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onOpenAutoFocus={(e) => {
          // На телефоне не выдвигаем клавиатуру сразу: обычно хватает касания по имени.
          e.preventDefault();
          if (window.matchMedia?.("(pointer: fine)").matches) searchRef.current?.focus();
        }}
      >
        {users.length > 6 && (
          <label className="worker-picker-search">
            <Search aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти сотрудника"
              aria-label="Найти сотрудника"
              enterKeyHint="search"
              data-testid="worker-picker-search"
            />
          </label>
        )}
        <div className="worker-picker-tools">
          <span>
            Выбрано <b>{value.length}</b> из {users.length}
          </span>
          <button type="button" onClick={() => onChange(users.map((u) => u.id))} data-testid="select-all-free-workers">
            Все
          </button>
          <button type="button" onClick={() => onChange([])} disabled={!value.length} data-testid="deselect-all-free-workers">
            Никого
          </button>
        </div>
        <div className="worker-picker-list" role="group" aria-label={placeholder}>
          {users.length === 0 ? (
            <p className="worker-picker-empty">В компании пока нет сотрудников</p>
          ) : visible.length === 0 ? (
            <p className="worker-picker-empty">Никого не нашли</p>
          ) : (
            visible.map((u) => {
              const checked = value.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={nameOf(u)}
                  onClick={() => toggle(u.id)}
                  className={cn("worker-picker-row", checked && "is-checked")}
                >
                  <CheckMark checked={checked} />
                  <span className="worker-picker-name">{nameOf(u)}</span>
                  {u.position && <span className="worker-picker-pos">{u.position}</span>}
                </button>
              );
            })
          )}
        </div>
        <button
          type="button"
          className="worker-picker-done"
          onClick={() => {
            setOpen(false);
            setQuery("");
            rememberRecentWorkers(value);
            setRecent(readRecentWorkers());
          }}
        >
          Готово
        </button>
      </PopoverContent>
    </Popover>
  );
}
