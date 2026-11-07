// Выполнение задачи: «Готово», вернуть, отменить, проверка.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { tasks } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { parseJournalLink } from "@shared/journal-link";
import { isTaskServiceError } from "../services/task-actor";
import { onTaskApproved, onTaskRejected, safely } from "../push/events";
import { accessOf } from "../access";
import { canReviewTask } from "@shared/roles";
import { completeTaskForActor } from "../services/task-complete";
import { requireAuthOrApiKey, actorFromReq, canActOnTask, getCompanyIdFromReq } from "./common";
import { resolveWesetupTarget } from "./wesetup";

export function registerTaskStatusRoutes(app: Express): void {
  // Отметить задачу выполненной
  app.post(api.tasks.complete.path, requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const { comment } = req.body || {};
      const result = await completeTaskForActor({
        taskId,
        actor: actorFromReq(req),
        comment,
      });
      return res.json(result.task);
    } catch (err: any) {
      if (isTaskServiceError(err)) {
        return res.status(err.status).json({ message: err.message });
      }
      console.error("Error completing task:", err);
      res.status(500).json({ message: "Ошибка завершения задачи" });
    }
  });

  // Отменить завершение задачи (любой авторизованный пользователь)
  /**
   * WeSetup → TF mirror: отметить задачу как «возвращена на доработку
   * verifier'ом». Вызывается из POST /api/journal-documents/<id>/verifier
   * на стороне WeSetup при reject-cells / reject-document.
   *
   * POST /api/tasks/:id/mark-returned
   * Headers: Authorization: Bearer tfk_…
   * Body: { reason: string }
   *
   * Сохраняет rejectReason + verification_status="rejected" + isCompleted
   * в false (если был true), чтобы worker увидел задачу снова в активных
   * с красной плашкой «Возвращено». Балансы не трогаем — это решение
   * verifier'а, не worker'а.
   *
   * Auth: только API-key (machine-to-machine от WeSetup) или admin.
   */
  app.post("/api/tasks/:id/mark-returned", requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      // Cap длины: причина показывается в карточке задачи и в push-нотификации;
      // 1000 символов — щедро для управляющего и одновременно блокирует
      // payload-flood попытки.
      const reason = reasonRaw.slice(0, 1000);
      if (!Number.isFinite(taskId) || !reason) {
        return res.status(400).json({ message: "Bad task id or reason" });
      }
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && task.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      // Авторизация: API-key или admin'у можно. Простой воркер не
      // должен отмечать чужие задачи как «возвращённые».
      let allowed = false;
      if (req.apiKey) {
        allowed = true;
      } else if (req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (me?.isAdmin) allowed = true;
      }
      if (!allowed) {
        return res.status(403).json({ message: "Нет прав" });
      }
      await storage.updateTask(taskId, {
        // updateTask примет verification поля если они в schema —
        // см. shared/schema.ts. Если завершена — переоткрываем
        // (worker должен исправить).
        ...(task.isCompleted ? { isCompleted: false } : {}),
        verificationStatus: "rejected",
        rejectReason: reason,
        verifiedAt: Math.floor(Date.now() / 1000),
      } as never);
      safely(() => onTaskRejected(task, reason));
      const fresh = await storage.getTask(taskId);
      return res.json(fresh ?? task);
    } catch (err: any) {
      console.error("[mark-returned] failed", err);
      return res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post("/api/tasks/:id/uncomplete", requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Multi-tenant scope: задача должна принадлежать компании
      // вызывающей стороны.
      const callerCompanyIdForUncomplete = await getCompanyIdFromReq(req);
      if (callerCompanyIdForUncomplete !== null && task.companyId !== callerCompanyIdForUncomplete) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Авторизация: API-key (machine integration), исполнитель (свою
      // задачу), или session-admin. Раньше проверки не было — любой
      // авторизованный юзер из той же компании мог /uncomplete на
      // чужую задачу, что вычитало деньги с чужого баланса. Это
      // симметрично с /complete (см. line 1314-1317 ниже похожий
      // блок). См. tests/uncomplete-endpoint → "посторонний воркер".
      let isAllowed = false;
      if (req.apiKey) {
        isAllowed = true;
      } else if (req.session?.userId === task.workerId) {
        isAllowed = true;
      } else if (req.session?.userId) {
        const currentUser = await storage.getUserById(req.session.userId);
        if (await canActOnTask(currentUser, task)) {
          isAllowed = true;
        }
      }
      if (!isAllowed) {
        return res.status(403).json({ message: "Нет прав для изменения задачи" });
      }

      // «Отменить» сразу после «Готово», когда задача ушла руководителю:
      // забираем с проверки (submitted → pending). Премия ещё не начислена,
      // журнал WeSetup не тронут — откатывать нечего.
      if (!task.isCompleted && task.verificationStatus === "submitted") {
        await storage.withdrawSubmission(taskId);
        const fresh = await storage.getTask(taskId);
        if (!fresh) {
          return res.status(500).json({ message: "Ошибка обновления задачи" });
        }
        const { publishToCompany } = await import("../live-events");
        publishToCompany(fresh.companyId, { type: "tasks", taskId });
        return res.json(fresh);
      }

      // Atomic isCompleted=true → false. Раньше: read+if+write
      // pattern → два concurrent /uncomplete оба видели true и оба
      // вычитали price из баланса. Теперь только один из них пройдёт
      // условный UPDATE (affectedRows>0) и сделает дебет.
      //
      // 2026-05-09: same fix как в DELETE — claimed-by-other tasks
      // имели начисление на claimedByWorkerId, не workerId. Reversal
      // с workerId уводит чужой balance в минус. Skip reversal если
      // это sibling-claimed task.
      const wasTransitioned = task.isCompleted
        ? await storage.transitionTaskToUncompleted(taskId)
        : false;
      if (
        wasTransitioned &&
        task.price &&
        task.price > 0 &&
        task.workerId &&
        task.claimedByWorkerId === null
      ) {
        await storage.updateUserBalance(task.workerId, -task.price);
      }

      const updatedTask = await storage.getTask(taskId);
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      // Если задача журнальная — синхронизируем reopen в WeSetup, чтобы
      // link.remoteStatus стал "active". Иначе при повторном /complete
      // WeSetup-сторона ещё считает задачу completed, и UI ведёт себя
      // непредсказуемо («уже выполнял» / задача мгновенно возвращается).
      //
      // attemptOrEnqueue делает первую попытку синхронно; на сетевой
      // сбой / 5xx — кладёт в webhook_deliveries и worker ретраит
      // по backoff-лестнице. Раньше был fire-and-forget с одним retry
      // и terral lost data при downtime (см. P1#6).
      if (task.journalLink) {
        try {
          const target = await resolveWesetupTarget(req);
          if (!("error" in target)) {
            const { attemptOrEnqueue } = await import("../webhook-queue");
            await attemptOrEnqueue({
              taskId,
              eventType: "uncomplete",
              targetUrl: `${target.baseUrl}/api/integrations/tasksflow/complete`,
              apiKey: target.key,
              payload: { taskId, isCompleted: false, values: {} },
            });
          }
        } catch (err) {
          console.warn(
            "[uncomplete] WeSetup reopen sync enqueue failed (non-fatal)",
            err instanceof Error ? err.message : err,
          );
        }
      }

      res.json(updatedTask);
    } catch (err: any) {
      console.error("Error uncompleting task:", err);
      res.status(500).json({ message: "Ошибка отмены завершения задачи" });
    }
  });

  /**
   * Phase 2 двухстадийной верификации: одобрить/отклонить задачу.
   *
   *   POST /api/tasks/:id/verify
   *   Body:
   *     { decision: "approve" }
   *     { decision: "reject", reason: "<текст>" }
   *
   * Кто может:
   *   • API key (machine integrations) — для server-to-server подтверждений.
   *   • session-юзер == task.verifierWorkerId — назначенный проверяющий.
   *   • session-юзер == admin компании — overrides verifier'а
   *     (admin всегда может закрыть задачу, чтобы pipeline не вис при
   *     отпуске verifier'а).
   *
   * approve: 'submitted' → 'approved'. Запускает все side-effects, как
   * обычный /complete: balance, sibling-claim, email. WeSetup-mirror
   * (если task.journalLink) тоже отправится — т.е. журнал считается
   * заполненным только сейчас.
   *
   * reject: 'submitted' → 'rejected'. Никаких credit'ов; задача
   * вернулась в active у сотрудника с пометкой rejectReason.
   */
  app.post("/api/tasks/:id/verify", requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      if (!Number.isFinite(taskId)) {
        return res.status(400).json({ message: "Bad task id" });
      }

      const decisionRaw = (req.body || {}).decision;
      const reasonRaw = (req.body || {}).reason;
      if (decisionRaw !== "approve" && decisionRaw !== "reject") {
        return res
          .status(400)
          .json({ message: "decision должен быть 'approve' или 'reject'" });
      }
      if (
        decisionRaw === "reject" &&
        (typeof reasonRaw !== "string" || !reasonRaw.trim())
      ) {
        return res
          .status(400)
          .json({ message: "Для отказа укажите причину (reason)" });
      }
      const decision = decisionRaw as "approve" | "reject";
      // Cap длины такой же как в /mark-returned: причина рендерится в
      // карточке задачи + push-нотификации, 1000 символов щедро для
      // управляющего и блокирует payload-flood.
      const reason =
        decision === "reject"
          ? String(reasonRaw).trim().slice(0, 1000)
          : null;

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Multi-tenant scope.
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (
        callerCompanyId !== null &&
        task.companyId !== callerCompanyId
      ) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Pre-condition: задача должна быть «submitted».
      if (task.verificationStatus !== "submitted") {
        return res.status(409).json({
          message:
            "Задача не находится на проверке (текущий статус: " +
            (task.verificationStatus ?? "—") +
            ")",
        });
      }

      // Доступ: API key, verifier_worker_id, или admin.
      let verifierUserId: number | null = null;
      if (req.apiKey) {
        // Machine: используем верификатора как id (если задан) или 0
        // как «system». В updates ставим verified_by_user_id из task.
        verifierUserId = task.verifierWorkerId ?? 0;
      } else if (req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        // Админ, назначенный проверяющий или тот, кому роль даёт «Принимает
        // задачи» (руководитель из WeSetup — у своих людей), shared/roles.ts.
        if (
          me &&
          (me.isAdmin || me.id === task.verifierWorkerId || canReviewTask(await accessOf(me), task))
        ) {
          verifierUserId = me.id;
        }
      }
      if (verifierUserId === null) {
        return res.status(403).json({
          message:
            "Принять или вернуть задачу может проверяющий, руководитель или администратор",
        });
      }

      if (decision === "approve") {
        const ok = await storage.approveVerification(taskId, verifierUserId);
        if (!ok) {
          const fresh = await storage.getTask(taskId);
          return res.json(fresh ?? task);
        }
        safely(() => onTaskApproved(task));
        // Side-effects (balance, sibling-claim, WeSetup-mirror) —
        // те же что в /complete, но запускаем сейчас, при approve.
        if (task.price && task.price > 0 && task.workerId) {
          await storage.updateUserBalance(task.workerId, task.price);
        }
        // Как в /complete (с 2026-05-09): любая журнальная задача забирает
        // sibling'ов, а не только с премией. Иначе после проверки по роли
        // у второго уборщика оставалась висеть та же уборка без премии.
        const journalLink = parseJournalLink(task.journalLink);
        if (
          journalLink &&
          task.workerId &&
          !journalLink.isFreeText
        ) {
          try {
            const claimed = await storage.claimSiblingTasks({
              sourceTaskId: task.id,
              documentId: journalLink.documentId,
              journalKind: journalLink.kind,
              sourceRowKey: journalLink.rowKey ?? null,
              claimedByWorkerId: task.workerId,
              companyId: task.companyId ?? null,
              completedAt: Math.floor(Date.now() / 1000),
            });
            if (claimed > 0) {
              console.log(
                `[verify-approve] task ${task.id} claimed ${claimed} siblings`,
              );
            }
          } catch (claimErr) {
            console.error("[verify-approve] sibling claim failed", claimErr);
          }
        }
        // WeSetup-mirror через webhook-queue (тот же путь что обычный
        // /complete на journal-bound задаче). Если упстрим лежит —
        // worker ретраит.
        //
        // Если у задачи есть submittedValues (продавец заполнил форму
        // через /api/wesetup/complete-with-values, payload отложен до
        // approve), отправляем те значения в WeSetup. Иначе — пустой
        // values как для обычной /complete-задачи.
        if (task.journalLink) {
          let savedValues: Record<string, unknown> = {};
          if (task.submittedValues) {
            try {
              const parsed = JSON.parse(task.submittedValues);
              if (parsed && typeof parsed === "object") {
                savedValues = parsed as Record<string, unknown>;
              }
            } catch {
              /* corrupted JSON — отправим пустой values, лучше чем 500 */
            }
          }
          try {
            const target = await resolveWesetupTarget(req);
            if (!("error" in target)) {
              const { attemptOrEnqueue } = await import("../webhook-queue");
              await attemptOrEnqueue({
                taskId,
                eventType: "complete",
                targetUrl: `${target.baseUrl}/api/integrations/tasksflow/complete`,
                apiKey: target.key,
                payload: { taskId, isCompleted: true, values: savedValues },
              });
            }
          } catch (err) {
            console.warn(
              "[verify-approve] WeSetup mirror enqueue failed (non-fatal)",
              err instanceof Error ? err.message : err,
            );
          }
          // Очищаем submittedValues — они уже в WeSetup-журнале.
          if (task.submittedValues) {
            await db
              .update(tasks)
              .set({ submittedValues: null })
              .where(eq(tasks.id, taskId))
              .catch(() => null);
          }
        }
        const fresh = await storage.getTask(taskId);
        return res.json(fresh ?? task);
      }

      // decision === "reject"
      const ok = await storage.rejectVerification(
        taskId,
        verifierUserId,
        reason!,
      );
      if (!ok) {
        const fresh = await storage.getTask(taskId);
        return res.json(fresh ?? task);
      }
      safely(() => onTaskRejected(task, reason));
      // Чистим submittedValues — задача отклонена, продавец будет
      // заполнять форму заново. Без этого при повторном /complete-with-
      // values старые значения «застряли» бы в submitted_values.
      if (task.submittedValues) {
        await db
          .update(tasks)
          .set({ submittedValues: null })
          .where(eq(tasks.id, taskId))
          .catch(() => null);
      }
      const fresh = await storage.getTask(taskId);
      return res.json(fresh ?? task);
    } catch (err: any) {
      console.error("Error verifying task:", err);
      res.status(500).json({ message: "Ошибка проверки задачи" });
    }
  });

  // /api/tasks/awaiting-verification теперь регистрируется ВЫШЕ
  // /api/tasks/:id (см. блок ~720). Express матчит routes по
  // порядку, и static "awaiting-verification" должен быть до
  // dynamic ":id", иначе :id="awaiting-verification" → NaN → 404
  // и endpoint никогда не работал. Тесты в tests/awaiting-verification
  // ловят регрессию через 12 кейсов.
}
