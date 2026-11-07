// Сотрудники: список, люди руководителя, создание, PIN, правка, баланс, удаление.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express, Request } from "express";
import { storage } from "../storage";
import { normalizePhone } from "../phone-normalize";
import { api } from "@shared/routes";
import { z } from "zod";
import { type User } from "@shared/schema";
import { requireApiKey } from "../api-keys";
import { checkPin, hashPin, notifyPinEvent } from "../pin-auth";
import { newPinSchema, pinSchema } from "@shared/pin";
import { seatProblem } from "../plan-limits";
import { accessOf, roleOf } from "../access";
import { canGrantRole, canManageUser, canSeeWorker } from "@shared/roles";
import { canImpersonate } from "../impersonation";
import { openPin, sealPin } from "../pin-reveal";
import { recordAudit } from "../audit-log";
import {
  requireAuth,
  requireUserManager,
  requireUserManagerOrApiKey,
  requireAuthOrApiKey,
  resolveRoleGrant,
  canResetPinByEmail,
  getCompanyIdFromReq,
} from "./common";

// PIN администратора меняет только он сам: иначе второй админ или
// интеграция по API-ключу могли бы забрать его аккаунт.
export const ADMIN_PIN_OWN_ONLY = "PIN администратора меняется только в его аккаунте";
export const NOT_YOUR_PEOPLE = "Админов и других руководителей меняет только администратор";

/** Сотрудник своей компании или null — для смены PIN руководителем. */
/** Запомнить PIN от руководителя для «Посмотреть PIN» (server/pin-reveal.ts). */
async function rememberPin(userId: number, pin: string, setBy: number | null): Promise<void> {
  // Не получилось запомнить — PIN всё равно задан; посмотреть его будет нельзя.
  try {
    const sealed = sealPin(pin);
    if (sealed) await storage.setPinReveal(userId, sealed, setBy);
  } catch (err) {
    console.warn("[pin-reveal] не удалось сохранить PIN для просмотра", err instanceof Error ? err.message : err);
  }
}

export async function findCompanyUser(req: Request, userId: number) {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const target = await storage.getUserById(userId);
  if (!target) return null;
  const companyId = await getCompanyIdFromReq(req);
  if (companyId !== null && target.companyId !== companyId) return null;
  return target;
}

/**
 * Руководитель (не админ, не интеграция) может менять только обычных
 * людей: не админов, не других руководителей и не себя.
 */
export async function canTouchUser(req: Request, target: User): Promise<boolean> {
  if (req.apiKey) return true;
  const me = await storage.getUserById(req.session.userId!);
  if (!me) return false;
  if (me.isAdmin) return true;
  return canManageUser(await accessOf(me), target, await roleOf(target));
}

