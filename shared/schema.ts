import { mysqlTable, varchar, int, boolean, text, bigint } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { consentSchema, newPinSchema, pinSchema } from "./pin";

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
  // IANA-пояс: по нему в местную полночь сбрасываются повторяющиеся задачи
  // и считаются дни в истории и отчётах (см. shared/day.ts).
  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Moscow"),
  // Последний местный день (YYYY-MM-DD), с которого задачи уже сброшены.
  lastResetDay: varchar("last_reset_day", { length: 10 }),
  // Напоминания в Telegram: JSON {morning, evening, digest} со временем
  // «ЧЧ:ММ» или null; NULL — значения по умолчанию (shared/notify.ts).
  notifySettings: text("notify_settings"),
  // Какие напоминания уже ушли сегодня: {morning: "YYYY-MM-DD", ...}.
  notifyState: text("notify_state"),
  // Фото-отчёты: JSON {stamp, cameraOnly}; NULL — по умолчанию (shared/photo-settings.ts).
  photoSettings: text("photo_settings"),
  // Тариф (shared/plans.ts): NULL — «Старт». plan_until — до какого
  // момента действует платный тариф; NULL — бессрочно.
  plan: varchar("plan", { length: 20 }),
  planUntil: int("plan_until"),
  // Права встроенной роли «Сотрудник»: JSON {employeeApproval}; NULL — как
  // раньше, без проверки (shared/roles.ts). Новым компаниям пишется явно.
  accessSettings: text("access_settings"),
});

/**
 * Свои роли компании (например «Руководитель»): название и набор прав
 * JSON (shared/roles.ts). Человек получает роль через users.role_id.
 * Удаление роли переводит её людей в «Сотрудники». Таблицу создаёт
 * script/_add-roles-notify.ts.
 */
export const companyRoles = mysqlTable("company_roles", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 60 }).notNull(),
  permissions: text("permissions").notNull(),
  createdAt: int("created_at").notNull().default(0),
  updatedAt: int("updated_at").notNull().default(0),
});

export type CompanyRoleRow = typeof companyRoles.$inferSelect;

/**
 * Точки компании (кафе, магазины, объекты сети). Сотрудник привязан к
 * точке через users.location_id — по ней фильтруются задачи и отчёты.
 * Удаление — архивом (archived_at), чтобы не рвать историю.
 */
export const locations = mysqlTable("locations", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  address: varchar("address", { length: 255 }),
  createdAt: int("created_at").notNull().default(0),
  archivedAt: int("archived_at"),
});

export type Location = typeof locations.$inferSelect;

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
  // ===== Привязка Telegram (бот @thetasksflowbot) =====
  // Заполняются через Telegram Login Widget на странице Аккаунт.
  // telegram_user_id UNIQUE — один Telegram не может быть привязан к двум
  // сотрудникам (иначе непонятно, от чьего имени бот ставит задачи).
  telegramUserId: bigint("telegram_user_id", { mode: "number" }),
  telegramUsername: varchar("telegram_username", { length: 64 }),
  telegramFirstName: varchar("telegram_first_name", { length: 128 }),
  telegramPhotoUrl: varchar("telegram_photo_url", { length: 512 }),
  // chat_id личного чата с ботом. Известен только после /start — бот не
  // может написать первым, пока пользователь его не запустил.
  tgChatId: bigint("tg_chat_id", { mode: "number" }),
  // Unix sec привязки аккаунта и первого /start соответственно.
  tgLinkedAt: int("tg_linked_at"),
  tgStartedAt: int("tg_started_at"),
  // Одноразовый код привязки через бота (t.me/bot?start=<код>).
  // Основной путь: в отличие от Login Widget не требует /setdomain,
  // доступности telegram.org в браузере и рабочего попапа.
  tgLinkCode: varchar("tg_link_code", { length: 32 }),
  tgLinkCodeExpiresAt: int("tg_link_code_expires_at"),
  // ===== Вход по PIN (4 цифры) =====
  // scrypt-хэш PIN. NULL = PIN ещё не задан: человек придумает его при
  // первом входе по телефону (или его задаст руководитель).
  pinHash: varchar("pin_hash", { length: 255 }),
  // Неверные попытки подряд и блокировка (unix sec) — см. server/pin-auth.ts.
  pinFailedAttempts: int("pin_failed_attempts").notNull().default(0),
  pinLockedUntil: int("pin_locked_until"),
  pinUpdatedAt: int("pin_updated_at"),
  // Unix sec, когда человек сам дал согласие на обработку ПД при
  // регистрации. NULL — аккаунт создал руководитель или интеграция.
  pdConsentAt: int("pd_consent_at"),
  // Точка, где работает сотрудник (locations.id); NULL — без точки.
  locationId: int("location_id"),
  // Своя роль компании (company_roles.id); NULL — «Сотрудник» или админ.
  roleId: int("role_id"),
  // Личные настройки уведомлений JSON (shared/notify.ts); NULL — всё включено.
  notifyPrefs: text("notify_prefs"),
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
  // Срок выполнения — unix sec локальной полуночи целевого дня.
  // Семантика намеренно мягкая: задача со сроком видна СРАЗУ и не
  // скрывается после срока, только получает бейдж «Просрочено». Так
  // сотрудник может сделать раньше и не теряет задачу, если опоздал.
  // Взаимоисключён с isRecurring: срок → задача разовая (иначе она
  // воскресала бы каждый день ежедневным сбросом).
  dueDate: int("due_date"),
  // Примеры «как надо» — JSON-массив URL. Пришёл на смену одиночному
  // examplePhotoUrl: Telegram-бот принимает альбом и раскладывает фото
  // по задачам. Чтение с fallback на legacy-колонку (см. server/storage.ts),
  // запись — всегда сюда + дубль первого URL в старую колонку.
  examplePhotoUrls: text("example_photo_urls"),
  // Своё время напоминания «ЧЧ:ММ» по поясу компании: исполнителю придёт
  // push (и сообщение в Telegram), если задача к этому времени не сделана.
  remindAt: varchar("remind_at", { length: 5 }),
  // Местный день, когда напоминание уже ушло, — чтобы не повторять.
  remindSentDay: varchar("remind_sent_day", { length: 10 }),
});

