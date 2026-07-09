import { mysqlTable, varchar, int, boolean, text } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Таблица компаний
export const companies = mysqlTable("companies", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }), // Email для уведомлений о выполненных задачах
  createdAt: int("created_at").notNull().default(0),
  // WeSetup integration pairing. Per-company because each TasksFlow
  // company can be linked to a different WeSetup organisation. `null`
  // means the company uses whatever WESETUP_API_KEY is in .env (legacy
  // single-tenant setup).
  wesetupBaseUrl: varchar("wesetup_base_url", { length: 255 }),
  wesetupApiKey: varchar("wesetup_api_key", { length: 255 }),
});

export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  // Телефон БОЛЬШЕ не обязателен: email-ветка авторизации (лендинг,
  // как в ordersflow) создаёт админов без телефона. MySQL unique-индекс
  // допускает несколько NULL, поэтому уникальность телефонных юзеров
  // сохраняется. Телефонный вход просто не находит email-юзеров (phone NULL).
  phone: varchar("phone", { length: 20 }).unique(),
  name: varchar("name", { length: 255 }),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Root (владелец сайта). НЕ выдаётся регистрацией и не равен isAdmin
  // (тот — админ своей компании). Только root управляет глобальными
  // вещами вроде промо-баннеров лендинга. Ставится вручную в БД.
  isRoot: boolean("is_root").notNull().default(false),
  createdAt: int("created_at").notNull().default(0),
  bonusBalance: int("bonus_balance").notNull().default(0), // Баланс дополнительной премии
  companyId: int("company_id"), // FK на companies
  // JSON-массив id воркеров, которыми этот пользователь руководит.
  // Пустой массив или NULL = у пользователя нет подчинённых.
  // Заполняется WeSetup'ом при изменении ManagerScope (там источник
  // истины для иерархии); TasksFlow только хранит и фильтрует.
  // На основе этого:
  //   • /api/tasks возвращает только задачи воркеров из списка
  //     (плюс свои) — для не-админов с подчинёнными
  //   • /api/users возвращает только этих воркеров + себя
  //   • При создании задачи можно назначить только их
  // Админ (isAdmin=true) игнорирует это поле и видит всё.
  managedWorkerIds: text("managed_worker_ids"),
  // Должность сотрудника. Заполняется WeSetup'ом при createUser
  // (передаётся в payload вместе с phone и name). Используется UI
  // Dashboard для отображения «ФИО · Должность» и для сортировки
  // секций группы-по-сотруднику.
  position: varchar("position", { length: 120 }),
  // ===== Email-авторизация (лендинг, ветка как в ordersflow) =====
  // Заполняются только при регистрации через email-форму лендинга.
  // Телефонные юзеры имеют здесь NULL. email уникален (несколько NULL ок).
  email: varchar("email", { length: 255 }).unique(),
  // scrypt-хэш в формате `scrypt$14$salt$hash` (см. server/crypto-password.ts).
  passwordHash: varchar("password_hash", { length: 255 }),
  // Одноразовый токен magic-ссылки входа (32 hex). NULL когда не активен.
  magicToken: varchar("magic_token", { length: 64 }),
  // Unix sec истечения magic-токена (TTL 7 дней). NULL когда нет токена.
  magicTokenExpiresAt: int("magic_token_expires_at"),
});

export const workers = mysqlTable("workers", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  companyId: int("company_id"), // FK на companies
});