export function registerUserRoutes(app: Express): void {
  // Users
  app.get(api.users.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании. Раньше: companyId ?? undefined тянул
      // ВСЕХ юзеров из ВСЕХ компаний при null (deleted-user-with-
      // valid-session edge case).
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.json([]);
      }
      const users = await storage.getAllUsers(companyId);

      // Manager-scope: при создании задачи руководитель видит в
      // worker-dropdown только своих подчинённых. Админу — всё, как
      // и раньше. Сам себя руководитель тоже видит (может назначить
      // задачу себе). Без apiKey — для CI/syncs пропускаем фильтр.
      if (req.apiKey) return res.json(users);
      const userId = req.session?.userId;
      if (!userId) return res.json(users);
      const me = users.find((u) => u.id === userId);
      if (!me) return res.json([]);

      // Роль «Ставит задачи» или «Добавляет сотрудников» — все люди
      // компании; руководитель из WeSetup — свои и он сам; сотрудник — себя.
      const access = await accessOf(me);
      const visible = me.isAdmin || access.manageUsers ? users : users.filter((u) => canSeeWorker(access, u.id));
      const roles = new Map<number, ReturnType<typeof roleOf>>();
      const previewAllowed = async (u: User) => {
        if (req.session.impersonatorId) return false;
        if (me.isAdmin) return canImpersonate(me, u, { access, role: null });
        if (u.roleId && !roles.has(u.roleId)) roles.set(u.roleId, roleOf(u));
        const role = u.roleId ? await roles.get(u.roleId) ?? null : null;
        return canImpersonate(me, u, { access, role });
      };
      // Кнопку показывает сервер: UI не угадывает чужие роли и иерархию.
      res.json(await Promise.all(visible.map(async (u) => ({
        ...u,
        canImpersonate: await previewAllowed(u),
      }))));
    } catch (err: any) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Ошибка загрузки пользователей' });
    }
  });

  /**
   * PUT /api/admin/users/:id/managed-workers
   *
   * Body: { workerIds: number[] }
   *
   * Только apiKey — это write-side для WeSetup ↔ TasksFlow синхронизации.
   * Никаких юзерских action'ов из UI. WeSetup пушит сюда массив TF
   * user IDs, которыми руководит этот человек, после каждого изменения
   * /settings/staff-hierarchy на стороне WeSetup.
   *
   * Сессионных админов не пускаем намеренно — иерархия живёт в WeSetup,
   * чтобы не было двух источников истины. Если бы тут разрешили
   * руками править — ушли бы из синка после следующего push'а из
   * WeSetup, и пользователь бы не понял.
   */
  app.put("/api/admin/users/:id/managed-workers", requireApiKey, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ message: "Bad userId" });
      }

      // Multi-tenant scope: API key одной компании не должен изменять
      // managed-workers юзера другой компании.
      const callerCompanyId = await getCompanyIdFromReq(req);
      const targetUser = await storage.getUserById(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (callerCompanyId !== null && targetUser.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "User not found" });
      }

      const body = req.body as { workerIds?: unknown };
      const list = Array.isArray(body?.workerIds)
        ? body.workerIds.filter(
            (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
          )
        : null;
      if (list === null) {
        return res.status(400).json({ message: "workerIds must be number[]" });
      }

      // Также фильтруем workerIds — оставляем только тех, кто реально
      // в той же компании. Иначе можно подсунуть worker'а другой
      // компании в managed-список (он его всё равно не увидит, но
      // лучше не хранить мусорные ссылки).
      if (callerCompanyId !== null && list.length > 0) {
        const allWorkers = await storage.getWorkers(callerCompanyId);
        const allowedIds = new Set(allWorkers.map((w) => w.id));
        const filtered = list.filter((id) => allowedIds.has(id));
        if (filtered.length !== list.length) {
          // Тихо отбрасываем чужих — UI пусть не падает, но и в БД
          // не пишем мусор.
          list.length = 0;
          for (const id of filtered) list.push(id);
        }
      }

      const updated = await storage.setManagedWorkers(userId, list);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ ok: true, count: list.length });
    } catch (err: any) {
      console.error('[managed-workers] failed', err);
      res.status(500).json({ message: 'Ошибка сохранения иерархии' });
    }
  });

  app.post(api.users.create.path, requireUserManagerOrApiKey, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const requestedAdmin =
        input.isAdmin === true ||
        input.role === "admin" ||
        input.role === "manager";
      // Explicit demote-сигнал: WeSetup передаёт isAdmin:false когда хочет
      // снять admin-флаг с уже-существующего юзера (раньше это не работало
      // — endpoint просто возвращал 400 «уже существует»). Различаем
      // undefined (skip) vs false (demote).
      //
      // ВАЖНО: insertUserSchema.isAdmin имеет .default(false) в Zod, поэтому
      // input.isAdmin === false срабатывает и для отсутствующего поля
      // (idempotent re-create) — это **демотило бы любого admin'а**, кого
      // WeSetup случайно ре-провизионировал. Используем raw req.body для
      // различения «явно false» vs «не передано». См. tests/api-user-provision
      // → "does NOT demote when isAdmin is undefined".
      const explicitDemote =
        typeof req.body === "object" &&
        req.body !== null &&
        (req.body as { isAdmin?: unknown }).isAdmin === false;

      // Проверяем, существует ли пользователь
      const normalizedPhone = normalizePhone(input.phone);
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }

      // Кто добавляет: интеграция и админ — кого угодно; руководитель
      // (роль «Добавляет сотрудников») — только обычных людей и роли без
      // права на людей (shared/roles.ts canGrantRole).
      const actor = req.apiKey ? null : await storage.getUserById(req.session.userId!);
      const actorAccess = actor && !actor.isAdmin ? await accessOf(actor) : null;
      if (actorAccess && requestedAdmin) {
        return res.status(403).json({ message: "Назначить администратора может только администратор", field: "role" });
      }
      const grant = await resolveRoleGrant(companyId, input.roleId);
      if ("error" in grant) {
        return res.status(400).json({ message: grant.error, field: "roleId" });
      }
      if (actorAccess && !canGrantRole(actorAccess, grant.role)) {
        return res.status(403).json({ message: "Эту роль может выдать только администратор", field: "roleId" });
      }

      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser && actorAccess) {
        // Руководитель не повышает и не понижает существующих людей.
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }
      if (existingUser) {
        // Если повторный create передал position — обновляем должность
        // на месте (idempotent merge: WeSetup может прокинуть свежее
        // значение из своей JobPosition без полного rebuild).
        if (
          input.position !== undefined &&
          existingUser.companyId === companyId &&
          (input.position ?? null) !== (existingUser.position ?? null)
        ) {
          await storage.setUserPosition(existingUser.id, input.position ?? null);
        }
        // Demote: если WeSetup явно прислал isAdmin:false и юзер сейчас
        // admin — снимаем флаг. Это позволяет WeSetup-task-visibility
        // корректно убрать admin-роль с заведующей/менеджеров когда
        // менеджер откатил настройку.
        if (
          existingUser.companyId === companyId &&
          explicitDemote &&
          existingUser.isAdmin
        ) {
          const demoted = await storage.setUserAdmin(existingUser.id, false);
          return res.json(demoted || existingUser);
        }
        if (existingUser.companyId === companyId && requestedAdmin && !existingUser.isAdmin) {
          const promoted = await storage.setUserAdmin(existingUser.id, true);
          return res.json(promoted || existingUser);
        }
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      const noSeat = await seatProblem(companyId);
      if (noSeat) return res.status(402).json({ message: noSeat, code: "plan_limit" });

      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.name,
        isAdmin: requestedAdmin,
        companyId,
        position: input.position ?? null,
        // Своя роль компании — только у не-админа (у админа и так всё).
        ...(grant.role && !requestedAdmin ? { roleId: grant.role.id } : {}),
        // PIN задаёт руководитель при создании. Интеграции (WeSetup) PIN не
        // шлют — такой сотрудник придумает его при первом входе.
        ...(input.pin ? { pinHash: hashPin(input.pin) } : {}),
      });
      // PIN от руководителя можно будет посмотреть в «Сотрудниках».
      if (input.pin) await rememberPin(user.id, input.pin, req.session?.userId ?? null);

      res.status(201).json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error creating user:', err);
      res.status(500).json({ message: 'Ошибка создания пользователя' });
    }
  });

  // ===================== PIN =====================

  // Руководитель задаёт новый PIN — это же снимает блокировку.
  app.post("/api/users/:id/pin", requireUserManagerOrApiKey, async (req, res) => {
    try {
      const { pin } = z.object({ pin: newPinSchema }).parse(req.body);
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target) return res.status(404).json({ message: "Пользователь не найден" });
      if (target.isAdmin) return res.status(403).json({ message: ADMIN_PIN_OWN_ONLY });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      const updated = await storage.setUserPin(target.id, hashPin(pin));
      await rememberPin(target.id, pin, req.session?.userId ?? null);
      void notifyPinEvent(target, "Руководитель задал вам новый PIN для входа в TasksFlow.");
      res.json(updated ?? target);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: "pin" });
      }
      console.error("Error setting user PIN:", err);
      res.status(500).json({ message: "Не удалось задать PIN" });
    }
  });

  // «Посмотреть PIN»: только PIN, заданный руководителем. Свой PIN
  // сотрудника не хранится — тогда pin: null и reason: "self".
  app.get("/api/users/:id/pin", requireUserManager, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      if (req.session.impersonatorId) return res.status(403).json({ message: "В режиме просмотра PIN не показывается" });
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target) return res.status(404).json({ message: "Пользователь не найден" });
      if (target.isAdmin) return res.status(403).json({ message: ADMIN_PIN_OWN_ONLY });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      if (!target.pinHash) return res.json({ pin: null, reason: "none" });
      const saved = await storage.getPinReveal(target.id);
      const pin = saved ? openPin(saved.pinEncrypted) : null;
      if (!pin) return res.json({ pin: null, reason: "self" });
      void recordAudit({ companyId: target.companyId, actorWorkerId: req.session.userId ?? null, taskId: null, action: "user.pin_viewed", payload: { userId: target.id } }).catch(() => {});
      res.json({ pin, reason: null, setAt: saved?.setAt ?? null });
    } catch (err) {
      console.error("Error revealing user PIN:", err);
      res.status(500).json({ message: "Не удалось показать PIN" });
    }
  });

  // Сброс PIN: сотрудник придумает новый при следующем входе.
  app.delete("/api/users/:id/pin", requireUserManagerOrApiKey, async (req, res) => {
    try {
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target) return res.status(404).json({ message: "Пользователь не найден" });
      if (target.isAdmin) return res.status(403).json({ message: ADMIN_PIN_OWN_ONLY });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      const updated = await storage.setUserPin(target.id, null);
      res.json(updated ?? target);
    } catch (err: any) {
      console.error("Error clearing user PIN:", err);
      res.status(500).json({ message: "Не удалось сбросить PIN" });
    }
  });

  // Смена своего PIN из «Моего аккаунта». Если PIN уже есть — нужен текущий.
  app.post("/api/auth/pin", requireAuth, async (req, res) => {
    try {
      const input = z
        .object({ currentPin: pinSchema.optional(), newPin: newPinSchema })
        .parse(req.body);
      const me = await storage.getUserById(req.session.userId!);
      if (!me) return res.status(401).json({ message: "Не авторизован" });
      // Недавний вход по email заменяет текущий PIN: так восстанавливают
      // забытый PIN без руководителя.
      if (me.pinHash && !canResetPinByEmail(req)) {
        if (!input.currentPin) {
          return res.status(400).json({ message: "Введите текущий PIN", field: "currentPin" });
        }
        const check = await checkPin(me, input.currentPin);
        if (!check.ok) {
          if (check.body.retryAfterSec) res.setHeader("Retry-After", String(check.body.retryAfterSec));
          return res.status(check.status).json({ ...check.body, field: "currentPin" });
        }
      }
      const updated = await storage.setUserPin(me.id, hashPin(input.newPin));
      void notifyPinEvent(me, "PIN для входа в TasksFlow изменён. Если это были не вы, сообщите руководителю.");
      res.json(updated ?? me);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") || "newPin" });
      }
      console.error("Error changing own PIN:", err);
      res.status(500).json({ message: "Не удалось сменить PIN" });
    }
  });

  app.put(api.users.update.path, requireAuth, requireUserManager, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const input = api.users.update.input.parse(req.body);

      // Проверяем, существует ли пользователь
      const existingUser = await storage.getUserById(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      // Multi-tenant scope: админ может править только своих юзеров.
      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && existingUser.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      // Руководитель меняет только обычных людей (не админов, не других
      // руководителей и не себя) — shared/roles.ts canManageUser.
      const currentAccess = currentUser && !currentUser.isAdmin ? await accessOf(currentUser) : null;
      if (currentAccess && !canManageUser(currentAccess, existingUser, await roleOf(existingUser))) {
        return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      }

      // Смена роли: "admin", своя роль компании или null («Сотрудник»).
      let roleChange: { isAdmin: boolean; roleId: number | null } | null = null;
      if (input.role !== undefined) {
        const companyId = existingUser.companyId ?? currentUser?.companyId ?? null;
        if (userId === req.session.userId) {
          return res.status(400).json({ message: "Свою роль поменять нельзя — попросите другого администратора", field: "role" });
        }
        if (input.role === "admin") {
          if (currentAccess) {
            return res.status(403).json({ message: "Назначить администратора может только администратор", field: "role" });
          }
          roleChange = { isAdmin: true, roleId: null };
        } else {
          const grant = companyId ? await resolveRoleGrant(companyId, input.role) : { error: "Компания не найдена" };
          if ("error" in grant) {
            return res.status(400).json({ message: grant.error, field: "role" });
          }
          if (currentAccess && !canGrantRole(currentAccess, grant.role)) {
            return res.status(403).json({ message: "Эту роль может выдать только администратор", field: "role" });
          }
          roleChange = { isAdmin: false, roleId: grant.role?.id ?? null };
        }
      }

      // Проверяем, не занят ли номер другим пользователем
      const normalizedPhone = normalizePhone(input.phone);
      const userWithPhone = await storage.getUserByPhone(normalizedPhone);
      if (userWithPhone && userWithPhone.id !== userId) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      let user = await storage.updateUser(userId, input);
      if (roleChange && (roleChange.isAdmin !== existingUser.isAdmin || roleChange.roleId !== (existingUser.roleId ?? null))) {
        user = (await storage.setUserRole(userId, roleChange)) ?? user;
      }
      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error updating user:', err);
      res.status(500).json({ message: 'Ошибка обновления пользователя' });
    }
  });

  // Сброс баланса пользователя (админ или руководитель — у обычных людей)
  app.post("/api/users/:id/reset-balance", requireAuth, requireUserManager, async (req, res) => {
    try {
      const userId = Number(req.params.id);

      // Multi-tenant scope: админ может ресетить только своих юзеров.
      const targetUser = await storage.getUserById(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && targetUser.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      if (!(await canTouchUser(req, targetUser))) {
        return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      }

      const user = await storage.resetUserBalance(userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      res.json(user);
    } catch (err: any) {
      console.error("Error resetting user balance:", err);
      res.status(500).json({ message: "Ошибка сброса баланса" });
    }
  });

  // Удаление пользователя (админ или руководитель — обычных людей)
  app.delete("/api/users/:id", requireAuth, requireUserManager, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const currentUser = await storage.getUserById(req.session.userId!);

      // Нельзя удалить самого себя
      if (userId === req.session.userId) {
        return res.status(400).json({ message: "Нельзя удалить самого себя" });
      }

      const userToDelete = await storage.getUserById(userId);
      if (!userToDelete) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      // Нельзя удалять админов
      if (userToDelete.isAdmin) {
        return res.status(400).json({ message: "Нельзя удалить администратора" });
      }

      // Multi-tenant scope: company-уровневый админ удаляет только
      // юзеров своей компании. Раньше check был
      // `userToDelete.companyId !== currentUser?.companyId`, что в
      // частном случае «оба null» давал permit и легаси юзер без
      // companyId мог удалить такого же без companyId юзера в другой
      // соседней инсталляции (если миграция оставила NULL companyId).
      // Шаблон выровнен с /reset-balance — если у админа нет
      // companyId, считаем его платформенным и разрешаем; иначе
      // требуем match.
      if (
        currentUser?.companyId != null &&
        userToDelete.companyId !== currentUser.companyId
      ) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      if (!(await canTouchUser(req, userToDelete))) {
        return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      }

      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting user:", err);
      res.status(500).json({ message: "Ошибка удаления пользователя" });
    }
  });
}