// ===== Таблицы Telegram-бота =====

/**
 * Черновик задач, распознанных из сообщения. Живёт 30 минут: пользователь
 * видит карточку, крутит кнопками поля и жмёт «Создать».
 *
 * Драфт создаётся ДО обращения к AI (status='composing'), чтобы апдейт
 * Telegram был подтверждён мгновенно и бот не держал соединение на время
 * разбора (~до 150с).
 */
export const telegramTaskDrafts = mysqlTable("telegram_task_drafts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("user_id").notNull(),
  companyId: int("company_id").notNull(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  // Сообщение-карточка: редактируем его вместо спама новыми сообщениями.
  messageId: bigint("message_id", { mode: "number" }),
  // Дедуп альбомов (media_group_id) и ретраев одного апдейта. UNIQUE.
  sourceKey: varchar("source_key", { length: 191 }),
  // composing | confirming | confirmed | cancelled | expired
  status: varchar("status", { length: 20 }).notNull(),
  rawText: text("raw_text"),
  // JSON-массив сегментов (нормализованных) + флаг included на каждом.
  segments: text("segments"),
  // JSON [{ key, fileId, filename, targetSegmentIndexes[] }]
  attachments: text("attachments"),
  createdAt: int("created_at").notNull(),
  expiresAt: int("expires_at").notNull(),
  /**
   * Когда создать задачи без подтверждения.
   *
   * Руководитель часто пишет задачу и уходит, не нажав «Создать» —
   * без этого работа просто терялась вместе с протухшим черновиком.
   * NULL = авто-создание отключено (черновик уже обработан).
   */
  autoCreateAt: int("auto_create_at"),
});

/**
 * Соответствие «сообщение бота ↔ задача». Нужно, чтобы фото-reply на
 * карточку задачи попало именно в эту задачу (а не в последнюю активную).
 */
export const telegramTaskMessages = mysqlTable("telegram_task_messages", {
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  messageId: bigint("message_id", { mode: "number" }).notNull(),
  taskId: int("task_id").notNull(),
  // Если сообщение относится к конкретному пункту чек-листа.
  checklistItemId: varchar("checklist_item_id", { length: 64 }),
  createdAt: int("created_at").notNull(),
});

/**
 * Привязка группового чата к аккаунту-владельцу.
 *
 * Смысл: в рабочей группе задачу может попросить любой — повар, курьер,
 * кто угодно, — и у большинства из них нет аккаунта TasksFlow. Отшивать
 * их сообщением «привяжи аккаунт» значит сделать бота бесполезным для
 * всей смены. Вместо этого задача создаётся в компании владельца группы,
 * а имя просившего уходит в описание.
 *
 * Владелец — тот, кто первым сказал /start в этой группе (first-writer-wins).
 */