export const tasks = mysqlTable("tasks", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  workerId: int("worker_id"),
  requiresPhoto: boolean("requires_photo").notNull().default(false),
  photoUrl: varchar("photo_url", { length: 500 }), // Устаревшее, для совместимости
  photoUrls: text("photo_urls"), // JSON массив URL фотографий (до 10 шт)
  examplePhotoUrl: varchar("example_photo_url", { length: 500 }), // Пример фото для задачи
  isCompleted: boolean("is_completed").notNull().default(false),
  weekDays: varchar("week_days", { length: 20 }), // JSON массив дней: [0,1,2,3,4,5,6] где 0=Вс, 1=Пн, ..., 6=Сб
  monthDay: int("month_day"), // День месяца (1-31) для отображения задачи
  isRecurring: boolean("is_recurring").notNull().default(true), // Повторяющаяся задача (сбрасывается каждый день)
  price: int("price").notNull().default(0), // Стоимость выполнения задачи в рублях
  category: varchar("category", { length: 100 }), // Категория задачи (уборка, готовка и т.д.)
  description: text("description"), // Описание задачи
  companyId: int("company_id"), // FK на companies
  // JSON-blob {kind:'wesetup-cleaning', baseUrl, integrationId, documentId, rowKey, label?}
  // Set when the task was created in «Журнальный» mode and is bound to a row
  // in a remote WeSetup journal. Completion via /api/tasks/:id/complete still
  // works exactly the same — WeSetup polls our state and mirrors the cell.
  // Free-mode tasks have NULL here.
  journalLink: text("journal_link"),
  // Unix seconds. createdAt is set on insert by the route handler;
  // completedAt is set on /complete and cleared on /uncomplete. Rows
  // predating this migration get 0 which the client renders as «раньше».
  createdAt: int("created_at").notNull().default(0),
  completedAt: int("completed_at"),
  // ID воркера, который «забрал» эту задачу выполнив свой
  // sibling-таск (то же documentId+kind+день, см. journalLink).
  // Когда задача с премией fan-out-нута на N человек, первый кто
  // выполнит — у остальных N-1 этот столбец заполняется его id, а
  // isCompleted ставится в true (без начисления премии им).
  // Карточки с claimedByWorkerId уезжают в раздел «Сделано другими».
  // NULL = выполнено самостоятельно (или не выполнено).
  claimedByWorkerId: int("claimed_by_worker_id"),
  // Phase 1 двухстадийной верификации (employee → verifier → done).
  // Полная семантика — в script/_add-verification-cols.ts.
  //
  // verificationStatus:
  //   NULL        = задача без проверки, /complete сразу done (legacy).
  //   'pending'   = ждёт выполнения сотрудником.
  //   'submitted' = сотрудник нажал «Готово», ждёт verifier'а.
  //                 isCompleted=false, balance НЕ начислен.
  //   'approved'  = verifier одобрил. isCompleted=true, balance
  //                 начислен, WeSetup-mirror отправлен.
  //   'rejected'  = verifier отклонил, задача снова активна у
  //                 сотрудника с пометкой rejectReason.
  verificationStatus: varchar("verification_status", { length: 20 }),
  // Кто должен проверить. Заполняется при bulk-assign-today из
  // journal-responsibles. NULL = задача без проверки.
  verifierWorkerId: int("verifier_worker_id"),
  // Кто реально одобрил/отклонил (может быть admin, не verifier).
  verifiedByUserId: int("verified_by_user_id"),
  // Unix sec одобрения/отклонения.
  verifiedAt: int("verified_at"),
  // Текст причины при rejected — показывается сотруднику в карточке.
  rejectReason: text("reject_reason"),
  // JSON-сохранённый payload form values от продавца, ожидающий
  // одобрения заведующей. Звонок в WeSetup `/complete` откладывается
  // до approve — заведующая может отклонить ДО фактической записи в
  // журнал WeSetup. NULL = legacy-задача или verification не нужен.
  // См. routes.ts /api/wesetup/complete-with-values + verify-handler.
  submittedValues: text("submitted_values"),
  // Чек-лист (подзадачи) внутри задачи. JSON-массив пунктов:
  //   [{ id: string, title: string, done: boolean, photoUrls: string[] }]
  // NULL или [] = обычная задача без чек-листа (поведение как раньше).
  // Пункт нельзя отметить готовым без фото (requiresPhoto на уровне пункта
  // подразумевается). Задача считается выполненной, когда все пункты done.
  // При ежедневном сбросе повторяющейся задачи у пунктов чистятся done+photoUrls,
  // заголовки остаются.
  checklist: text("checklist"),
});

export const insertUserSchema = z.object({
  phone: z.string().min(1, "Номер телефона обязателен").refine(
    (val) => {
      const normalized = val.replace(/\s+/g, "").replace(/-/g, "");
      // Проверяем формат: +7 и затем 9-10 цифр (для российских номеров)
      return /^\+7\d{9,10}$/.test(normalized);
    },
    "Неверный формат номера телефона (формат: +7XXXXXXXXX или +7XXXXXXXXXX)"
  ),
  // .max(255): MySQL column users.name = VARCHAR(255). Без cap'а в Zod
  // имя >255 символов проходило валидацию, но MySQL тихо обрезал — юзер
  // регистрировался с неполным именем, не зная об этом.
  name: z.string().max(255, "Имя не должно превышать 255 символов").optional(),
  isAdmin: z.boolean().optional().default(false),
  position: z.string().trim().max(120).optional().nullable(),
});

