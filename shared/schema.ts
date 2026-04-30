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
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  isAdmin: boolean("is_admin").notNull().default(false),
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
  name: z.string().optional(),
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
  name: z.string().nullable().optional(),
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

export const insertWorkerSchema = createInsertSchema(workers).pick({
  name: true,
});

export const insertTaskSchema = createInsertSchema(tasks).pick({
  title: true,
  workerId: true,
  requiresPhoto: true,
}).extend({
  photoUrl: z.string().nullable().optional(), // Устаревшее, для совместимости
  photoUrls: z.array(z.string()).nullable().optional(), // Массив URL фотографий (до 10 шт)
  examplePhotoUrl: z.string().nullable().optional(), // URL примера фото
  isCompleted: z.boolean().optional().default(false),
  weekDays: z.array(z.number().min(0).max(6)).nullable().optional(), // массив дней недели [0-6]
  monthDay: z.number().min(1).max(31).nullable().optional(), // день месяца (1-31)
  isRecurring: z.boolean().optional().default(true), // повторяющаяся задача
  price: z.number().min(0).optional().default(0), // стоимость выполнения в рублях
  category: z.string().max(100).nullable().optional(), // категория задачи
  description: z.string().nullable().optional(), // описание задачи
  // Опциональная привязка к строке журнала во внешней системе (WeSetup).
  // Хранится как stringified JSON; шейп описан в shared/journal-link.ts.
  journalLink: z.string().nullable().optional(),
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
  companyName: z.string().min(1, "Название компании обязательно"),
  email: z.string().email("Неверный формат email"),
  adminName: z.string().optional(),
});

export const insertCompanySchema = z.object({
  name: z.string().min(1, "Название компании обязательно"),
  email: z.string().email("Неверный формат email").optional(),
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
// Переопределяем Task чтобы weekDays и photoUrls были массивами (парсятся из JSON в storage.ts)
export type Task = Omit<typeof tasks.$inferSelect, 'weekDays' | 'photoUrls'> & {
  weekDays: number[] | null;
  photoUrls: string[];
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

