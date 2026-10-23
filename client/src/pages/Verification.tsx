import { QueryError } from "@/components/QueryError";
import { PageSkeleton, ListSkeleton } from "@/components/PageSkeleton";
import { PhotoViewer, type ViewerPhoto } from "@/components/PhotoViewer";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Expand,
  ImageOff,
  Inbox,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useAwaitingVerification,
  useVerifyTask,
} from "@/hooks/use-verification-queue";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getUserInitials } from "@/lib/user-display";
import { avatarTone } from "@/lib/shift-summary";
import {
  collectTaskPhotos,
  getExamplePhotos,
  nextTaskIdAfter,
  reviewHotkey,
} from "@/lib/verification-review";
import type { Task } from "@shared/schema";

/**
 * «На проверке» — рабочее место проверяющего. Одна задача крупно:
 * эталон рядом с фото сотрудника, лента всех фото с полноэкранным
 * просмотром, «Принять» / «Вернуть» с причиной. Справа (на телефоне —
 * ниже) очередь. После решения фокус переходит на следующую задачу,
 * на desktop работают A / R и ← / →.
 *
 * Очередь — тот же GET /api/tasks/awaiting-verification (polling 30 c),
 * решение — POST /api/tasks/:id/verify.
 */

const QUICK_REASONS = ["Не видно результата на фото", "Сделано не полностью", "Фото не с этого объекта"];

