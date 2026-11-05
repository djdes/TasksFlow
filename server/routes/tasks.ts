// Задачи: список, «ждут проверки», карточка, создание, правка, удаление.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { resolveUploadAbs } from "../uploads-paths";
import { mergeChecklistProgress } from "@shared/checklist";
import { isTaskServiceError } from "../services/task-actor";
import { createTaskForActor } from "../services/task-create";
import { accessOf, accessWithApproval } from "../access";
import { reviewersFor } from "../push/events";
import type { TaskReviewers } from "@shared/reviewers";
import { canAssignTo, canReviewTask, canSeeWorker } from "@shared/roles";
import {
  requireAuth,
  requireAdminOrManagerOrApiKey,
  requireAuthOrApiKey,
  actorFromReq,
  getCompanyIdFromReq,
} from "./common";

export function registerTaskRoutes(app: Express): void {
  // Tasks
  app.get(api.tasks.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании. Если companyId не разрезолвился
      // (юзер удалён / no company) — возвращаем пустой список.
      // Раньше: storage.getTasks(undefined) тащил ВСЕ задачи из БД,
      // потом filter по managed-workers их выкидывал, но запрос всё
      // равно бил по всей таблице.
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.json([]);
      }
      const tasks = await storage.getTasks(companyId);

      // Manager-scope фильтр (Phase 2 hierarchy):
      //   • Админ или API key → видит всё (return as is)
      //   • Не-админ с managedWorkerIds → видит задачи своих
      //     подчинённых + свои собственные
      //   • Не-админ без scope → видит ТОЛЬКО свои (старое поведение
      //     для обычного воркера; в TasksFlow раньше клиент сам
      //     фильтровал, теперь дублируем на сервере для безопасности
      //     — клиентский фильтр можно обойти)
      if (req.apiKey) return res.json(tasks);
      const userId = req.session?.userId;
      if (!userId) return res.json(tasks);
      const me = await storage.getUserById(userId);
      if (!me) return res.json([]);
      if (me.isAdmin) return res.json(tasks);

      // Роль «Ставит задачи» — вся компания, как у админа; руководитель
      // из WeSetup — свои люди и он сам; сотрудник — только свои.
      const access = await accessOf(me);
      res.json(tasks.filter((t) => canSeeWorker(access, t.workerId)));
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      res.status(500).json({ message: 'Ошибка загрузки задач' });
    }
  });

  /**
   * Список задач, ждущих проверки от текущего пользователя.
   * Используется UI-табом «На проверке» в Dashboard'е verifier'а.
   *
   *   GET /api/tasks/awaiting-verification
   *   200 → Task[]
   *   401 → не авторизован
   *
   * Возвращает все задачи с verification_status='submitted' и
   * verifier_worker_id == session.userId, в скоупе компании.
   * Admin'у — всё submitted в его компании.
   *
   * ВАЖНО: ДОЛЖЕН быть зарегистрирован ВЫШЕ /api/tasks/:id, иначе
   * Express трактует "awaiting-verification" как :id и возвращает
   * 404. Раньше endpoint был ниже /api/tasks/:id и фактически
   * никогда не работал — VerificationBanner и /admin/verification
   * page были пустыми.
   */
  app.get("/api/tasks/awaiting-verification", requireAuth, async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Не авторизован" });
      const me = await storage.getUserById(userId);
      if (!me) return res.status(401).json({ message: "Не авторизован" });
      const companyId = me.companyId ?? null;
      if (companyId === null) return res.json([]);

      const allTasks = await storage.getTasks(companyId);
      // Админ — всё; назначенный проверяющий — свои; роль «Принимает
      // задачи» — всю компанию; руководитель из WeSetup — работу своих
      // людей без назначенного проверяющего (shared/roles.ts canReviewTask).
      const access = me.isAdmin ? null : await accessOf(me);
      const filtered = allTasks.filter((t) => {
        if (t.verificationStatus !== "submitted") return false;
        if (me.isAdmin) return true;
        return canReviewTask(access!, t);
      });
      res.json(filtered);
    } catch (err: any) {
      console.error("Error listing awaiting-verification tasks:", err);
      res.status(500).json({ message: "Ошибка загрузки" });
    }
  });

  app.get(api.tasks.get.path, requireAuthOrApiKey, async (req, res) => {
    try {
      const task = await storage.getTask(Number(req.params.id));
      if (!task) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      // Multi-tenant scope: запрещаем cross-company чтение.
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && task.companyId !== companyId) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      res.json(task);
    } catch (err: any) {
      console.error('Error fetching task:', err);
      res.status(500).json({ message: 'Ошибка' });
    }
  });

  // Кто примет работу — строка «Принимает работу» в окне задачи.
  // required: «Готово» уйдёт на проверку (назначен проверяющий или роль
  // исполнителя этого требует), names — кто может принять.
  app.get("/api/tasks/:id/reviewers", requireAuthOrApiKey, async (req, res) => {
    try {
      const task = await storage.getTask(Number(req.params.id));
      const companyId = await getCompanyIdFromReq(req);
      if (!task || !task.companyId || (companyId !== null && task.companyId !== companyId)) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const users = await storage.getAllUsers(task.companyId);
      const worker = task.workerId ? users.find((u) => u.id === task.workerId) : undefined;
      const required = !!task.verifierWorkerId || (!!worker && (await accessWithApproval(worker)).requiresApproval);
      const reviewers = required ? await reviewersFor(task, users) : [];
      const body: TaskReviewers = {
        required,
        // Админы первыми не идут: сначала назначенный и роли, потом остальные по имени.
        names: reviewers
          .filter((u) => u.id !== task.workerId && !u.isRoot)
          .sort((a, b) => Number(a.isAdmin) - Number(b.isAdmin) || (a.name ?? "").localeCompare(b.name ?? "", "ru"))
          .map((u) => u.name?.trim() || u.phone || `#${u.id}`),
      };
      res.json(body);
    } catch (err) {
      console.error("Error fetching task reviewers:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post(api.tasks.create.path, requireAdminOrManagerOrApiKey, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      // companyId — из session-user или api key
      const companyId = await getCompanyIdFromReq(req);
      const task = await createTaskForActor({
        input,
        actor: actorFromReq(req),
        companyId,
      });
      res.status(201).json(task);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      if (isTaskServiceError(err)) {
        return res.status(err.status).json({ message: err.message });
      }
      console.error('Error creating task:', err);
      res.status(500).json({ message: 'Ошибка создания задачи' });
    }
  });

  app.put(api.tasks.update.path, requireAdminOrManagerOrApiKey, async (req, res) => {
    try {
      const input = api.tasks.update.input.parse(req.body);

      // Multi-tenant scope-check: задача должна быть в той же компании.
      // Делаем это ДО любой scope-проверки руководителя, чтобы не утекало
      // существование задач чужих компаний через 403 vs 404.
      const existing = await storage.getTask(Number(req.params.id));
      if (!existing) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && existing.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // FINANCIAL SAFETY: PUT не должен менять состояния которые
      // влияют на баланс (isCompleted, price на completed task,
      // переназначение workerId на completed task) — иначе баланс
      // теряет связь с реально выполненной работой. Раньше:
      //   - PUT { isCompleted: true } флипал статус БЕЗ начисления
      //     баланса (admin'ы сделали так чтобы скрыть задачу,
      //     сотрудник терял зарплату).
      //   - PUT { price: 5000 } на уже completed задаче не вызывал
      //     correction баланса — старая цена в balance, новая в task.
      //   - PUT { workerId: B } на completed задаче перевешивал task
      //     на B, но balance оставался у A.
      // Правильный flow: завершение через POST /complete + uncomplete.
      // Цена и worker — менять можно ТОЛЬКО на не-completed task.
      if (input.isCompleted !== undefined) {
        return res.status(400).json({
          message: "isCompleted нельзя менять через PUT — используйте /complete или /uncomplete",
        });
      }
      if (existing.isCompleted) {
        if (
          input.price !== undefined &&
          input.price !== (existing.price ?? 0)
        ) {
          return res.status(400).json({
            message:
              "Цена выполненной задачи фиксируется. Сначала отмените выполнение, затем измените цену.",
          });
        }
        if (
          input.workerId !== undefined &&
          input.workerId !== existing.workerId
        ) {
          return res.status(400).json({
            message:
              "Исполнителя выполненной задачи нельзя менять — баланс уже начислен. Сначала отмените выполнение.",
          });
        }
      }

      // Multi-tenant scope: если переназначаем workerId — новый
      // worker должен быть в той же компании. Иначе можно «отправить»
      // задачу чужому юзеру.
      if (input.workerId != null && input.workerId !== existing.workerId) {
        const newWorker = await storage.getUserById(input.workerId);
        if (
          !newWorker ||
          (callerCompanyId !== null && newWorker.companyId !== callerCompanyId)
        ) {
          return res.status(404).json({ message: "Сотрудник не найден" });
        }
      }

      // Scope-check для руководителя на edit:
      //   • Текущий workerId задачи должен быть в его scope
      //   • Если пытаются переназначить — новый workerId тоже в scope
      if (!req.apiKey && req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (me && !me.isAdmin) {
          const access = await accessOf(me);
          if (
            !canAssignTo(access, existing.workerId ?? null) ||
            (input.workerId !== undefined &&
              !canAssignTo(access, input.workerId))
          ) {
            return res.status(403).json({
              message: "Можно редактировать только задачи своих подчинённых",
            });
          }
        }
      }

      // Чек-лист: из запроса — только состав пунктов, отметки и фото — из
      // базы (shared/checklist.ts mergeChecklistProgress).
      if (input.checklist !== undefined) {
        input.checklist = mergeChecklistProgress(existing.checklist, input.checklist);
      }

      // То же время напоминания — не трогаем: иначе правка названия после
      // утреннего напоминания сбросила бы «уже отправлено сегодня».
      if (input.remindAt !== undefined && (input.remindAt ?? null) === (existing.remindAt ?? null)) {
        delete input.remindAt;
      }

      const task = await storage.updateTask(Number(req.params.id), input);
      if (!task) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      res.json(task);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error updating task:', err);
      res.status(500).json({ message: 'Ошибка обновления' });
    }
  });

  app.delete(api.tasks.delete.path, requireAdminOrManagerOrApiKey, async (req, res) => {
    try {
      // Multi-tenant scope-check: задача должна быть в той же компании.
      const existing = await storage.getTask(Number(req.params.id));
      if (!existing) {
        return res.status(204).send();
      }
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && existing.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Scope-check на delete — те же правила, что и на edit.
      if (!req.apiKey && req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (me && !me.isAdmin) {
          if (!canAssignTo(await accessOf(me), existing.workerId ?? null)) {
            return res.status(403).json({
              message: "Можно удалять только задачи своих подчинённых",
            });
          }
        }
      }

      // FINANCIAL SAFETY: при удалении completed task с positive price
      // вычитаем из баланса исполнителя — иначе balance остаётся с
      // «phantom»-зарплатой, без следа в task-журнале. Раньше: admin
      // удалял старую completed задачу для очистки списка → у worker'а
      // остался остаток оплаты без подтверждения; невозможно сверить.
      //
      // Race-fix: используем атомарный transitionTaskToUncompleted.
      // Без него два concurrent DELETE могли оба прочитать
      // isCompleted=true, оба вычесть price (двойной дебет) и потом
      // оба удалить таск (одно affectedRows=0, но без error). Теперь
      // только один из них переведёт isCompleted в false и сделает
      // дебет; остальные получат transitioned=false и пропустят.
      //
      // 2026-05-09: ВАЖНО — claimedByWorkerId NOT NULL означает что
      // этот task — sibling, баланс получил claimedByWorkerId (winner),
      // НЕ workerId (originally assigned). Reversal с workerId уведёт
      // его balance в минус (он не получал начисления). Скипаем reversal
      // для claimed-by-other tasks. Жалоба владельца «премия -180₽»
      // = 3 sibling-cleanups × 60₽ списано из чужих balance'ов.
      if (
        existing.price &&
        existing.price > 0 &&
        existing.workerId &&
        existing.claimedByWorkerId === null
      ) {
        try {
          const reversed = await storage.transitionTaskToUncompleted(
            Number(req.params.id),
          );
          if (reversed) {
            await storage.updateUserBalance(existing.workerId, -existing.price);
          }
        } catch (balanceErr) {
          console.error(
            "[task-delete] balance reversal failed",
            balanceErr,
          );
          return res.status(500).json({
            message: "Не удалось обновить баланс при удалении задачи",
          });
        }
      }

      await storage.deleteTask(Number(req.params.id));

      // Audit log (П-17 спека Wesetup): фиксируем deletion.
      const { recordAudit } = await import("../audit-log");
      const actorIdForDelete = (req as { userId?: number }).userId ?? null;
      void recordAudit({
        companyId: existing.companyId,
        actorWorkerId: actorIdForDelete,
        taskId: existing.id,
        action: "task.deleted",
        payload: {
          title: existing.title,
          wasCompleted: existing.isCompleted,
          workerId: existing.workerId,
        },
      });

      // Удаляем все привязанные к задаче файлы с диска. Раньше:
      // удалённая задача оставляла photoUrls + examplePhotoUrl как
      // orphan-файлы в /uploads/, ничем не убираемые — disk usage
      // рос неконтролируемо. Best-effort, не валим ответ при ошибке.
      try {
        const { unlink } = await import("fs/promises");
        const candidates: string[] = [];
        const photos = (existing as { photoUrls?: string[] }).photoUrls;
        if (Array.isArray(photos)) candidates.push(...photos);
        if (existing.photoUrl) candidates.push(existing.photoUrl);
        if (existing.examplePhotoUrl) candidates.push(existing.examplePhotoUrl);
        for (const rel of candidates) {
          const abs = resolveUploadAbs(rel);
          if (!abs) continue;
          await unlink(abs).catch(() => null);
        }
      } catch (cleanupErr) {
        console.warn("[task-delete] orphan files cleanup failed", cleanupErr);
      }

      res.status(204).send();
    } catch (err: any) {
      console.error('Error deleting task:', err);
      res.status(500).json({ message: 'Ошибка удаления' });
    }
  });
}