export const updateUserSchema = z.object({
  phone: z.string().min(1, "Номер телефона обязателен").refine(
    (val) => {
      const normalized = val.replace(/\s+/g, "").replace(/-/g, "");
      return /^\+7\d{9,10}$/.test(normalized);
    },
    "Неверный формат номера телефона (формат: +7XXXXXXXXX или +7XXXXXXXXXX)"
  ),
  name: z.string().max(255, "Имя не должно превышать 255 символов").nullable().optional(),
  position: z.string().trim().max(120).nullable().optional(),
});

export const loginSchema = z.object({
  phone: z.string().min(1, "Номер телефона обязателен").refine(
    (val) => {
      const normalized = val.replace(/\s+/g, "").replace(/-/g, "");
      // Проверяем формат: +7 и затем 9-10 цифр (для российских номеров)
      return /^\+7\d{9,10}$/.test(normalized);
    },
    "Неверный формат номера телефона (формат: +7XXXXXXXXX или +7XXXXXXXXXX)"
  ),
});

// ===== Email-авторизация (лендинг) =====
// Формат email валидируем мягко (min(1)); строгая проверка (regex + MX +
// подсказка опечаток) — на сервере в server/email-validate.ts, чтобы
// shared-схема не зависела от DNS и работала и на клиенте.
export const startSchema = z.object({
  email: z.string().min(1, "Введите email"),
});

export const loginEmailSchema = z.object({
  email: z.string().min(1, "Введите email"),
  password: z.string().min(1, "Введите пароль"),
});

export const recoverSchema = z.object({
  email: z.string().min(1, "Введите email"),
});

export const updateEmailSchema = z.object({
  email: z.string().min(1, "Введите email"),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "Пароль должен быть не короче 6 символов").max(128),
});

export type StartInput = z.infer<typeof startSchema>;
export type LoginEmailInput = z.infer<typeof loginEmailSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

export const insertWorkerSchema = createInsertSchema(workers).pick({
  name: true,
});

// Пункт чек-листа (подзадача). done ставится только вместе с фото —
// это проверяется на сервере в эндпоинте отметки пункта.
export const checklistItemSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1, "Название пункта обязательно").max(200),
  done: z.boolean().optional().default(false),
  photoUrls: z.array(z.string()).optional().default([]),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const insertTaskSchema = createInsertSchema(tasks).pick({
  title: true,
  workerId: true,
  requiresPhoto: true,
}).extend({
  // Чек-лист (подзадачи). Пустой/отсутствует = обычная задача.
  checklist: z.array(checklistItemSchema).max(30).nullable().optional(),
  photoUrl: z.string().nullable().optional(), // Устаревшее, для совместимости
  photoUrls: z.array(z.string()).nullable().optional(), // Массив URL фотографий (до 10 шт)
  examplePhotoUrl: z.string().nullable().optional(), // URL примера фото
  isCompleted: z.boolean().optional().default(false),
  // .int() обязателен: без него Zod пропустит [1.5, 3] и в UI бейджах
  // появится «Пн, ,Ср» (WEEK_DAY_SHORT_NAMES[1.5]=undefined). Сервер
  // тоже использует weekDays для is-task-visible-today фильтра — float
  // никогда не совпадёт с integer dayOfWeek.
  weekDays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  // .int() обязателен: monthDay=15.5 !== 15 (Date.getDate()) → задача
  // не будет показываться в свой день. Раньше Zod пропускал.
  monthDay: z.number().int().min(1).max(31).nullable().optional(),
  isRecurring: z.boolean().optional().default(true), // повторяющаяся задача
  // .int() обязателен: drizzle column int. Без guard'а float (например
  // юзер ввёл «50.5») попадёт в БД через ZodError-bypass, MySQL cast'нет
  // в 50 silently — расхождение между ZOD-form-input и БД value. Также
  // .int() блокирует Infinity (Number.isInteger(Infinity)===false).
  price: z.number().int().min(0).optional().default(0),
  category: z.string().max(100).nullable().optional(), // категория задачи
  // Описание — DB column TEXT (64KB max). Без zod cap юзер мог
  // отправить 50KB описание; multi-tenant SaaS потенциально
  // эксплойтнуть. 5000 символов — щедро для UX (~1 страница A4),
  // одновременно блокирует abusive payloads.
  description: z.string().max(5000, "Описание не должно превышать 5000 символов").nullable().optional(),
  // Опциональная привязка к строке журнала во внешней системе (WeSetup).
  // Хранится как stringified JSON; шейп описан в shared/journal-link.ts.
  journalLink: z.string().nullable().optional(),
  // Phase 1 двухстадийной верификации. Когда задана — задача после
  // /complete от сотрудника НЕ переходит в done, а ждёт approve от
  // verifier'а через POST /api/tasks/:id/verify.
  verifierWorkerId: z.number().int().positive().nullable().optional(),
});