export const telegramGroupOwners = mysqlTable("telegram_group_owners", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  ownerUserId: int("owner_user_id").notNull(),
  companyId: int("company_id").notNull(),
  /** Название группы на момент привязки — для понятных логов. */
  chatTitle: varchar("chat_title", { length: 255 }),
  createdAt: int("created_at").notNull(),
});

/**
 * Состояние чата для пути без reply: нажал «📸 Фото» → следующее фото
 * в чате уходит в эту задачу. TTL 15 минут.
 */
export const telegramChatState = mysqlTable("telegram_chat_state", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  awaitingTaskId: int("awaiting_task_id"),
  awaitingItemId: varchar("awaiting_item_id", { length: 64 }),
  updatedAt: int("updated_at").notNull(),
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
  // Своя роль компании; null — «Сотрудник».
  roleId: z.number().int().positive().nullable().optional(),
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
  // Роль: "admin" — администратор, число — своя роль, null — «Сотрудник».
  // Не передана — роль не меняется.
  role: z.union([z.literal("admin"), z.number().int().positive()]).nullable().optional(),
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
  // Без PIN сервер отвечает, какой шаг нужен дальше: ввести PIN или
  // придумать его (первый вход). С PIN — проверяет и открывает сессию.
  pin: pinSchema.optional(),
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
  examplePhotoUrl: z.string().nullable().optional(), // URL примера фото (legacy, одиночный)
  // Примеры фото «как надо» — массив. Telegram-бот кладёт сюда фото из
  // сообщения; веб-форма пока пишет одиночный examplePhotoUrl.
  examplePhotoUrls: z.array(z.string()).nullable().optional(),
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
  // Срок — unix sec локальной полуночи. Взаимоисключён с isRecurring:
  // нормализация на стороне вызывающего форсит isRecurring=false при
  // заданном dueDate (иначе ежедневный сброс воскресит разовую задачу).
  dueDate: z.number().int().nullable().optional(),
  // Своё время напоминания «ЧЧ:ММ» (пояс компании); null — без напоминания.
  remindAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время напоминания в формате ЧЧ:ММ")
    .nullable()
    .optional(),
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
  pin: newPinSchema,
  consent: consentSchema,
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
// Переопределяем Task чтобы weekDays, photoUrls, checklist и examplePhotoUrls
// были массивами (парсятся из JSON в storage.ts)
export type Task = Omit<
  typeof tasks.$inferSelect,
  'weekDays' | 'photoUrls' | 'checklist' | 'examplePhotoUrls'
> & {
  weekDays: number[] | null;
  photoUrls: string[];
  checklist: ChecklistItem[];
  // Всегда массив: при пустой колонке storage подставляет legacy
  // examplePhotoUrl одним элементом (или [] если и его нет).
  examplePhotoUrls: string[];
};
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Типы таблиц Telegram-бота
export type TelegramTaskDraft = typeof telegramTaskDrafts.$inferSelect;
export type TelegramTaskMessage = typeof telegramTaskMessages.$inferSelect;
export type TelegramChatStateRow = typeof telegramChatState.$inferSelect;
export type TelegramGroupOwner = typeof telegramGroupOwners.$inferSelect;

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
  // Своя роль компании, которую получит принявший приглашение.
  roleId: int("role_id"),
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

/**
 * История повторяющихся задач — по строке на задачу и день. Раньше ночной
 * сброс стирал фото и сам факт выполнения. Теперь перед сбросом выполненная
 * задача переносится сюда снимком (фото, чек-лист, проверка), а не
 * выполненная по расписанию — строкой missed. Файлы фото не удаляются
 * (кроме PHOTO_RETENTION_DAYS, если он задан).
 *
 * Уникальность (task_id, day) и индексы создаёт script/_add-company-features.ts.
 */
export const taskHistory = mysqlTable("task_history", {
  id: int("id").primaryKey().autoincrement(),
  taskId: int("task_id").notNull(),
  companyId: int("company_id"),
  workerId: int("worker_id"),
  // Местный день компании, YYYY-MM-DD.
  day: varchar("day", { length: 10 }).notNull(),
  // done — сделал сам; claimed — сделал коллега (журнальная задача);
  // missed — была в расписании, но не выполнена.
  status: varchar("status", { length: 16 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  // Премия, начисленная за этот день (0 для claimed/missed).
  price: int("price").notNull().default(0),
  completedAt: int("completed_at"),
  photoUrls: text("photo_urls"), // JSON string[]
  checklist: text("checklist"), // JSON ChecklistItem[] — снимок с фото пунктов
  claimedByWorkerId: int("claimed_by_worker_id"),
  verificationStatus: varchar("verification_status", { length: 20 }),
  verifiedByUserId: int("verified_by_user_id"),
  verifiedAt: int("verified_at"),
  createdAt: int("created_at").notNull().default(0),
});

export type TaskHistoryRow = typeof taskHistory.$inferSelect;
export type InsertTaskHistory = typeof taskHistory.$inferInsert;
export type TaskHistoryStatus = "done" | "claimed" | "missed";

// ===== Push-уведомления =====
// Устройство, куда слать уведомления: браузер или установленное PWA и
// Android-приложение (Web Push) либо iOS-приложение (APNs). Таблицу
// создаёт script/_add-push-subscriptions.ts.
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  companyId: int("company_id"),
  // web | apns
  kind: varchar("kind", { length: 8 }).notNull(),
  // web — URL push-сервиса браузера, apns — токен устройства.
  endpoint: text("endpoint").notNull(),
  // sha256(endpoint): уникальность длинного endpoint без индекса по TEXT.
  endpointHash: varchar("endpoint_hash", { length: 64 }).notNull().unique(),
  p256dh: varchar("p256dh", { length: 255 }),
  auth: varchar("auth", { length: 64 }),
  // Только для apns: sandbox | production.
  environment: varchar("environment", { length: 16 }),
  userAgent: varchar("user_agent", { length: 255 }),
  createdAt: int("created_at").notNull().default(0),
  lastSeenAt: int("last_seen_at").notNull().default(0),
  // Подряд неудачных отправок (не 404/410 — те удаляют сразу).
  failures: int("failures").notNull().default(0),
});

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

// ===== Оплата тарифов (Робокасса) =====
// Таблицы создаёт script/_add-billing.ts; правила — shared/billing.ts и
// server/billing. Суммы — целые рубли, время — unix sec.

// Цены: строка — тариф на N месяцев (PRIMARY KEY plan+months). Правит root.
export const billingPrices = mysqlTable("billing_prices", {
  plan: varchar("plan", { length: 20 }).notNull(),
  months: int("months").notNull(),
  priceRub: int("price_rub").notNull(),
  updatedAt: int("updated_at").notNull().default(0),
});

// Заказ на оплату. id уходит в Робокассу как InvId, поэтому int.
export const paymentOrders = mysqlTable("payment_orders", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  // Кто оформил; у автосписаний — NULL.
  userId: int("user_id"),
  email: varchar("email", { length: 255 }),
  plan: varchar("plan", { length: 20 }).notNull(),
  months: int("months").notNull(),
  amountRub: int("amount_rub").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  // pending | paid | expired | refunded | cancelled (счёт отменён)
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  // Тестовый режим Робокассы: подпись проверяется тестовыми паролями.
  isTest: boolean("is_test").notNull().default(false),
  // Галочка автосписаний при оформлении: этот платёж — первый в серии.
  recurringConsent: boolean("recurring_consent").notNull().default(false),
  // Для автосписания — id первого платежа серии (PreviousInvoiceID).
  recurringChargeOf: int("recurring_charge_of"),
  // До какого момента оплата продлила тариф.
  planUntilAfter: int("plan_until_after"),
  // Тариф и срок до оплаты — чтобы вернуть их, если деньги вернули.
  // "" — тарифа не было («Старт»); NULL — неизвестно (оплата до 11.2026).
  planBefore: varchar("plan_before", { length: 20 }),
  planUntilBefore: int("plan_until_before"),
  // Последняя сверка с кассой (OpStateExt) — для зависших «ожидает оплаты».
  checkedAt: int("checked_at"),
  // Возврат через API Робокассы: sending | pending | uncertain | finished | canceled.
  refundStatus: varchar("refund_status", { length: 16 }),
  refundRequestId: varchar("refund_request_id", { length: 64 }),
  // Когда возврат начали отправлять: «sending» дольше 10 минут — завис.
  refundRequestedAt: int("refund_requested_at"),
  refundedAt: int("refunded_at"),
  // Тело уведомления ResultURL — для разбора спорных платежей.
  rawResult: text("raw_result"),
  createdAt: int("created_at").notNull().default(0),
  paidAt: int("paid_at"),
  // card — картой/СБП через кассу, invoice — по счёту, promo — промокод на всю сумму.
  paymentMethod: varchar("payment_method", { length: 16 }).notNull().default("card"),
  // Цена без скидки; NULL — скидки не было (сумма = amount_rub).
  baseRub: int("base_rub"),
  discountRub: int("discount_rub").notNull().default(0),
  promoCode: varchar("promo_code", { length: 32 }),
  // Счёт: оплатить до.
  invoiceDueAt: int("invoice_due_at"),
  // plan — тариф, topup — пополнение баланса (plan = 'topup', months = 0).
  orderKind: varchar("order_kind", { length: 8 }).notNull().default("plan"),
  // Скидка по акции: снимок на момент заказа.
  promotionId: int("promotion_id"),
  promotionPercent: int("promotion_percent"),
  promotionDiscountRub: int("promotion_discount_rub").notNull().default(0),
  // Откуда discount_rub: code — введённый промокод, lifetime — постоянная
  // скидка компании (такой заказ не тратит использования кода). NULL — code.
  discountSource: varchar("discount_source", { length: 8 }),
  // Оплачено баллами (amount_rub — только деньги).
  pointsRub: int("points_rub").notNull().default(0),
  // Баллы заказа: held → spent | released (→ spent | short при поздней
  // оплате) → returned (возврат). Пополнение: credited ⇄ refund_hold → refunded.
  pointsState: varchar("points_state", { length: 12 }),
});

