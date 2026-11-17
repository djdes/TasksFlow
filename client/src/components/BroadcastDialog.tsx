import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Search, Send, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckMark } from "@/components/ui/check-mark";
import { filterPickerUsers, type PickerUser } from "@/components/WorkerPicker";
import { apiRequest } from "@/lib/queryClient";
import { plural } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BROADCAST_PRESETS, BROADCAST_TEXT_MAX, type BroadcastResult } from "@shared/broadcast";
import { canAssignTo, type UserAccess } from "@shared/roles";

const nameOf = (u: PickerUser) => u.name || u.phone || `#${u.id}`;

/**
 * «Отправить уведомление»: руководитель или админ пишет одному или многим
 * сотрудникам — push на телефон и в Telegram. После отправки видно, кому
 * дошло и у кого уведомления не настроены (их надо предупредить лично).
 */
export function BroadcastDialog({
  open,
  onOpenChange,
  users,
  initialIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Кому этот человек может писать (без себя). */
  users: readonly PickerUser[];
  initialIds?: number[];
}) {
  const [ids, setIds] = useState<number[]>(initialIds);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<BroadcastResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setIds(initialIds);
    setText("");
    setQuery("");
    setResult(null);
    // initialIds — новый массив на каждый рендер; сбрасываем только при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = useMemo(() => filterPickerUsers(users, query), [users, query]);
  const allSelected = users.length > 0 && ids.length === users.length;
  const toggle = (id: number) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/send", { userIds: ids, text: text.trim() });
      return (await res.json()) as BroadcastResult;
    },
    onSuccess: setResult,
  });

  const canSend = ids.length > 0 && text.trim().length > 0 && !send.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="broadcast-dialog sm:max-w-lg" data-testid="broadcast-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" aria-hidden />
            Уведомление сотрудникам
          </DialogTitle>
          <DialogDescription>Придёт на телефон и в Telegram — у кого что подключено.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="broadcast-result" role="status">
            {result.delivered.length > 0 && (
              <div className="broadcast-result-block is-ok">
                <p>
                  <CheckCircle2 aria-hidden />
                  Дошло: {result.delivered.length} {plural(result.delivered.length, "человек", "человека", "человек")}
                </p>
                <ul>
                  {result.delivered.map((u) => (
                    <li key={u.id}>
                      {u.name}
                      <small>{u.channels.map((c) => (c === "push" ? "телефон" : "Telegram")).join(" и ")}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.unreachable.length > 0 && (
              <div className="broadcast-result-block is-warn" data-testid="broadcast-unreachable">
                <p>
                  <TriangleAlert aria-hidden />
                  Не дошло: {result.unreachable.length} — уведомления не включены
                </p>
                <ul>
                  {result.unreachable.map((u) => (
                    <li key={u.id}>{u.name}</li>
                  ))}
                </ul>
                <small>
                  Скажите им лично. Чтобы приходило: на iPhone — добавить TasksFlow на экран «Домой» и включить уведомления в «Мой аккаунт»; на любом телефоне — привязать Telegram-бота.
                </small>
              </div>
            )}
            <div className="broadcast-actions">
              <Button type="button" variant="ghost" className="border border-border/50" onClick={() => setResult(null)}>
                Написать ещё
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Готово
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="broadcast-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) send.mutate();
            }}
          >
            <div className="broadcast-people">
              <div className="broadcast-people-head">
                <span>
                  Кому · <b>{ids.length}</b> из {users.length}
                </span>
                <button type="button" onClick={() => setIds(allSelected ? [] : users.map((u) => u.id))} data-testid="broadcast-all">
                  {allSelected ? "Никого" : "Всем"}
                </button>
              </div>
              {users.length > 6 && (
                <label className="worker-picker-search">
                  <Search aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Найти сотрудника"
                    aria-label="Найти сотрудника"
                  />
                </label>
              )}
              <div className="broadcast-people-list" role="group" aria-label="Кому">
                {users.length === 0 ? (
                  <p className="worker-picker-empty">Некому писать: нет сотрудников</p>
                ) : visible.length === 0 ? (
                  <p className="worker-picker-empty">Никого не нашли</p>
                ) : (
                  visible.map((u) => {
                    const checked = ids.includes(u.id);
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
            </div>

            <div className="broadcast-presets" role="group" aria-label="Готовые тексты">
              {BROADCAST_PRESETS.map((p) => (
                <button key={p} type="button" className="due-quick-chip" aria-pressed={text === p} onClick={() => setText(p)}>
                  {p}
                </button>
              ))}
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Текст уведомления"
              aria-label="Текст уведомления"
              maxLength={BROADCAST_TEXT_MAX}
              rows={3}
              className="things-input min-h-[88px] resize-none"
              data-testid="broadcast-text"
            />
            {send.isError && (
              <p className="text-sm text-destructive" role="alert">
                {(send.error as Error).message || "Не удалось отправить"}
              </p>
            )}
            <div className="broadcast-actions">
              <Button type="button" variant="ghost" className="border border-border/50" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={!canSend} loading={send.isPending} loadingLabel="Отправляем…" data-testid="broadcast-send">
                <Send aria-hidden />
                {ids.length > 1 ? `Отправить ${ids.length} ${plural(ids.length, "человеку", "людям", "людям")}` : "Отправить"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Кому можно писать: тем, кому можно ставить задачи, кроме себя (как на сервере). */
export function notifiableUsers<T extends PickerUser>(users: readonly T[], access: UserAccess | null): T[] {
  if (!access || (!access.isAdmin && !access.manageTasks)) return [];
  return users.filter((u) => u.id !== access.userId && canAssignTo(access, u.id));
}
