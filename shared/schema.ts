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
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  companyId: int("company_id").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: int("created_at").notNull().default(0),
  lastUsedAt: int("last_used_at").default(0),
  revokedAt: int("revoked_at").default(0),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