// Промокоды (root): скидка в процентах или рублях на оплату тарифа.
export const promoCodes = mysqlTable("promo_codes", {
  id: int("id").primaryKey().autoincrement(),
  // Верхний регистр, без пробелов.
  code: varchar("code", { length: 32 }).notNull().unique(),
  // percent | fixed
  kind: varchar("kind", { length: 8 }).notNull(),
  value: int("value").notNull(),
  active: boolean("active").notNull().default(true),
  startsAt: int("starts_at"),
  endsAt: int("ends_at"),
  // NULL — без лимита; считаются оплаченные заказы с кодом.
  maxUses: int("max_uses"),
  // Только компаниям без оплат.
  newClientsOnly: boolean("new_clients_only").notNull().default(false),
  // Персональный код: только для этой компании.
  companyId: int("company_id"),
  note: varchar("note", { length: 255 }),
  // Постоянная скидка: после оплаты с кодом действует на следующие оплаты
  // компании; duration_months — сколько (NULL — без срока).
  lifetime: boolean("lifetime").notNull().default(false),
  durationMonths: int("duration_months"),
  createdAt: int("created_at").notNull().default(0),
  updatedAt: int("updated_at").notNull().default(0),
});

// Акции по расписанию (root): скидка в процентах на все тарифы в окне
// [starts_at, ends_at). Действует самая большая.
export const pricePromotions = mysqlTable("price_promotions", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 120 }).notNull(),
  discountPercent: int("discount_percent").notNull(),
  startsAt: int("starts_at").notNull(),
  endsAt: int("ends_at").notNull(),
  active: boolean("active").notNull().default(true),
  note: varchar("note", { length: 255 }),
  createdAt: int("created_at").notNull().default(0),
  updatedAt: int("updated_at").notNull().default(0),
});

