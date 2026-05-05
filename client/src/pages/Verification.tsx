import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Inbox,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAwaitingVerification,
  useVerifyTask,
} from "@/hooks/use-verification-queue";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@shared/schema";

/**
 * Отдельная страница «На проверке» — изолирует workflow заведующей
 * от её личных задач. Раньше очередь была inline-блоком на dashboard'е,
 * выше списка задач, и визуально путалась с «моими задачами».
 *
 * Теперь это специализированный экран:
 *   • Виден список всех submitted задач от подчинённых (или всех
 *     submitted в компании если ты admin)
 *   • Approve / Reject действия в большом, удобном UI
 *   • Auto-refresh каждые 30 секунд через useAwaitingVerification
 *   • Empty state объясняет где такие задачи появляются и кому
 *     назначаются проверяющим.
 *
 * На dashboard'е остаётся тонкая полоска-баннер с счётчиком —
 * заведующая видит «5 на проверке» и нажимает чтобы перейти сюда.
 */

export default function VerificationPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: tasks = [], isLoading } = useAwaitingVerification();
  const { data: users = [] } = useUsers();
  const verifyMut = useVerifyTask();
  const { toast } = useToast();
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
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

  function getWorkerName(workerId: number | null): string {
    if (!workerId) return "—";
    const u = users.find((x) => x.id === workerId);
    return u?.name?.trim() || u?.phone || "—";
  }

  async function handleApprove(task: Task) {
    try {
      await verifyMut.mutateAsync({ taskId: task.id, decision: "approve" });
    } catch (err) {
      toast({
        title: "Не удалось принять",
        description: err instanceof Error ? err.message : "Ошибка",
        variant: "destructive",
      });
    }
  }

  async function handleConfirmReject(task: Task) {
    if (!rejectReason.trim()) {
      toast({
        title: "Укажите причину",
        description: "Сотрудник увидит её и поймёт что исправить",
        variant: "destructive",
      });
      return;
    }
    try {
      await verifyMut.mutateAsync({
        taskId: task.id,
        decision: "reject",
        reason: rejectReason.trim(),
      });
      setRejectingTaskId(null);
      setRejectReason("");
    } catch (err) {
      toast({
        title: "Не удалось отклонить",
        description: err instanceof Error ? err.message : "Ошибка",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="page-screen">
      <div className="page-container">
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
            <ShieldCheck className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="page-title">На проверке</h1>
            <p className="page-subtitle">
              Задачи от подчинённых, ждущие вашего одобрения. Обновляется
              каждые 30 секунд.
            </p>
          </div>
          {tasks.length > 0 ? (
            <div className="verify-page-counter">
              <Clock className="w-4 h-4" />
              <span>{tasks.length}</span>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="content-panel flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="content-panel">
            <div className="empty-state">
              <div className="empty-state-emoji" aria-hidden="true">
                ✅
              </div>
              <div className="empty-state-icon">
                <Inbox className="w-12 h-12 text-muted-foreground" />
              </div>
              <h3 className="empty-state-title">Очередь пуста</h3>
              <p className="empty-state-text">
                Задачи появляются здесь когда сотрудник нажимает «Готово»
                на задаче, у которой вы (или другой управленец) указаны
                проверяющим. Если ждёте задачу, но её нет — проверьте,
                задан ли verifier на стороне WeSetup при создании.
              </p>
              <button
                onClick={() => setLocation("/dashboard")}
                className="empty-state-button-secondary"
              >
                <ClipboardCheck className="w-5 h-5" />
                Мои задачи
              </button>
            </div>
          </div>
        ) : (
          <div className="content-panel !p-0 overflow-hidden">
            <div className="divide-y divide-border">
              {tasks.map((task) => {
                const isRejecting = rejectingTaskId === task.id;
                return (
                  <div key={task.id} className="verify-row">
                    <div className="verify-row-info">
                      <div className="verify-row-title">{task.title}</div>
                      <div className="verify-row-meta">
                        <span className="verify-row-worker">
                          {getWorkerName(task.workerId)}
                        </span>
                        {(task as { category?: string }).category ? (
                          <>
                            <span className="verify-row-dot">·</span>
                            <span>
                              {(task as { category?: string }).category}
                            </span>
                          </>
                        ) : null}
                        {task.price && task.price > 0 ? (
                          <>
                            <span className="verify-row-dot">·</span>
                            <span className="verify-row-bonus">
                              {task.price} ₽
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {isRejecting ? (
                      <div className="verify-row-reject">
                        <input
                          autoFocus
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Причина отказа (увидит сотрудник)"
                          className="verify-row-reject-input"
                          // Сервер всё равно cap'ает до 1000 (см. routes.ts
                          // /verify endpoint), но без maxLength юзер может
                          // ввести 5000 символов и сервер тихо обрежет —
                          // часть его текста просто пропадёт.
                          maxLength={1000}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleConfirmReject(task);
                            if (e.key === "Escape") {
                              setRejectingTaskId(null);
                              setRejectReason("");
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleConfirmReject(task)}
                          disabled={verifyMut.isPending}
                          className="verify-btn verify-btn--reject-confirm"
                        >
                          {verifyMut.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Отклонить"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingTaskId(null);
                            setRejectReason("");
                          }}
                          disabled={verifyMut.isPending}
                          className="verify-btn verify-btn--cancel"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="verify-row-actions">
                        <button
                          type="button"
                          onClick={() => handleApprove(task)}
                          disabled={verifyMut.isPending}
                          className="verify-btn verify-btn--approve"
                          title="Принять — задача закрыта, премия начислена"
                        >
                          {verifyMut.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>Принять</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingTaskId(task.id);
                            setRejectReason("");
                          }}
                          disabled={verifyMut.isPending}
                          className="verify-btn verify-btn--reject"
                          title="Отклонить — задача вернётся сотруднику"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Отклонить</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
