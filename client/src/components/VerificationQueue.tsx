import { useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck, Loader2 } from "lucide-react";
import {
  useAwaitingVerification,
  useVerifyTask,
} from "@/hooks/use-verification-queue";
import { useUsers } from "@/hooks/use-users";
import type { Task } from "@shared/schema";

/**
 * Phase 4 двухстадийной верификации (employee → verifier → done).
 *
 * Inline-секция в Dashboard'е для verifier'а (или admin'a). Показывает
 * список задач, ждущих проверки. Verifier нажимает «Принять» — задача
 * закрывается и идёт credit balance + WeSetup-mirror; «Отклонить» — с
 * причиной, и задача снова видна сотруднику с пометкой rejectReason.
 *
 * Если задач нет — компонент рендерит null (не маячит пустотой).
 */
export function VerificationQueue() {
  const { data: tasks = [], isLoading } = useAwaitingVerification();
  const { data: users = [] } = useUsers();
  const verifyMut = useVerifyTask();
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  if (isLoading) return null;
  if (!tasks.length) return null;

  function getWorkerName(workerId: number | null): string {
    if (!workerId) return "—";
    const u = users.find((x) => x.id === workerId);
    return u?.name?.trim() || u?.phone || "—";
  }

  async function handleApprove(task: Task) {
    try {
      await verifyMut.mutateAsync({ taskId: task.id, decision: "approve" });
    } catch (err) {
      alert(
        "Не удалось принять: " +
          (err instanceof Error ? err.message : "ошибка"),
      );
    }
  }

  async function handleConfirmReject(task: Task) {
    if (!rejectReason.trim()) {
      alert("Укажите причину");
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
      alert(
        "Не удалось отклонить: " +
          (err instanceof Error ? err.message : "ошибка"),
      );
    }
  }

  return (
    <section className="verification-queue">
      <div className="verification-queue-header">
        <ClipboardCheck className="w-5 h-5" />
        <h2 className="verification-queue-title">На проверке</h2>
        <span className="verification-queue-count">{tasks.length}</span>
      </div>

      <div className="verification-queue-body">
        {tasks.map((task) => {
          const isRejecting = rejectingTaskId === task.id;
          return (
            <div key={task.id} className="verification-queue-item">
              <div className="verification-queue-item-info">
                <div className="verification-queue-item-title">
                  {task.title}
                </div>
                <div className="verification-queue-item-meta">
                  Выполнил: <b>{getWorkerName(task.workerId)}</b>
                  {(task as { category?: string }).category ? (
                    <> · {(task as { category?: string }).category}</>
                  ) : null}
                </div>
              </div>

              {isRejecting ? (
                <div className="verification-queue-reject">
                  <input
                    autoFocus
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Причина отказа"
                    className="verification-queue-reject-input"
                  />
                  <button
                    type="button"
                    onClick={() => handleConfirmReject(task)}
                    disabled={verifyMut.isPending}
                    className="verification-queue-btn verification-queue-btn--reject"
                  >
                    Отклонить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingTaskId(null);
                      setRejectReason("");
                    }}
                    disabled={verifyMut.isPending}
                    className="verification-queue-btn verification-queue-btn--cancel"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <div className="verification-queue-actions">
                  <button
                    type="button"
                    onClick={() => handleApprove(task)}
                    disabled={verifyMut.isPending}
                    className="verification-queue-btn verification-queue-btn--approve"
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
                    className="verification-queue-btn verification-queue-btn--reject-open"
                    title="Отклонить — задача вернётся сотруднику с указанной причиной"
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
    </section>
  );
}