// Постоянные скидки компании: снимок правила кода на момент оплаты, по
// строке на код (UNIQUE company_id + promo_code_id). Действует выгоднейшая.
export const companyDiscounts = mysqlTable("company_discounts", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  promoCodeId: int("promo_code_id").notNull(),
  code: varchar("code", { length: 32 }).notNull(),
  // percent | fixed
  kind: varchar("kind", { length: 8 }).notNull(),
  value: int("value").notNull(),
  // Заказ, после оплаты которого скидка появилась: его возврат её снимает.
  orderId: int("order_id"),
  boundAt: int("bound_at").notNull(),
  // NULL — без срока.
  expiresAt: int("expires_at"),
  revokedAt: int("revoked_at"),
  revokedBy: int("revoked_by"),
  updatedAt: int("updated_at").notNull().default(0),
});

// Журнал баланса (баллы, 1 балл = 1 ₽): каждое изменение company_billing.balance_rub —
// строкой здесь, в той же транзакции. dedupe_key не даёт провести операцию дважды.
export const balanceTransactions = mysqlTable("balance_transactions", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  // + начисление, − списание.
  amountRub: int("amount_rub").notNull(),
  balanceAfter: int("balance_after").notNull(),
  // topup | order_spend | order_release | order_refund | adjust | topup_refund | topup_refund_back
  kind: varchar("kind", { length: 24 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  orderId: int("order_id"),
  // Кто сделал корректировку (root).
  actorUserId: int("actor_user_id"),
  dedupeKey: varchar("dedupe_key", { length: 64 }).unique(),
  createdAt: int("created_at").notNull().default(0),
});

// Реквизиты компании-заказчика: для счёта и закрывающих документов.
export const companyRequisites = mysqlTable("company_requisites", {
  companyId: int("company_id").primaryKey(),
  // org — организация, ip — ИП.
  kind: varchar("kind", { length: 8 }).notNull().default("org"),
  name: varchar("name", { length: 255 }).notNull(),
  inn: varchar("inn", { length: 12 }).notNull(),
  kpp: varchar("kpp", { length: 9 }),
  ogrn: varchar("ogrn", { length: 15 }),
  address: varchar("address", { length: 500 }).notNull(),
  headPost: varchar("head_post", { length: 100 }),
  headName: varchar("head_name", { length: 150 }),
  email: varchar("email", { length: 255 }),
  updatedAt: int("updated_at").notNull().default(0),
});

// Закрывающие документы (УПД): снимок сторон и строк на дату оплаты —
// документ не меняется, когда потом меняются реквизиты.
export const closingDocuments = mysqlTable("closing_documents", {
  id: int("id").primaryKey().autoincrement(),
  orderId: int("order_id").notNull().unique(),
  companyId: int("company_id").notNull(),
  // Номер = номер заказа.
  number: varchar("number", { length: 32 }).notNull(),
  // Дата документа = дата оплаты.
  issuedAt: int("issued_at").notNull(),
  seller: text("seller").notNull(),
  buyer: text("buyer").notNull(),
  // Строки документа (JSON). Не «lines»: это зарезервированное слово MySQL.
  lines: text("line_items").notNull(),
  totalRub: int("total_rub").notNull(),
  // issued | voided (деньги возвращены).
  status: varchar("status", { length: 16 }).notNull().default("issued"),
  voidedAt: int("voided_at"),
  createdAt: int("created_at").notNull().default(0),
});

// История согласий на автосписания: только добавление, отзыв — новая
// строка с granted=false. Этого требует Робокасса.
export const paymentConsents = mysqlTable("payment_consents", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  userId: int("user_id"),
  orderId: int("order_id"),
  granted: boolean("granted").notNull(),
  statementText: text("statement_text").notNull(),
  offerRevision: varchar("offer_revision", { length: 20 }).notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: varchar("user_agent", { length: 255 }),
  createdAt: int("created_at").notNull().default(0),
});

