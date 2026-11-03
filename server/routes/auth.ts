// Вход по телефону и PIN, по email и magic-ссылке, выход; аккаунт: почта, пароль, уведомления, правка и удаление себя.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { normalizePhone } from "../phone-normalize";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  startSchema,
  loginEmailSchema,
  recoverSchema,
  updateEmailSchema,
  updatePasswordSchema,
} from "@shared/schema";
import { validateEmailForAuth, normalizeEmail, isEmailFormat } from "../email-validate";
import {
  hashPassword,
  verifyPassword,
  generatePassword,
  generateMagicToken,
} from "../crypto-password";
import { sendMail } from "../mailer";
import { autoRegisterByEmail, MAGIC_TTL_SEC } from "../auto-register";
import {
  checkPin,
  hashPin,
  lockedResult,
  lockRemaining,
  notifyPinEvent,
  nowSec,
} from "../pin-auth";
import { newPinSchema } from "@shared/pin";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { accessWithApproval } from "../access";
import { notifyPrefsSchema, parseNotifyPrefs } from "@shared/notify";
import { requireAuth, canResetPinByEmail } from "./common";

export function registerAuthRoutes(app: Express): void {
  // Auth
  // Вход по телефону — в два шага: номер, затем PIN. Без PIN ответ
  // говорит, какой шаг дальше: { step: "pin" } — ввести PIN,
  // { step: "setup" } — PIN ещё не задан, человек придумывает его сам
  // (первый вход после появления PIN или аккаунт создала интеграция).
  // Раньше одного номера хватало, чтобы войти в любой аккаунт.
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      
      // Нормализуем номер телефона
      const normalizedPhone = normalizePhone(input.phone);
      
      const user = await storage.getUserByPhone(normalizedPhone);
      if (!user) {
        return res.status(401).json({
          message: "Пользователь с таким номером не найден",
          field: "phone",
        });
      }

      if (!user.pinHash) {
        if (!input.pin) return res.json({ step: "setup" });
        const parsed = newPinSchema.safeParse(input.pin);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0].message, field: "pin" });
        }
        const claimed = await storage.setUserPinIfEmpty(user.id, hashPin(parsed.data));
        if (!claimed) {
          // Пока человек придумывал PIN, его уже задали (руководитель или
          // параллельный вход) — пусть введёт заданный.
          return res.status(409).json({ step: "pin", field: "pin", message: "PIN уже задан. Введите его, чтобы войти." });
        }
        void notifyPinEvent(user, "PIN для входа в TasksFlow задан. Если это были не вы, сообщите руководителю.");
        req.session.userId = user.id;
        req.session.emailAuthAt = undefined;
        return res.json((await storage.getUserById(user.id)) ?? user);
      }

      if (!input.pin) {
        // Блокировку показываем сразу, до ввода PIN, — попытку не тратим.
        const locked = lockRemaining(user);
        if (locked > 0) {
          const blocked = lockedResult(locked, false);
          res.setHeader("Retry-After", String(locked));
          return res.status(blocked.status).json(blocked.body);
        }
        return res.json({ step: "pin" });
      }

      const check = await checkPin(user, input.pin);
      if (!check.ok) {
        if (check.body.retryAfterSec) res.setHeader("Retry-After", String(check.body.retryAfterSec));
        return res.status(check.status).json(check.body);
      }

      req.session.userId = user.id;
      req.session.emailAuthAt = undefined;
      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error logging in:', err);
      res.status(500).json({ message: 'Ошибка авторизации' });
    }
  });

  app.get(api.auth.me.path, async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.json(null);
      }
      
      const user = await storage.getUserById(req.session.userId);
      if (!user) return res.json(null);
      // user уже содержит isRoot (колонка) — UI показывает root-раздел по нему.
      // access — права по роли (shared/roles.ts): кабинет строит меню и
      // кнопки по ним, а не пересчитывает роль сам.
      res.json({
        ...user,
        pinResetByEmail: canResetPinByEmail(req),
        access: await accessWithApproval(user),
        notify: parseNotifyPrefs(user.notifyPrefs),
        ...(req.session.impersonatorId ? { impersonation: { actorId: req.session.impersonatorId, readOnly: true } } : {}),
      });
    } catch (err: any) {
      console.error('Error fetching user:', err);
      res.status(500).json({ message: 'Ошибка' });
    }
  });

  app.post(api.auth.logout.path, async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false });
      }
      res.json({ success: true });
    });
  });

  // ============ Email-авторизация (лендинг, ветка как в ordersflow) ============

  // Единая точка входа: одно поле email.
  //   новый email   → авторегистрация + СРАЗУ сессия + welcome-письмо → {exists:false}
  //   существующий  → magic-login письмо → {exists:true} (клиент покажет шаг с паролем)
  app.post("/api/auth/start", async (req, res) => {
    try {
      const { email } = startSchema.parse(req.body);
      const consent = (req.body as { consent?: unknown } | null)?.consent === true;
      const base = getPublicTasksflowBaseUrl(req);

      // Существующий аккаунт → вход. MX/типо-проверку НЕ делаем: домен уже
      // «подтверждён» тем, что аккаунт есть (иначе свой же домен без MX,
      // напр. admin@tasksflow.ru, не смог бы войти). Достаточно формата.
      const normalizedEarly = normalizeEmail(email);
      if (isEmailFormat(normalizedEarly)) {
        const existing = await storage.getUserByEmail(normalizedEarly);
        if (existing) {
          const token = generateMagicToken();
          const expiresAt = Math.floor(Date.now() / 1000) + MAGIC_TTL_SEC;
          await storage.setMagicToken(existing.id, token, expiresAt);
          await sendMail({
            to: normalizedEarly,
            kind: "login-link",
            data: { email: normalizedEarly, magicUrl: `${base}/api/auth/magic/${token}` },
          }).catch((e) => console.error("[auth/start] login-link mail failed", e));
          return res.json({ exists: true });
        }
      }

      // Новый email → строгая проверка (типо + MX), чтобы не регистрировать мусор.
      const check = await validateEmailForAuth(email);
      if (!check.ok) {
        return res.status(400).json({
          message: check.error,
          field: "email",
          suggestion: check.suggestion,
        });
      }
      const normalized = check.normalized;

      // Новый аккаунт создаём только с согласием на обработку ПД (152-ФЗ):
      // без него форма показывает компактный шаг с галочкой и шлёт ещё раз.
      if (!consent) return res.json({ step: "consent", exists: false });

      // Новый email → авторегистрация + мгновенный автологин (на почту идти не надо)
      const { user, password, magicToken } = await autoRegisterByEmail(normalized);
      await storage.setUserConsent(user.id, nowSec());
      req.session.userId = user.id;
      req.session.emailAuthAt = nowSec();
      await sendMail({
        to: normalized,
        kind: "welcome",
        data: { email: normalized, password, magicUrl: `${base}/api/auth/magic/${magicToken}` },
      }).catch((e) => console.error("[auth/start] welcome mail failed", e));
      return res.status(201).json({ exists: false, user });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error in /api/auth/start:", err);
      res.status(500).json({ message: "Ошибка входа" });
    }
  });

  // Вход по email + пароль (шаг «sent» в модалке для существующего email).
  app.post("/api/auth/login-email", async (req, res) => {
    try {
      const { email, password } = loginEmailSchema.parse(req.body);
      const normalized = normalizeEmail(email);
      const user = await storage.getUserByEmail(normalized);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Неверный email или пароль", field: "password" });
      }
      req.session.userId = user.id;
      req.session.emailAuthAt = nowSec();
      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error in /api/auth/login-email:", err);
      res.status(500).json({ message: "Ошибка входа" });
    }
  });

  // Сброс пароля: новый пароль + magic-токен на почту. Всегда 200 (анти-энумерация).
  app.post("/api/auth/recover", async (req, res) => {
    try {
      const { email } = recoverSchema.parse(req.body);
      const normalized = normalizeEmail(email);
      const user = await storage.getUserByEmail(normalized);
      if (user) {
        const password = generatePassword(12);
        await storage.updateUserPassword(user.id, hashPassword(password));
        const token = generateMagicToken();
        const expiresAt = Math.floor(Date.now() / 1000) + MAGIC_TTL_SEC;
        await storage.setMagicToken(user.id, token, expiresAt);
        const base = getPublicTasksflowBaseUrl(req);
        await sendMail({
          to: normalized,
          kind: "recovery",
          data: { email: normalized, password, magicUrl: `${base}/api/auth/magic/${token}` },
        }).catch((e) => console.error("[auth/recover] mail failed", e));
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error in /api/auth/recover:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  // Magic-ссылка из письма: одноразовый вход → сессия → редирект в кабинет.
  app.get("/api/auth/magic/:token", async (req, res) => {
    try {
      const token = req.params.token;
      if (!/^[a-f0-9]{32}$/.test(token)) {
        return res.redirect("/login?magic=invalid");
      }
      const user = await storage.findUserByMagicToken(token);
      if (!user) {
        return res.redirect("/login?magic=expired");
      }
      await storage.clearMagicToken(user.id);
      req.session.userId = user.id;
      req.session.emailAuthAt = nowSec();
      res.redirect("/dashboard");
    } catch (err: any) {
      console.error("Error in /api/auth/magic:", err);
      res.redirect("/login?magic=error");
    }
  });

  // ===== Аккаунт пользователя (кабинет /account): смена email и пароля =====
  app.put("/api/account/email", requireAuth, async (req, res) => {
    try {
      const { email } = updateEmailSchema.parse(req.body);
      const check = await validateEmailForAuth(email);
      if (!check.ok) {
        return res.status(400).json({ message: check.error, field: "email", suggestion: check.suggestion });
      }
      const existing = await storage.getUserByEmail(check.normalized);
      if (existing && existing.id !== req.session.userId) {
        return res.status(400).json({ message: "Этот email уже используется", field: "email" });
      }
      const updated = await storage.updateUserEmail(req.session.userId!, check.normalized);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Error updating account email:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  // Личные настройки уведомлений: что присылать в push и Telegram и нужны
  // ли письма о новых задачах (на email из «Моего аккаунта»).
  app.put("/api/account/notify-prefs", requireAuth, async (req, res) => {
    try {
      const prefs = notifyPrefsSchema.parse(req.body);
      const updated = await storage.setUserNotifyPrefs(req.session.userId!, JSON.stringify(prefs));
      if (!updated) return res.status(404).json({ message: "Пользователь не найден" });
      res.json({ notify: parseNotifyPrefs(updated.notifyPrefs) });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Неверные настройки уведомлений", field: err.errors[0].path.join(".") });
      }
      console.error("Error updating notify prefs:", err);
      res.status(500).json({ message: "Не удалось сохранить уведомления" });
    }
  });

  app.put("/api/account/password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);
      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      // Если пароль уже задан — требуем подтвердить текущий.
      if (user.passwordHash) {
        if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
          return res.status(400).json({ message: "Текущий пароль неверный", field: "currentPassword" });
        }
      }
      await storage.updateUserPassword(user.id, hashPassword(newPassword));
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Error updating account password:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  // Обновить имя текущего пользователя (для админа - собственное имя)
  /**
   * Self-deletion: текущий user удаляет свой аккаунт.
   * Единственный admin компании, у которого есть сотрудники, удаляется
   * только с явным { confirmOrphan: true }: без флага — 409 с кодом
   * sole_admin, чтобы UI сначала предложил назначить другого admin'а.
   * С флагом удаление проходит, как и раньше (закрытие компании —
   * сознательное решение пользователя); платформенный админ при
   * необходимости промоутит оставшегося worker'а.
   * Сессия после успеха уничтожается.
   */
  app.delete("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      if (user.isAdmin && user.companyId) {
        const allUsers = await storage.getAllUsers(user.companyId);
        const otherAdmins = allUsers.filter(
          (u) => u.isAdmin && u.id !== userId,
        );
        const otherUsers = allUsers.filter((u) => u.id !== userId).length;
        if (otherAdmins.length === 0 && otherUsers > 0) {
          if (req.body?.confirmOrphan !== true) {
            return res.status(409).json({
              code: "sole_admin",
              otherUsers,
              message:
                "Вы единственный администратор компании. Сначала назначьте другого администратора — иначе сотрудники останутся без управления.",
            });
          }
          console.warn(
            `[delete-own-account] Company ${user.companyId} loses its sole admin (user ${userId}). ${otherUsers} worker(s) become unmanaged.`,
          );
        }
      }

      await storage.deleteUser(userId);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    } catch (err: any) {
      console.error("Error deleting own account:", err);
      res.status(500).json({
        message: "Ошибка удаления аккаунта",
        error: err?.message,
      });
    }
  });

  app.put("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const { name } = req.body ?? {};
      const user = await storage.getUserById(req.session.userId!);

      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      // Раньше: name?.trim() крашил с TypeError если name был числом
      // или объектом — попадало в catch как непонятный 500.
      // Также длина не лимитировалась — кто-то мог пихнуть мегабайт.
      //
      // Cap=255 синхронно с MySQL VARCHAR(255) и updateUserSchema.name
      // (см. shared/schema.ts → .max(255)). Раньше был slice(0, 200) —
      // имена 201-255 проходили schema, но handler обрезал silently.
      let normalizedName: string | null = null;
      if (typeof name === "string") {
        const trimmed = name.trim();
        if (trimmed) {
          normalizedName = trimmed.slice(0, 255);
        }
      } else if (name === null) {
        normalizedName = null;
      } else if (name !== undefined) {
        return res.status(400).json({ message: "Имя должно быть строкой" });
      }

      const updated = await storage.setUserName(user.id, normalizedName);

      res.json(updated);
    } catch (err: any) {
      console.error('Error updating user:', err);
      res.status(500).json({ message: 'Ошибка обновления' });
    }
  });
}