export default function VerificationPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: tasks = [], isLoading, isError, refetch } = useAwaitingVerification();
  const { data: users = [] } = useUsers();
  const verifyMut = useVerifyTask();
  const { toast } = useToast();

  // Решённые скрываем сразу, не дожидаясь перезапроса очереди. Как только
  // сервер перестал их возвращать, id отпускаем — повторно отправленная
  // после исправления задача должна снова появиться.
  const [decided, setDecided] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    setDecided((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(tasks.map((t) => t.id));
      const next = new Set(Array.from(prev).filter((id) => present.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);
  const queue = useMemo(() => tasks.filter((t) => !decided.has(t.id)), [tasks, decided]);

  const [currentId, setCurrentId] = useState<number | null>(null);
  const current = queue.find((t) => t.id === currentId) ?? queue[0] ?? null;
  const position = current ? queue.indexOf(current) + 1 : 0;

  // Форма возврата и выбранное фото привязаны к id задачи: следующая
  // задача сразу открывается чистой, без кадра со старой формой (в этот
  // кадр нажатая A игнорировалась бы как «идёт набор причины»).
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const rejecting = current !== null && rejectFor === current.id;
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [factPick, setFactPick] = useState<{ taskId: number; index: number } | null>(null);
  const factIndex = current && factPick?.taskId === current.id ? factPick.index : 0;
  const setFactIndex = (index: number) => {
    if (current) setFactPick({ taskId: current.id, index });
  };
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; index: number } | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  // Счётчик за визит: decided очищается после перезапроса, а заголовок
  // «Всё проверено» не должен через секунду смениться на «Очередь пуста».
  const [reviewedCount, setReviewedCount] = useState(0);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const emptyRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const moveFocus = useRef(false);

  const photos = useMemo(() => (current ? collectTaskPhotos(current) : []), [current]);
  const examples = useMemo(() => (current ? getExamplePhotos(current) : []), [current]);

  // После решения или выбора в очереди фокус и прокрутка переезжают на
  // заголовок новой текущей задачи (или пустого состояния).
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const target = current ? headingRef.current : emptyRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [current?.id]);

  const select = (id: number | null) => {
    moveFocus.current = true;
    setCurrentId(id);
  };
  const step = (delta: number) => {
    if (!current || queue.length < 2) return;
    const index = queue.indexOf(current);
    select(queue[(index + delta + queue.length) % queue.length].id);
  };

  function workerOf(task: Task) {
    const u = task.workerId ? users.find((x) => x.id === task.workerId) : undefined;
    return { user: u, name: u?.name?.trim() || u?.phone || "Не назначен" };
  }

  const startReject = () => {
    if (!current || pending) return;
    if (!rejecting) {
      setRejectFor(current.id);
      setReason("");
    }
    setReasonError(null);
    requestAnimationFrame(() => reasonRef.current?.focus());
  };
  const cancelReject = () => {
    setRejectFor(null);
    setReason("");
    setReasonError(null);
  };

  async function decide(decision: "approve" | "reject") {
    if (!current || pending) return;
    const text = reason.trim();
    if (decision === "reject" && !text) {
      setReasonError("Напишите, что исправить — сотрудник увидит это в задаче.");
      reasonRef.current?.focus();
      return;
    }
    const task = current;
    const ids = queue.map((t) => t.id);
    setPending(decision);
    try {
      await verifyMut.mutateAsync({
        taskId: task.id,
        decision,
        reason: decision === "reject" ? text : undefined,
      });
      setDecided((prev) => new Set(prev).add(task.id));
      setLastAction(`${decision === "approve" ? "Принято" : "Возвращено"}: «${task.title}»`);
      setReviewedCount((n) => n + 1);
      select(nextTaskIdAfter(ids, task.id));
    } catch (err) {
      toast({
        title: decision === "approve" ? "Не удалось принять" : "Не удалось вернуть",
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
      // 409 — задачу уже решил другой проверяющий: обновим очередь.
      void refetch();
    } finally {
      setPending(null);
    }
  }

  // Горячие клавиши. Пока открыт просмотр фото или идёт набор причины,
  // reviewHotkey их пропускает.
  const hotkeys = useRef({ decide, startReject, step, rejecting, current });
  hotkeys.current = { decide, startReject, step, rejecting, current };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = reviewHotkey(event);
      const h = hotkeys.current;
      if (!action || !h.current) return;
      if (action === "approve" && h.rejecting) return;
      event.preventDefault();
      if (action === "approve") void h.decide("approve");
      else if (action === "reject") h.startReject();
      else h.step(action === "next" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (authLoading) return <PageSkeleton />;
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Войдите в аккаунт</p>
          <Button onClick={() => setLocation("/")}>На главную</Button>
        </div>
      </div>
    );
  }

  const fact = photos[Math.min(factIndex, Math.max(photos.length - 1, 0))];
  const openFact = (index: number) => setViewer({ photos, index });
  const openExample = (index: number) =>
    setViewer({ photos: examples.map((url, i) => ({ url, label: examples.length > 1 ? `Эталон ${i + 1}` : "Эталон" })), index });

  return (
    <div className="page-screen">
      <div className="page-container page-container--wide">
        <Button
          variant="ghost"
          onClick={() => setLocation("/dashboard")}
          className="page-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>

        <div className="page-header flex items-center gap-3">
          <div className="page-icon">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="page-title">На проверке</h1>
            <p className="page-subtitle">
              Сравните фото с эталоном и примите задачу или верните её с причиной.
            </p>
          </div>
          {queue.length > 0 ? (
            <div className="verify-page-counter" aria-label={`В очереди: ${queue.length}`}>
              <span>{queue.length}</span>
            </div>
          ) : null}
        </div>

        <p className="verify-last" role="status">{lastAction ?? ""}</p>

        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : isError && tasks.length === 0 ? (
          <QueryError onRetry={() => { void refetch(); }} message="Не удалось загрузить очередь на проверку." />
        ) : !current ? (
          <div className="content-panel">
            <div className="empty-state">
              <div className="empty-state-icon">
                <Inbox className="w-8 h-8" />
              </div>
              <h2 ref={emptyRef} tabIndex={-1} className="empty-state-title">
                {reviewedCount > 0 ? "Всё проверено" : "Очередь пуста"}
              </h2>
              <p className="empty-state-text">
                {reviewedCount > 0
                  ? `Проверено задач: ${reviewedCount}. Новые появятся здесь сами — список обновляется каждые 30 секунд.`
                  : "Задача появляется здесь, когда сотрудник нажимает «Готово», а вы указаны проверяющим. Список обновляется сам каждые 30 секунд."}
              </p>
              <button
                type="button"
                onClick={() => setLocation("/dashboard")}
                className="empty-state-button-secondary"
              >
                <ClipboardCheck className="w-5 h-5" />
                Мои задачи
              </button>
            </div>
          </div>
        ) : (
          <div className="verify-layout">
            <section className="verify-review content-panel" aria-labelledby="verify-current-title">
              <header className="verify-review-head">
                <div className="min-w-0">
                  <p className="verify-review-step">Задача {position} из {queue.length}</p>
                  <h2 id="verify-current-title" ref={headingRef} tabIndex={-1} className="verify-review-title">
                    {current.title}
                  </h2>
                  <p className="verify-review-meta">
                    {(() => {
                      const w = workerOf(current);
                      return (
                        <span className="verify-review-worker">
                          <span className="worker-avatar" data-tone={avatarTone(current.workerId) ?? undefined} aria-hidden="true">
                            {getUserInitials(w.user)}
                          </span>
                          {w.name}
                        </span>
                      );
                    })()}
                    {current.category ? <span>{current.category}</span> : null}
                    {current.price > 0 ? <span className="verify-review-bonus">{current.price} ₽</span> : null}
                  </p>
                </div>
                {queue.length > 1 ? (
                  <div className="verify-pager">
                    <button type="button" onClick={() => step(-1)} aria-label="Предыдущая задача" aria-keyshortcuts="ArrowLeft">
                      <ChevronLeft aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => step(1)} aria-label="Следующая задача" aria-keyshortcuts="ArrowRight">
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </header>

              {current.description ? <p className="verify-review-desc">{current.description}</p> : null}

              <div className="verify-compare" data-with-example={examples.length > 0 || undefined}>
                {examples.length > 0 ? (
                  <figure className="verify-shot verify-shot--example">
                    <figcaption>Эталон</figcaption>
                    <button type="button" className="verify-shot-frame" onClick={() => openExample(0)} aria-label="Открыть эталон на весь экран">
                      <img src={examples[0]} alt="Эталон: как должно быть" loading="lazy" />
                    </button>
                  </figure>
                ) : null}
                <figure className="verify-shot verify-shot--fact">
                  <figcaption>
                    Факт{photos.length > 1 ? <span> · {Math.min(factIndex, photos.length - 1) + 1} из {photos.length}</span> : null}
                  </figcaption>
                  {fact ? (
                    <button
                      type="button"
                      className="verify-shot-frame"
                      onClick={() => openFact(Math.min(factIndex, photos.length - 1))}
                      aria-label="Открыть фото сотрудника на весь экран"
                    >
                      <img src={fact.url} alt={`Фото сотрудника: ${fact.label}`} />
                      <span className="verify-shot-expand" aria-hidden="true"><Expand /></span>
                    </button>
                  ) : (
                    <div className="verify-shot-empty">
                      <ImageOff aria-hidden="true" />
                      <span>{current.requiresPhoto ? "Фото обязательно, но его нет" : "Сотрудник не прикладывал фото"}</span>
                    </div>
                  )}
                  {examples.length === 0 && fact ? (
                    <span className="verify-shot-note">Эталон не задан — сравнить не с чем</span>
                  ) : null}
                </figure>
              </div>

              {photos.length > 1 ? (
                <div className="verify-strip" aria-label="Все фото задачи">
                  {photos.map((photo, index) => (
                    <button
                      key={photo.url}
                      type="button"
                      className="verify-thumb"
                      aria-pressed={index === factIndex}
                      aria-label={`${photo.label}: показать рядом с эталоном`}
                      onClick={() => setFactIndex(index)}
                      onDoubleClick={() => openFact(index)}
                    >
                      <img src={photo.url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : null}

              {rejecting ? (
                <div className="verify-reject">
                  <label htmlFor="verify-reason" className="verify-reject-label">Что исправить</label>
                  <div className="verify-reasons">
                    {QUICK_REASONS.map((text) => (
                      <button key={text} type="button" className="verify-reason-chip" onClick={() => { setReason(text); setReasonError(null); reasonRef.current?.focus(); }}>
                        {text}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    id="verify-reason"
                    ref={reasonRef}
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(null); }}
                    placeholder="Например: на фото не видно пол под столами"
                    // Сервер обрежет до 1000 — без maxLength часть текста пропала бы молча.
                    maxLength={1000}
                    rows={3}
                    aria-invalid={reasonError ? true : undefined}
                    aria-describedby={reasonError ? "verify-reason-error" : undefined}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void decide("reject"); }
                      if (e.key === "Escape") { e.preventDefault(); cancelReject(); }
                    }}
                  />
                  {reasonError ? <p id="verify-reason-error" className="verify-reject-error" role="alert">{reasonError}</p> : null}
                  <div className="verify-actions">
                    <Button type="button" variant="outline" onClick={cancelReject} disabled={pending !== null}>
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => { void decide("reject"); }}
                      loading={pending === "reject"}
                      loadingLabel="Возвращаем…"
                    >
                      <Undo2 aria-hidden="true" />
                      Вернуть сотруднику
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="verify-actions">
                  <Button
                    type="button"
                    className="verify-approve"
                    onClick={() => { void decide("approve"); }}
                    disabled={pending !== null && pending !== "approve"}
                    loading={pending === "approve"}
                    loadingLabel="Принимаем…"
                    aria-keyshortcuts="A"
                    title="Принять — задача закрыта, премия начислена"
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Принять
                    <kbd aria-hidden="true">A</kbd>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="verify-return"
                    onClick={startReject}
                    disabled={pending !== null}
                    aria-keyshortcuts="R"
                    title="Вернуть — задача снова у сотрудника с вашей причиной"
                  >
                    <Undo2 aria-hidden="true" />
                    Вернуть
                    <kbd aria-hidden="true">R</kbd>
                  </Button>
                </div>
              )}
              <p className="verify-hotkeys" aria-hidden="true">
                <kbd>A</kbd> принять · <kbd>R</kbd> вернуть · <kbd>←</kbd> <kbd>→</kbd> соседняя задача
              </p>

              {/* Чек-лист — под кнопками: решение принимают по фото, а
                  кнопки должны помещаться на экран без прокрутки. */}
              {(current.checklist ?? []).length > 0 ? (
                <ul className="verify-checklist" aria-label="Чек-лист">
                  {(current.checklist ?? []).map((item) => (
                    <li key={item.id} data-done={item.done || undefined}>
                      {item.done ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                      <span>{item.title}</span>
                      {item.photoUrls?.length ? (
                        <span className="verify-checklist-photos"><Camera aria-hidden="true" />{item.photoUrls.length}</span>
                      ) : null}
                      <span className="sr-only">{item.done ? "выполнено" : "не отмечено"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <aside className="verify-queue" aria-label="Очередь на проверку">
              <p className="verify-queue-title">В очереди · {queue.length}</p>
              <ul>
                {queue.map((task) => {
                  const taskPhotos = collectTaskPhotos(task);
                  const thumb = taskPhotos[0]?.url;
                  const count = taskPhotos.length;
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="verify-queue-item"
                        aria-current={task.id === current.id ? "true" : undefined}
                        onClick={() => select(task.id)}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" loading="lazy" />
                        ) : (
                          <span className="verify-queue-noimg" aria-hidden="true"><ImageOff /></span>
                        )}
                        <span className="verify-queue-text">
                          <span className="verify-queue-name">{task.title}</span>
                          <span className="verify-queue-worker">{workerOf(task).name}</span>
                        </span>
                        {count > 0 ? (
                          <span className="verify-queue-count" aria-label={`фото: ${count}`}><Camera aria-hidden="true" />{count}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>
          </div>
        )}
      </div>

      <PhotoViewer
        photos={viewer?.photos ?? []}
        index={viewer?.index ?? 0}
        open={viewer !== null}
        onOpenChange={(open) => { if (!open) setViewer(null); }}
        onIndexChange={(index) => {
          setViewer((prev) => (prev ? { ...prev, index } : prev));
          // Листая фото сотрудника, держим то же фото и рядом с эталоном.
          if (viewer && viewer.photos === photos) setFactIndex(index);
        }}
      />
    </div>
  );
}