// Схема валидации для регистрации компании
const phoneValidation = z.string().min(1, "Номер телефона обязателен").refine(
  (val) => {
    const normalized = val.replace(/\s+/g, "").replace(/-/g, "");
    return /^\+7\d{9,10}$/.test(normalized);
  },
  "Неверный формат номера телефона (формат: +7XXXXXXXXX или +7XXXXXXXXXX)"
);

export const registerCompanySchema = z.object({
  phone: phoneValidation,
  // Все .max(255): MySQL columns companies.name, companies.email, users.name —
  // VARCHAR(255). Без cap'а в Zod длинная строка проходила валидацию,
  // MySQL тихо обрезал — пользователь регистрировал компанию с обрезанным
  // названием, не зная об этом.
  companyName: z
    .string()
    .min(1, "Название компании обязательно")
    .max(255, "Название не должно превышать 255 символов"),
  email: z
    .string()
    .email("Неверный формат email")
    .max(255, "Email не должен превышать 255 символов"),
  adminName: z
    .string()
    .max(255, "Имя не должно превышать 255 символов")
    .optional(),
});

export const insertCompanySchema = z.object({
  name: z
    .string()
    .min(1, "Название компании обязательно")
    .max(255, "Название не должно превышать 255 символов"),
  email: z
    .string()
    .email("Неверный формат email")
    .max(255, "Email не должен превышать 255 символов")
    .optional(),
});

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Worker = typeof workers.$inferSelect;
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
// Переопределяем Task чтобы weekDays, photoUrls и checklist были массивами (парсятся из JSON в storage.ts)
export type Task = Omit<typeof tasks.$inferSelect, 'weekDays' | 'photoUrls' | 'checklist'> & {
  weekDays: number[] | null;
  photoUrls: string[];
  checklist: ChecklistItem[];
};
export type InsertTask = z.infer<typeof insertTaskSchema>;

// API Keys — для server-to-server интеграций (managermagday и других).
//
// keyEncrypted: AES-256-GCM шифрованный plaintext в формате
// `iv(base64).tag(base64).ciphertext(base64)`. Ключ шифрования — ENV
// `API_KEY_REVEAL_SECRET` (sha256 от него = 32-байт AES-ключ). Колонка
// nullable для back-compat: ключи созданные до этой миграции остаются
// «view-only по prefix», их можно только перевыпустить через rotate.
//
// SECURITY-TRADEOFF: hash-only был неуязвим к БД-leak (плейнтекст
// никак не восстановить). С keyEncrypted при leak БД + env'а злоумышленник
// получает все ключи. Это сознательная регрессия ради UX «забыл скопировать —
// открой и посмотри». Рекомендуется хранить API_KEY_REVEAL_SECRET в
// отдельном вольт'е (1Password / hashicorp vault), не в .env рядом с
// БД-creds, чтобы leak'и были независимы.
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  keyEncrypted: text("key_encrypted"),
  companyId: int("company_id").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: int("created_at").notNull().default(0),
  lastUsedAt: int("last_used_at").default(0),
  revokedAt: int("revoked_at").default(0),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// Сессии — раньше жили в MemoryStore (in-process), и при каждом