// Автопродление компании. Отдельно от companies, чтобы не трогать
// горячую таблицу: нет строки — автопродления нет.
export const companyBilling = mysqlTable("company_billing", {
  companyId: int("company_id").primaryKey(),
  recurringActive: boolean("recurring_active").notNull().default(false),
  // Первый платёж серии: по нему касса списывает повторно.
  recurringParentOrderId: int("recurring_parent_order_id"),
  recurringPlan: varchar("recurring_plan", { length: 20 }),
  recurringMonths: int("recurring_months"),
  // Сумма серии фиксируется при согласии; новая цена на неё не влияет.
  recurringAmountRub: int("recurring_amount_rub"),
  recurringAttempts: int("recurring_attempts").notNull().default(0),
  recurringLastAttemptAt: int("recurring_last_attempt_at"),
  // Для какого plan_until уже ушло предупреждение о списании.
  recurringNoticeFor: int("recurring_notice_for"),
  recurringDisabledAt: int("recurring_disabled_at"),
  // Для какого plan_until ушли «тариф скоро закончится» и «тариф закончился»
  // (без автопродления).
  expiryNoticeFor: int("expiry_notice_for"),
  expiredNoticeFor: int("expired_notice_for"),
  // Баланс в баллах. Меняется только вместе со строкой balance_transactions
  // и никогда не уходит в минус (условное списание).
  balanceRub: int("balance_rub").notNull().default(0),
  updatedAt: int("updated_at").notNull().default(0),
});

export type PaymentOrderRow = typeof paymentOrders.$inferSelect;
export type PricePromotionRow = typeof pricePromotions.$inferSelect;
export type CompanyDiscountRow = typeof companyDiscounts.$inferSelect;
export type BalanceTransactionRow = typeof balanceTransactions.$inferSelect;
export type CompanyBillingRow = typeof companyBilling.$inferSelect;
export type PromoCodeRow = typeof promoCodes.$inferSelect;
export type CompanyRequisitesRow = typeof companyRequisites.$inferSelect;
export type ClosingDocumentRow = typeof closingDocuments.$inferSelect;

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