// рестарте сервера (deploy / crash / scaling) все логины теряются.
// Жалоба владельца 2026-05-05 «постоянно вылетает с акка».
//
// Колонки:
//   sid     — express-session id (≤128 символов, обычно 32-байтный b64)
//   expires — unix-секунды истечения. Cron подчищает row'ы где
//             expires < NOW() (см. session-store.ts)
//   data    — JSON-сериализованная session.cookie + req.session
//             поля (userId и т.п.). MEDIUMTEXT хватает на 16MB.
export const sessions = mysqlTable("sessions", {
  sid: varchar("sid", { length: 128 }).primaryKey(),
  expires: int("expires").notNull(),
  data: text("data").notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type InsertSessionRow = typeof sessions.$inferInsert;

// Очередь повторных доставок webhook'ов в WeSetup. Когда таск
// закрывается / открывается обратно, TasksFlow отправляет POST
// /api/integrations/tasksflow/complete на WeSetup. Если WeSetup
// не отвечает (5xx, timeout, network error) — раньше мы делали
// один retry и забывали. Теперь наполняем очередь, и worker
// в server/index.ts ретраит по экспоненциальной лестнице:
//   попытка 0  — мгновенная (POST в обработчике)
//   попытка 1  — через 5 мин
//   попытка 2  — через 15 мин
//   попытка 3  — через 1 час
//   попытка 4  — через 6 часов
//   попытка 5  — через 24 часа
//   после 5    — status=2 (failed), уведомляем admin'а через лог
//
// status: 0=pending, 1=delivered, 2=failed_permanent, 3=cancelled
export const webhookDeliveries = mysqlTable("webhook_deliveries", {
  id: int("id").primaryKey().autoincrement(),
  // taskId не FK — task может быть удалён, но журнальный delivery всё ещё нужно завершить
  taskId: int("task_id").notNull(),
  // "complete" или "uncomplete" — управляет какую `isCompleted`
  // отдавать в payload при retry'е (для отображения в логе).
  eventType: varchar("event_type", { length: 20 }).notNull(),
  // Frozen target: если org перенастроит интеграцию между retry'ями,
  // мы всё равно пытаемся доставить туда, куда задача шла изначально.
  targetUrl: varchar("target_url", { length: 500 }).notNull(),
  // Plaintext API key — TasksFlow и так хранит ключи в clear, кроме того
  // Wesetup verify через проверку bearer'а в БД. Без копии не получится
  // ретраить если ключ отозван — но это «правильно failed», т.к.
  // отозванный ключ должен отвалиться.
  apiKey: varchar("api_key", { length: 255 }).notNull(),
  // JSON payload который отдадим в WeSetup body.
  payload: text("payload").notNull(),
  attempts: int("attempts").notNull().default(0),
  status: int("status").notNull().default(0),
  // Unix-ms когда можно ретраить. Worker делает SELECT … WHERE
  // status=0 AND nextRetryAt <= now() ORDER BY nextRetryAt LIMIT 50.
  nextRetryAt: int("next_retry_at").notNull(),
  lastError: text("last_error"),
  createdAt: int("created_at").notNull().default(0),
  updatedAt: int("updated_at").notNull().default(0),
});

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

// Приглашения сотрудников через QR-код. Админ генерит запись, отдаёт
// сотруднику QR/ссылку вида /join/<token>. По accept'у создаётся User
// в companyId приглашения с уже выставленными position/isAdmin.
// Активным считается приглашение с usedAt IS NULL AND revokedAt IS NULL.
// Без TTL — живёт пока его не использовали или не отозвали.
export const invitations = mysqlTable("invitations", {
  id: int("id").primaryKey().autoincrement(),
  // base64url, 32 байта энтропии (256 бит). Колонка varchar(64) с запасом.
  token: varchar("token", { length: 64 }).notNull().unique(),
  companyId: int("company_id").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  // Опционально предзадаётся админом при генерации QR.
  position: varchar("position", { length: 120 }),
  // true если при генерации админ выбрал role=admin или role=manager
  // (та же логика "requestedAdmin", что в POST /api/users).
  isAdmin: boolean("is_admin").notNull().default(false),
  // Unix sec; NULL пока не использовали.
  usedAt: int("used_at"),
  usedByUserId: int("used_by_user_id"),
  // Unix sec; NULL пока не отозвали.
  revokedAt: int("revoked_at"),
  createdAt: int("created_at").notNull().default(0),
});

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

/**
 * Audit log событий жизненного цикла задач.
 * Phase 2.10 спека Wesetup
 * (docs/superpowers/specs/2026-05-09-wesetup-tasksflow-integration-design.md, П-17).
 *
 * TasksFlow пишет сюда каждое событие task lifecycle. Wesetup при
 * рендере объединённого audit-report'а подтягивает события через
 * GET /api/audit?since=...&taskIds=... и merge'ит хронологически с
 * Wesetup AuditLog. Никаких физически объединённых таблиц — каждая
 * система хранит своё, объединение только в момент рендера.
 *
 * Пример action'ов:
 *   - "task.created"          (POST /api/tasks)
 *   - "task.completed"        (POST /api/tasks/:id/complete)
 *   - "task.uncompleted"      (POST /api/tasks/:id/uncomplete)
 *   - "task.claimed_by_other" (claim-siblings auto-fired)
 *   - "task.verified"         (verifier approve)
 *   - "task.rejected"         (verifier reject)
 *   - "task.deleted"          (DELETE /api/tasks/:id)
 *   - "task.updated"          (PUT /api/tasks/:id)
 *
 * Retention: 90 дней (cron-cleanup как у webhook_deliveries) — хватает
 * для compliance-отчётов.
 */
export const auditLog = mysqlTable("audit_log", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id"), // FK на companies, для multi-tenant filter
  // Кто сделал. NULL = system action (cron, claim-siblings).
  actorWorkerId: int("actor_worker_id"),
  // К какой задаче относится. NULL для bulk events.
  taskId: int("task_id"),
  // Action type — см. список в комментарии модели.
  action: varchar("action", { length: 64 }).notNull(),
  // JSON details: {oldStatus, newStatus, claimedByName, ...}
  payload: text("payload"),
  // Unix sec момента события.
  createdAt: int("created_at").notNull().default(0),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// ===== Промо-баннеры (узкая полоса сверху + вставка в контент) =====
// Глобальные маркетинговые баннеры публичного сайта. Управляются из
// админки (раздел «Баннеры»), отдаются публичным API активных баннеров.
export const banners = mysqlTable("banners", {
  id: int("id").primaryKey().autoincrement(),
  // Текст баннера (можно с эмодзи). Обязателен.
  text: varchar("text", { length: 500 }).notNull(),
  // Куда ведёт (URL или внутренний путь). NULL = баннер некликабельный.
  linkUrl: varchar("link_url", { length: 500 }),
  // Подпись кнопки/ссылки. NULL = весь баннер кликается без отдельной кнопки.
  linkLabel: varchar("link_label", { length: 120 }),
  // Где показывать: 'top' (полоса сверху), 'content' (блок в контенте), 'both'.
  placement: varchar("placement", { length: 16 }).notNull().default("top"),
  // Цвета — любой CSS-цвет/градиент. NULL = дефолтная тема.
  bgColor: varchar("bg_color", { length: 64 }),
  textColor: varchar("text_color", { length: 64 }),
  // Включён ли. Выключенные не показываются и не отдаются публичным API.
  active: boolean("active").notNull().default(true),
  // Окно показа (unix sec). NULL = без ограничения с этой стороны.
  startsAt: int("starts_at"),
  endsAt: int("ends_at"),
  // Порядок при нескольких активных (меньше = выше/раньше).
  position: int("position").notNull().default(0),
  createdAt: int("created_at").notNull().default(0),
  updatedAt: int("updated_at").notNull().default(0),
});

export type Banner = typeof banners.$inferSelect;
export type InsertBanner = typeof banners.$inferInsert;

// Валидация тела запроса при создании/правке баннера из админки.
export const bannerInputSchema = z.object({
  text: z.string().trim().min(1, "Текст обязателен").max(500),
  linkUrl: z.string().trim().max(500).nullish(),
  linkLabel: z.string().trim().max(120).nullish(),
  placement: z.enum(["top", "content", "both"]).default("top"),
  bgColor: z.string().trim().max(64).nullish(),
  textColor: z.string().trim().max(64).nullish(),
  active: z.boolean().default(true),
  startsAt: z.number().int().nullish(),
  endsAt: z.number().int().nullish(),
  position: z.number().int().default(0),
});
export type BannerInput = z.infer<typeof bannerInputSchema>;

