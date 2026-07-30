/**
 * @fileoverview Data Access Layer для работы с MySQL через Drizzle ORM
 *
 * Все методы работают с тремя таблицами: users, tasks, workers
 *
 * ВАЖНО: weekDays и photoUrls хранятся в БД как JSON строки,
 * но возвращаются как массивы (парсинг при чтении, сериализация при записи)
 */

import {
  workers,
  tasks,
  users,
  companies,
  apiKeys,
  webhookDeliveries,
  invitations,
  type Worker,
  type InsertWorker,
  type Task,
  type InsertTask,
  type User,
  type InsertUser,
  type UpdateUser,
  type Company,
  type InsertCompany,
  type ApiKey,
  type InsertApiKey,
  type WebhookDelivery,
  type InsertWebhookDelivery,
  type Invitation,
  banners,
  type Banner,
  type BannerInput,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, lte, gte, asc, isNull, or, sql } from "drizzle-orm";
import { normalizePhone } from "./phone-normalize";

type UpdateCompanyData = Omit<Partial<InsertCompany>, "email"> & {
  email?: string | null;
  wesetupBaseUrl?: string | null;
  wesetupApiKey?: string | null;
};

/** Интерфейс хранилища данных */
export interface IStorage {
  // Companies
  createCompany(company: InsertCompany): Promise<Company>;
  getCompanyById(id: number): Promise<Company | undefined>;
  updateCompany(id: number, company: UpdateCompanyData): Promise<Company | undefined>;

  // Users
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser & { companyId?: number }): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getAllUsers(companyId?: number): Promise<User[]>;
  updateUser(id: number, user: UpdateUser): Promise<User | undefined>;
  setUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined>;
  setUserPosition(id: number, position: string | null): Promise<User | undefined>;
  setUserName(id: number, name: string | null): Promise<User | undefined>;
  updateUserBalance(id: number, amount: number): Promise<User | undefined>;
  resetUserBalance(id: number): Promise<User | undefined>;
  setManagedWorkers(userId: number, workerIds: number[]): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  // ===== Email-авторизация (лендинг) =====
  getUserByEmail(email: string): Promise<User | undefined>;
  /** Создаёт админа без телефона (email-ветка). phone остаётся NULL. */
  createEmailUser(data: {
    email: string;
    passwordHash: string;
    name?: string | null;
    companyId: number;
    isAdmin: boolean;
  }): Promise<User>;
  setMagicToken(id: number, token: string, expiresAt: number): Promise<void>;
  clearMagicToken(id: number): Promise<void>;
  /** Находит юзера по непросроченному magic-токену. */
  findUserByMagicToken(token: string): Promise<User | undefined>;
  updateUserEmail(id: number, email: string): Promise<User | undefined>;
  updateUserPassword(id: number, passwordHash: string): Promise<User | undefined>;

  // ===== Привязка Telegram (бот @thetasksflowbot) =====
  findUserByTelegramUserId(telegramUserId: number): Promise<User | undefined>;
  saveTelegramLink(
    userId: number,
    data: {
      telegramUserId: number;
      telegramUsername?: string | null;
      telegramFirstName?: string | null;
      telegramPhotoUrl?: string | null;
    },
  ): Promise<User | undefined>;
  clearTelegramLink(userId: number): Promise<User | undefined>;
  /** Кэш chat_id после /start — до него бот не может написать первым. */
  markTelegramStarted(userId: number, chatId: number): Promise<void>;

  // Workers
  getWorkers(companyId?: number): Promise<Worker[]>;
  getWorker(id: number): Promise<Worker | undefined>;
  createWorker(worker: InsertWorker & { companyId?: number }): Promise<Worker>;
  updateWorker(id: number, worker: InsertWorker): Promise<Worker | undefined>;
  deleteWorker(id: number): Promise<void>;

  // Tasks
  getTasks(companyId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask & { companyId?: number }): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;
  claimSiblingTasks(args: {
    sourceTaskId: number;
    documentId: string;
    journalKind: string;
    /** rowKey источника для discrim'а в multi-row документах (cleaning
     *  rooms-mode). Если задан — siblings матчатся также по rowKey. */
    sourceRowKey?: string | null;
    claimedByWorkerId: number;
    companyId: number | null;
    completedAt: number;
  }): Promise<number>;
  /**
   * Атомарный переход isCompleted=false → true. Возвращает true если
   * row реально перешёл (применять баланс), false если уже completed
   * (или не существует). Race-safe: при двух параллельных вызовах
   * только один вернёт true.
   */
  transitionTaskToCompleted(id: number): Promise<boolean>;
  transitionTaskToUncompleted(id: number): Promise<boolean>;

  // Phase 1 двухстадийной верификации.
  //
  // submitForVerification: атомарный переход
  //   verification_status NULL/'pending' → 'submitted'
  // (вызывается когда сотрудник нажал «Готово» на задаче с
  // verifier_worker_id != NULL). Race-safe — повторные клики дают
  // affectedRows=0, balance НЕ изменяется.
  submitForVerification(id: number): Promise<boolean>;
  // approveVerification: 'submitted' → 'approved' + isCompleted=true.
  // Здесь же ставим completedAt, потому что задача реально done только
  // после проверки. Возврат: row для дальнейшего credit'а balance'а.
  approveVerification(
    id: number,
    verifierUserId: number
  ): Promise<boolean>;
  // rejectVerification: 'submitted' → 'rejected' + isCompleted=false +
  // reject_reason. Сотрудник снова видит задачу в активных.
  rejectVerification(
    id: number,
    verifierUserId: number,
    reason: string
  ): Promise<boolean>;

  // API Keys
  createApiKey(data: Omit<InsertApiKey, 'id' | 'createdAt'>): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeyById(id: number): Promise<ApiKey | undefined>;
  listApiKeysByCompany(companyId: number): Promise<ApiKey[]>;
  revokeApiKey(id: number): Promise<void>;
  updateApiKeyLastUsed(id: number, ts: number): Promise<void>;
  countActiveApiKeysByCompany(companyId: number): Promise<number>;

  // Invitations
  createInvitation(data: {
    token: string;
    companyId: number;
    createdByUserId: number;
    position: string | null;
    isAdmin: boolean;
  }): Promise<Invitation>;
  getInvitationById(id: number): Promise<Invitation | undefined>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationsByCompany(companyId: number, includeAll: boolean): Promise<Invitation[]>;
  /** Атомарный mark-as-used. Возвращает true если успели первыми. */
  markInvitationUsed(id: number, usedByUserId: number): Promise<boolean>;
  revokeInvitation(id: number): Promise<Invitation | undefined>;

  // ===== Баннеры =====
  /** Все баннеры (для админки), порядок: position asc, новее выше. */
  listAllBanners(): Promise<Banner[]>;
  /** Активные баннеры под место показа (top/content), с учётом окна дат. */
  listActiveBanners(placement: "top" | "content"): Promise<Banner[]>;
  getBanner(id: number): Promise<Banner | undefined>;
  createBanner(data: BannerInput): Promise<Banner>;
  updateBanner(id: number, data: Partial<BannerInput>): Promise<Banner | undefined>;
  deleteBanner(id: number): Promise<void>;
}

/** Реализация хранилища с MySQL через Drizzle ORM */
export class DatabaseStorage implements IStorage {
  // ===================== COMPANIES =====================

  /**
   * Создание новой компании
   * @param company - Данные компании (name обязателен)
   * @returns Созданная компания с id
   */
  async createCompany(company: InsertCompany): Promise<Company> {
    const [result] = await db.insert(companies).values({
      ...company,
      createdAt: Math.floor(Date.now() / 1000),
    });
    const insertId = (result as any).insertId;
    const [created] = await db.select().from(companies).where(eq(companies.id, insertId));
    if (!created) throw new Error("Failed to create company");
    return created;
  }

  /**
   * Получение компании по ID
   * @param id - ID компании
   * @returns Компания или undefined если не найдена
   */
  async getCompanyById(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  }

  /**
   * Обновление данных компании
   * @param id - ID компании
   * @param company - Данные для обновления
   * @returns Обновлённая компания или undefined
   */
  async updateCompany(id: number, company: UpdateCompanyData): Promise<Company | undefined> {
    await db.update(companies).set(company).where(eq(companies.id, id));
    const [updated] = await db.select().from(companies).where(eq(companies.id, id));
    return updated || undefined;
  }

  // ===================== USERS =====================

  /**
   * Поиск пользователя по номеру телефона
   * @param phone - Номер телефона (будет нормализован: убраны пробелы и дефисы)
   * @returns Пользователь или undefined если не найден
   */
  async getUserByPhone(phone: string): Promise<User | undefined> {
    const normalizedPhone = normalizePhone(phone);
    const [user] = await db.select().from(users).where(eq(users.phone, normalizedPhone));
    return user || undefined;
  }

  /**
   * Создание нового пользователя
   * @param insertUser - Данные пользователя (phone обязателен, companyId опционален)
   * @returns Созданный пользователь с id
   */
  async createUser(insertUser: InsertUser & { companyId?: number }): Promise<User> {
    // Нормализуем номер телефона
    const normalizedPhone = normalizePhone(insertUser.phone);
    const [result] = await db.insert(users).values({
      ...insertUser,
      phone: normalizedPhone,
      createdAt: Math.floor(Date.now() / 1000),
      companyId: insertUser.companyId ?? null,
    });
    const insertId = (result as any).insertId;
    const [user] = await db.select().from(users).where(eq(users.id, insertId));
    if (!user) throw new Error("Failed to create user");
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  // ===================== EMAIL-АВТОРИЗАЦИЯ =====================

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, normalized));
    return user || undefined;
  }

  /**
   * Создание админа без телефона (email-ветка лендинга). phone=NULL,
   * email/passwordHash заданы. Уникальность email — на DB-индексе.
   */
  async createEmailUser(data: {
    email: string;
    passwordHash: string;
    name?: string | null;
    companyId: number;
    isAdmin: boolean;
  }): Promise<User> {
    const [result] = await db.insert(users).values({
      phone: null,
      name: data.name ?? null,
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      isAdmin: data.isAdmin,
      companyId: data.companyId,
      createdAt: Math.floor(Date.now() / 1000),
    });
    const insertId = (result as any).insertId;
    const [user] = await db.select().from(users).where(eq(users.id, insertId));
    if (!user) throw new Error("Failed to create email user");
    return user;
  }

  async setMagicToken(id: number, token: string, expiresAt: number): Promise<void> {
    await db
      .update(users)
      .set({ magicToken: token, magicTokenExpiresAt: expiresAt })
      .where(eq(users.id, id));
  }

  async clearMagicToken(id: number): Promise<void> {
    await db
      .update(users)
      .set({ magicToken: null, magicTokenExpiresAt: null })
      .where(eq(users.id, id));
  }

  async findUserByMagicToken(token: string): Promise<User | undefined> {
    const now = Math.floor(Date.now() / 1000);
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.magicToken, token), gte(users.magicTokenExpiresAt, now)));
    return user || undefined;
  }

  async updateUserEmail(id: number, email: string): Promise<User | undefined> {
    await db
      .update(users)
      .set({ email: email.trim().toLowerCase() })
      .where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async updateUserPassword(id: number, passwordHash: string): Promise<User | undefined> {
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  // ===== Привязка Telegram =====

  async findUserByTelegramUserId(telegramUserId: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId));
    return user || undefined;
  }

  async saveTelegramLink(
    userId: number,
    data: {
      telegramUserId: number;
      telegramUsername?: string | null;
      telegramFirstName?: string | null;
      telegramPhotoUrl?: string | null;
    },
  ): Promise<User | undefined> {
    await db
      .update(users)
      .set({
        telegramUserId: data.telegramUserId,
        telegramUsername: data.telegramUsername ?? null,
        telegramFirstName: data.telegramFirstName ?? null,
        telegramPhotoUrl: data.telegramPhotoUrl ?? null,
        tgLinkedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(users.id, userId));
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || undefined;
  }

  async clearTelegramLink(userId: number): Promise<User | undefined> {
    await db
      .update(users)
      .set({
        telegramUserId: null,
        telegramUsername: null,
        telegramFirstName: null,
        telegramPhotoUrl: null,
        tgChatId: null,
        tgLinkedAt: null,
        tgStartedAt: null,
      })
      .where(eq(users.id, userId));
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || undefined;
  }

  async markTelegramStarted(userId: number, chatId: number): Promise<void> {
    await db
      .update(users)
      .set({ tgChatId: chatId, tgStartedAt: Math.floor(Date.now() / 1000) })
      .where(eq(users.id, userId));
  }

  async getAllUsers(companyId?: number): Promise<User[]> {
    if (companyId) {
      return await db.select().from(users).where(eq(users.companyId, companyId));
    }
    return await db.select().from(users);
  }

  async updateUser(id: number, updateUser: UpdateUser): Promise<User | undefined> {
    const normalizedPhone = normalizePhone(updateUser.phone);
    const patch: Record<string, unknown> = {
      phone: normalizedPhone,
      name: updateUser.name ?? null,
    };
    if (updateUser.position !== undefined) {
      patch.position = updateUser.position ?? null;
    }
    await db.update(users).set(patch).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Точечное обновление должности (используется в POST /api/users
   * для existing user'ов: повторный create с position обновляет
   * её, если поменялась). Чтобы не требовать менять phone/name.
   */
  async setUserPosition(id: number, position: string | null): Promise<User | undefined> {
    await db.update(users).set({ position }).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Точечное обновление имени (PUT /api/auth/me). Отдельно от updateUser,
   * который требует phone — email-юзеры телефона не имеют, и
   * normalizePhone(null) бы упал.
   */
  async setUserName(id: number, name: string | null): Promise<User | undefined> {
    await db.update(users).set({ name }).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async setUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined> {
    await db.update(users).set({ isAdmin }).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Изменение баланса бонусов пользователя
   * @param id - ID пользователя
   * @param amount - Сумма изменения (положительная для начисления, отрицательная для списания)
   * @returns Обновлённый пользователь или undefined
   * @example
   * // Начислить 100 рублей за выполнение задачи
   * await storage.updateUserBalance(userId, 100);
   * // Списать при отмене выполнения
   * await storage.updateUserBalance(userId, -100);
   */
  async updateUserBalance(id: number, amount: number): Promise<User | undefined> {
    // Атомарный SQL-инкремент. Раньше было read-modify-write — два
    // concurrent /api/tasks/:id/complete могли потерять одно
    // начисление: оба читали balance=100, оба считали 100+50, оба
    // писали 150 (вместо 200). Worker не получал деньги за выполненную
    // задачу.
    //
    // COALESCE на null balance чтобы legacy-юзеры с NULL не сломали
    // сложение (NULL + N = NULL в SQL).
    await db
      .update(users)
      .set({
        bonusBalance: sql`COALESCE(${users.bonusBalance}, 0) + ${amount}`,
      })
      .where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Установить список подчинённых для пользователя. Зеркалирует
   * WeSetup ManagerScope: один админ может редактировать иерархию
   * на стороне WeSetup, она пушится сюда.
   *
   * Семантика хранения:
   *   • NULL / "" → у пользователя нет подчинённых (обычный воркер)
   *   • "[]" → пустой список — означает «есть scope, но никого нет»;
   *      в /api/tasks такой пользователь видит только свои задачи
   *      (фильтр workerId in [] всегда отфильтровывает всё)
   *   • "[1,2,3]" → видит задачи воркеров 1/2/3 + свои
   */
  async setManagedWorkers(
    userId: number,
    workerIds: number[]
  ): Promise<User | undefined> {
    const cleaned = Array.from(new Set(workerIds.filter((n) => Number.isInteger(n) && n > 0)));
    await db
      .update(users)
      .set({ managedWorkerIds: JSON.stringify(cleaned) })
      .where(eq(users.id, userId));
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || undefined;
  }

  /**
   * Распарсить managed_worker_ids в массив. Робастно к мусору в
   * колонке (старые записи могут быть NULL или пустой строкой).
   */
  static parseManagedWorkerIds(raw: string | null | undefined): number[] | null {
    if (raw === null || raw === undefined || raw === "") return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((n) => typeof n === "number" && Number.isInteger(n));
    } catch {
      return null;
    }
  }

  /**
   * Сброс баланса до 0 — вызывается админом после ручной выплаты.
   *
   * Race-safe вариант: вместо `SET balance = 0` (overwrite) делаем
   * `SET balance = balance - prevBalance`. Если concurrent /complete
   * успел добавить N в balance между нашим SELECT и UPDATE, итоговый
   * результат будет N, а не 0 — worker не теряет только что
   * заработанные деньги.
   *
   * Раньше: read+overwrite. Сценарий потери:
   *   1. balance=5000, admin видит «выплатить 5000».
   *   2. Worker заканчивает task с price=1000 → atomic +1000 → 6000.
   *   3. Admin жмёт «Сбросить» → balance=0.
   *   4. Admin отдал 5000 наличкой, но 1000 за свежевыполненную task'у
   *      пропали — приходится отдельно компенсировать.
   *
   * Теперь: прочитанный prevBalance вычитается атомарным SQL'ом.
   * Concurrent +1000 не теряется (balance заканчивает = 1000 а не 0).
   */
  async resetUserBalance(id: number): Promise<User | undefined> {
    const [current] = await db
      .select({ bonusBalance: users.bonusBalance })
      .from(users)
      .where(eq(users.id, id));
    if (!current) return undefined;
    const prevBalance = current.bonusBalance ?? 0;
    await db
      .update(users)
      .set({
        bonusBalance: sql`COALESCE(${users.bonusBalance}, 0) - ${prevBalance}`,
      })
      .where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /** Удаление пользователя (сначала обнуляет workerId у связанных задач) */
  async deleteUser(id: number): Promise<void> {
    // Обнуляем workerId у всех задач этого пользователя
    await db.update(tasks).set({ workerId: null }).where(eq(tasks.workerId, id));
    // Удаляем пользователя
    await db.delete(users).where(eq(users.id, id));
  }

  // ===================== WORKERS =====================

  async getWorkers(companyId?: number): Promise<Worker[]> {
    if (companyId) {
      return await db.select().from(workers).where(eq(workers.companyId, companyId));
    }
    return await db.select().from(workers);
  }

  async getWorker(id: number): Promise<Worker | undefined> {
    const [worker] = await db.select().from(workers).where(eq(workers.id, id));
    return worker || undefined;
  }

  async createWorker(insertWorker: InsertWorker & { companyId?: number }): Promise<Worker> {
    const [result] = await db.insert(workers).values({
      ...insertWorker,
      companyId: insertWorker.companyId ?? null,
    });
    const insertId = (result as any).insertId;
    const [worker] = await db.select().from(workers).where(eq(workers.id, insertId));
    return worker;
  }

  async updateWorker(id: number, insertWorker: InsertWorker): Promise<Worker | undefined> {
    await db.update(workers).set(insertWorker).where(eq(workers.id, id));
    const [worker] = await db.select().from(workers).where(eq(workers.id, id));
    return worker || undefined;
  }

  async deleteWorker(id: number): Promise<void> {
    await db.delete(workers).where(eq(workers.id, id));
  }

  // ===================== TASKS =====================

  // Полный набор колонок tasks для SELECT. Использовать в getTask,
  // getTasks, createTask, updateTask. Раньше каждый метод дублировал
  // 25 строк, и при добавлении нового поля (например, submittedValues
  // в commit 47cc605/тик 6) приходилось править все 4 — некоторые
  // забывались (тик 13: createTask/updateTask пропускали submittedValues
  // даже после фикса getTask/getTasks). Один источник правды → меньше
  // silent-omission багов.
  private static readonly TASK_SELECT = {
    id: tasks.id,
    title: tasks.title,
    workerId: tasks.workerId,
    requiresPhoto: tasks.requiresPhoto,
    photoUrl: tasks.photoUrl,
    photoUrls: tasks.photoUrls,
    examplePhotoUrl: tasks.examplePhotoUrl,
    isCompleted: tasks.isCompleted,
    weekDays: tasks.weekDays,
    monthDay: tasks.monthDay,
    isRecurring: tasks.isRecurring,
    price: tasks.price,
    category: tasks.category,
    description: tasks.description,
    companyId: tasks.companyId,
    journalLink: tasks.journalLink,
    createdAt: tasks.createdAt,
    completedAt: tasks.completedAt,
    claimedByWorkerId: tasks.claimedByWorkerId,
    verificationStatus: tasks.verificationStatus,
    verifierWorkerId: tasks.verifierWorkerId,
    verifiedByUserId: tasks.verifiedByUserId,
    verifiedAt: tasks.verifiedAt,
    rejectReason: tasks.rejectReason,
    submittedValues: tasks.submittedValues,
    checklist: tasks.checklist,
    dueDate: tasks.dueDate,
    examplePhotoUrls: tasks.examplePhotoUrls,
  } as const;

  /**
   * Один парсер строки задачи для всех четырёх путей чтения
   * (getTasks / getTask / createTask / updateTask). Раньше эти три строки
   * были скопированы в каждый — и при добавлении колонки про какой-нибудь
   * из них регулярно забывали.
   *
   * examplePhotoUrls читается с fallback на legacy-колонку
   * example_photo_url: задачи, созданные до появления массива, обязаны
   * продолжать показывать свой единственный пример фото.
   */
  private static parseTaskRow(row: Record<string, any>): Task {
    let examplePhotoUrls: string[] = [];
    if (row.examplePhotoUrls) {
      try {
        const parsed = JSON.parse(row.examplePhotoUrls);
        if (Array.isArray(parsed)) examplePhotoUrls = parsed.filter(Boolean);
      } catch {
        // Битый JSON в колонке не должен ронять чтение задачи —
        // деградируем до legacy-поля ниже.
        examplePhotoUrls = [];
      }
    }
    if (examplePhotoUrls.length === 0 && row.examplePhotoUrl) {
      examplePhotoUrls = [row.examplePhotoUrl];
    }
    return {
      ...row,
      weekDays: row.weekDays ? JSON.parse(row.weekDays) : null,
      photoUrls: row.photoUrls ? JSON.parse(row.photoUrls) : [],
      checklist: row.checklist ? JSON.parse(row.checklist) : [],
      examplePhotoUrls,
    } as Task;
  }

  /**
   * Получение всех задач
   * @param companyId - ID компании для фильтрации (опционально)
   * @returns Массив задач с распарсенными weekDays и photoUrls
   * @note weekDays возвращается как number[] (0=Вс, 1=Пн, ..., 6=Сб)
   * @note photoUrls возвращается как string[] (пустой массив если нет фото)
   */
  async getTasks(companyId?: number): Promise<Task[]> {
    const query = db.select(DatabaseStorage.TASK_SELECT).from(tasks);

    const result = companyId
      ? await query.where(eq(tasks.companyId, companyId))
      : await query;

    // Парсим weekDays, photoUrls, checklist и examplePhotoUrls из JSON
    return result.map((task) => DatabaseStorage.parseTaskRow(task));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db
      .select(DatabaseStorage.TASK_SELECT)
      .from(tasks)
      .where(eq(tasks.id, id));
    if (!task) return undefined;
    return DatabaseStorage.parseTaskRow(task);
  }

  /**
   * Создание новой задачи
   * @param insertTask - Данные задачи (companyId опционален)
   * @returns Созданная задача с id
   * @note weekDays и photoUrls автоматически сериализуются в JSON для хранения
   */
  async createTask(
    insertTask: InsertTask & {
      companyId?: number;
      verifierWorkerId?: number | null;
    },
  ): Promise<Task> {
    // Lazy import — schema-self-check.ts импортирует logger который
    // тянет всю инфру; чтобы не зацикливаться при тестах, читаем флаг
    // в runtime.
    const { isVerificationSchemaReady } = await import("./schema-self-check");
    const verificationReady = isVerificationSchemaReady();
    // Сериализуем weekDays и photoUrls в JSON строку для хранения в БД
    const taskData: Record<string, unknown> = {
      ...insertTask,
      weekDays: insertTask.weekDays ? JSON.stringify(insertTask.weekDays) : null,
      photoUrls: insertTask.photoUrls ? JSON.stringify(insertTask.photoUrls) : null,
      checklist: insertTask.checklist ? JSON.stringify(insertTask.checklist) : null,
      monthDay: insertTask.monthDay ?? null,
      isRecurring: insertTask.isRecurring ?? true,
      price: insertTask.price ?? 0,
      category: insertTask.category ?? null,
      description: insertTask.description ?? null,
      // Примеры фото: пишем массив в новую колонку и дублируем первый URL
      // в legacy-колонку, чтобы старые клиенты и старые запросы, читающие
      // example_photo_url напрямую, продолжали видеть пример.
      examplePhotoUrls: insertTask.examplePhotoUrls?.length
        ? JSON.stringify(insertTask.examplePhotoUrls)
        : null,
      examplePhotoUrl:
        insertTask.examplePhotoUrl ?? insertTask.examplePhotoUrls?.[0] ?? null,
      dueDate: insertTask.dueDate ?? null,
      companyId: insertTask.companyId ?? null,
      journalLink: insertTask.journalLink ?? null,
      createdAt: Math.floor(Date.now() / 1000),
      completedAt: null,
    };
    // Phase 1 двухстадийной верификации: записываем verifier-поля
    // ТОЛЬКО если миграция точно прошла (schema-self-check OK). На
    // legacy-БД без новых колонок это упадёт с Unknown column — мы
    // корректно делаем fallback на legacy-вставку без verification.
    if (verificationReady) {
      taskData.verifierWorkerId = insertTask.verifierWorkerId ?? null;
      taskData.verificationStatus = insertTask.verifierWorkerId
        ? "pending"
        : null;
    } else if (insertTask.verifierWorkerId) {
      // Если задача требует verifier'а, но schema не готова — log и
      // продолжаем без verification. Балансы и mirror работают как
      // раньше; UX «На проверке» не активируется до миграции.
      console.warn(
        "[createTask] verification schema not ready — ignoring verifierWorkerId",
        insertTask.verifierWorkerId,
      );
    }
    const [result] = await db.insert(tasks).values(taskData as any);
    const insertId = (result as any).insertId;
    const [task] = await db
      .select(DatabaseStorage.TASK_SELECT)
      .from(tasks)
      .where(eq(tasks.id, insertId));
    return DatabaseStorage.parseTaskRow(task);
  }

  /**
   * Частичное обновление задачи
   * @param id - ID задачи
   * @param updates - Поля для обновления (только переданные поля будут изменены)
   * @returns Обновлённая задача или undefined если не найдена
   * @example
   * // Отметить выполненной
   * await storage.updateTask(taskId, { isCompleted: true });
   * // Добавить фото
   * await storage.updateTask(taskId, { photoUrls: [...existing, newUrl] });
   */
  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined> {
    // Сериализуем weekDays и photoUrls если они переданы
    const updateData: Record<string, unknown> = {
      ...updates,
      weekDays: updates.weekDays !== undefined
        ? (updates.weekDays ? JSON.stringify(updates.weekDays) : null)
        : undefined,
      photoUrls: updates.photoUrls !== undefined
        ? (updates.photoUrls ? JSON.stringify(updates.photoUrls) : null)
        : undefined,
      checklist: updates.checklist !== undefined
        ? (updates.checklist ? JSON.stringify(updates.checklist) : null)
        : undefined,
      examplePhotoUrls: updates.examplePhotoUrls !== undefined
        ? (updates.examplePhotoUrls?.length
            ? JSON.stringify(updates.examplePhotoUrls)
            : null)
        : undefined,
    };
    // Массив примеров обновили — синхронизируем legacy-колонку первым URL,
    // иначе старые читатели example_photo_url увидят устаревший пример.
    if (updates.examplePhotoUrls !== undefined && updates.examplePhotoUrl === undefined) {
      updateData.examplePhotoUrl = updates.examplePhotoUrls?.[0] ?? null;
    }
    // Stamp completedAt whenever isCompleted flips. Setting true assigns
    // «now» (seconds); setting false clears the column so the next toggle
    // gets a fresh timestamp. Recurring tasks auto-reset elsewhere — they
    // hit this path with isCompleted=false at midnight.
    if ("isCompleted" in updates) {
      updateData.completedAt = updates.isCompleted
        ? Math.floor(Date.now() / 1000)
        : null;
    }
    // Удаляем undefined поля
    Object.keys(updateData).forEach(key => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData];
      }
    });
    await db.update(tasks).set(updateData as any).where(eq(tasks.id, id));
    const [task] = await db
      .select(DatabaseStorage.TASK_SELECT)
      .from(tasks)
      .where(eq(tasks.id, id));
    if (!task) return undefined;
    return DatabaseStorage.parseTaskRow(task);
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  /**
   * «Claim race-for-bonus»: помечаем sibling-задачи как выполненные
   * победителем. Sibling определяется как другая task с тем же
   * `journalLink.documentId + kind`, в той же компании, не выполненная,
   * принадлежащая другому воркеру. Премию им НЕ начисляем — это
   * сделает caller только для самой задачи.
   *
   * Возвращает количество захваченных задач (для логов / уведомлений).
   *
   * Реализация: тянем потенциальных кандидатов (журнальные задачи той
   * же компании), фильтруем в коде — JSON-блоб `journal_link` хранится
   * как TEXT, фильтр через JSON_EXTRACT в MySQL добавит нагрузку и
   * сделает миграцию платформо-зависимой. Кандидатов мало (≤ N
   * сотрудников за день), цикл дешёвый.
   */
  async claimSiblingTasks(args: {
    sourceTaskId: number;
    documentId: string;
    journalKind: string;
    /**
     * rowKey источника. Если задан — sibling'ом считается ТОЛЬКО задача
     * с тем же documentId+kind+rowKey. Это нужно для cleaning rooms-mode
     * (4 разных помещения = 4 разных rowKey в одном документе): закрытие
     * одного помещения НЕ должно claim'ить остальные. Race-for-bonus
     * срабатывает когда несколько уборщиков назначены на ОДНО помещение
     * (одинаковый rowKey, разные workerId).
     *
     * Если sourceRowKey не задан — fallback на старое поведение
     * (documentId+kind sibling — все задачи документа), для совместимости
     * со старыми клиентами WeSetup.
     */
    sourceRowKey?: string | null;
    claimedByWorkerId: number;
    companyId: number | null;
    completedAt: number;
  }): Promise<number> {
    const candidates = await db
      .select({
        id: tasks.id,
        workerId: tasks.workerId,
        isCompleted: tasks.isCompleted,
        journalLink: tasks.journalLink,
        claimedByWorkerId: tasks.claimedByWorkerId,
      })
      .from(tasks)
      .where(
        args.companyId !== null
          ? and(eq(tasks.companyId, args.companyId), eq(tasks.isCompleted, false))
          : eq(tasks.isCompleted, false)
      );

    let claimed = 0;
    for (const candidate of candidates) {
      if (candidate.id === args.sourceTaskId) continue;
      if (!candidate.journalLink) continue;
      if (candidate.claimedByWorkerId !== null) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(candidate.journalLink);
      } catch {
        continue;
      }
      if (
        parsed?.documentId !== args.documentId ||
        parsed?.kind !== args.journalKind
      ) {
        continue;
      }
      // Sibling-уточнение по rowKey (cleaning rooms-mode): закрытие
      // задачи комнаты A не должно claim'ить задачи комнат B,C,D —
      // у них разные rowKey хотя documentId+kind одинаковые.
      //
      // 2026-05-09 fix (race-mode prefix match):
      // - Pairs-mode: rowKey формата `cleaning_pair::N` — exact match.
      // - Race-mode: rowKey формата `room::<roomId>::cleaner::<userId>` —
      //   у каждого cleaner'а уникальный rowKey, но все они siblings
      //   для ОДНОЙ комнаты. Match по префиксу `room::<roomId>::cleaner::`.
      //
      // Без этой ветки race-mode siblings никогда не клеймились бы
      // (все rowKey разные → exact match всегда промахивается).
      if (args.sourceRowKey && typeof parsed?.rowKey === "string") {
        const raceMatch = /^room::([^:]+)::cleaner::/.exec(args.sourceRowKey);
        if (raceMatch) {
          const expectedPrefix = `room::${raceMatch[1]}::cleaner::`;
          if (!parsed.rowKey.startsWith(expectedPrefix)) {
            continue;
          }
        } else if (parsed.rowKey !== args.sourceRowKey) {
          continue;
        }
      }
      // Conditional update: между read'ом кандидатов и здесь
      // sibling-task мог завершить её собственный воркер
      // (с начислением баланса в /complete handler-е). Без
      // WHERE-условия мы бы перезаписали честный completed-стейт
      // как «claimed-by-us» — false attribution в дашборде. С
      // условием affectedRows=0 для уже завершённых и счётчик
      // claimed остаётся точным.
      const result = await db
        .update(tasks)
        .set({
          isCompleted: true,
          completedAt: args.completedAt,
          claimedByWorkerId: args.claimedByWorkerId,
        })
        .where(
          and(
            eq(tasks.id, candidate.id),
            eq(tasks.isCompleted, false),
            isNull(tasks.claimedByWorkerId),
          ),
        );
      const header = Array.isArray(result) ? result[0] : result;
      const affected =
        header && typeof header === "object" && "affectedRows" in header
          ? (header as { affectedRows: number }).affectedRows
          : 0;
      if (affected > 0) claimed += 1;
    }
    return claimed;
  }

  /**
   * Атомарный переход isCompleted=false → true. Если 0 rows
   * (задача не существует или уже completed) — возвращаем false.
   * Используется в /complete handler чтобы не начислять баланс
   * дважды при параллельных или повторных POST'ах.
   */
  async transitionTaskToCompleted(id: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .update(tasks)
      .set({ isCompleted: true, completedAt: now })
      .where(and(eq(tasks.id, id), eq(tasks.isCompleted, false)));
    // mysql2 возвращает [ResultSetHeader, FieldPacket[]]. У ResultSetHeader
    // есть affectedRows (= rows которые matched WHERE и были обновлены).
    // Drizzle's типы могут варьироваться — приводим осторожно.
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? (header as { affectedRows: number }).affectedRows
        : 0;
    return affected > 0;
  }

  /**
   * Атомарный обратный переход isCompleted=true → false. Двойник
   * `transitionTaskToCompleted`. Без него concurrent /uncomplete мог
   * дважды вычитать price из баланса воркера: оба читали
   * isCompleted=true, оба делали updateUserBalance(-price), баланс
   * уходил в минус. Теперь только один вызов получает affected>0
   * и вычитает.
   */
  async transitionTaskToUncompleted(id: number): Promise<boolean> {
    const result = await db
      .update(tasks)
      .set({ isCompleted: false, completedAt: null })
      .where(and(eq(tasks.id, id), eq(tasks.isCompleted, true)));
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? (header as { affectedRows: number }).affectedRows
        : 0;
    return affected > 0;
  }

  // ===================== TWO-STAGE VERIFICATION =====================

  async submitForVerification(id: number): Promise<boolean> {
    // Условный переход: только если verifier_worker_id задан и
    // status в одном из «можно отправлять» состояний (NULL для
    // legacy задач которые получили verifier'а на лету, 'pending'
    // для свежих, 'rejected' — re-submit после исправления).
    // Запрещаем повторное submitted/approved.
    const result = await db
      .update(tasks)
      .set({
        verificationStatus: "submitted",
        // isCompleted=false до approval. Гарантируем явно — мог быть
        // выставлен в true старым /complete и потом заведён verifier.
        isCompleted: false,
        completedAt: null,
        rejectReason: null,
      })
      .where(
        and(
          eq(tasks.id, id),
          sql`${tasks.verifierWorkerId} IS NOT NULL`,
          or(
            isNull(tasks.verificationStatus),
            eq(tasks.verificationStatus, "pending"),
            eq(tasks.verificationStatus, "rejected"),
          ),
        ),
      );
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? (header as { affectedRows: number }).affectedRows
        : 0;
    return affected > 0;
  }

  async approveVerification(
    id: number,
    verifierUserId: number,
  ): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .update(tasks)
      .set({
        verificationStatus: "approved",
        isCompleted: true,
        completedAt: now,
        verifiedByUserId: verifierUserId,
        verifiedAt: now,
      })
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.verificationStatus, "submitted"),
        ),
      );
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? (header as { affectedRows: number }).affectedRows
        : 0;
    return affected > 0;
  }

  async rejectVerification(
    id: number,
    verifierUserId: number,
    reason: string,
  ): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .update(tasks)
      .set({
        verificationStatus: "rejected",
        isCompleted: false,
        completedAt: null,
        verifiedByUserId: verifierUserId,
        verifiedAt: now,
        rejectReason: reason,
      })
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.verificationStatus, "submitted"),
        ),
      );
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? (header as { affectedRows: number }).affectedRows
        : 0;
    return affected > 0;
  }

  // ===================== API KEYS =====================

  async createApiKey(data: Omit<InsertApiKey, 'id' | 'createdAt'>): Promise<ApiKey> {
    const now = Math.floor(Date.now() / 1000);
    const insert = { ...data, createdAt: now } as InsertApiKey;
    const [result] = await db.insert(apiKeys).values(insert);
    const id = (result as any).insertId as number;
    const row = await this.getApiKeyById(id);
    if (!row) throw new Error('api_key not found after insert');
    return row;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    return rows[0];
  }

  async getApiKeyById(id: number): Promise<ApiKey | undefined> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return rows[0];
  }

  async listApiKeysByCompany(companyId: number): Promise<ApiKey[]> {
    return db.select().from(apiKeys)
      .where(eq(apiKeys.companyId, companyId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async revokeApiKey(id: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.update(apiKeys).set({ revokedAt: now }).where(eq(apiKeys.id, id));
  }

  async updateApiKeyLastUsed(id: number, ts: number): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: ts }).where(eq(apiKeys.id, id));
  }

  async countActiveApiKeysByCompany(companyId: number): Promise<number> {
    const rows = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.companyId, companyId), eq(apiKeys.revokedAt, 0)));
    return rows.length;
  }

  // Webhook deliveries — очередь повторных доставок POST'ов в WeSetup.
  // См. shared/schema.ts комментарий к webhookDeliveries для деталей
  // backoff-лестницы. Storage даёт только CRUD; политика retry —
  // в server/index.ts (worker).

  async enqueueWebhookDelivery(input: {
    taskId: number;
    eventType: "complete" | "uncomplete";
    targetUrl: string;
    apiKey: string;
    payload: string;
    nextRetryAt: number;
    attempts?: number;
  }): Promise<WebhookDelivery> {
    const now = Math.floor(Date.now() / 1000);
    const insert: InsertWebhookDelivery = {
      taskId: input.taskId,
      eventType: input.eventType,
      targetUrl: input.targetUrl,
      apiKey: input.apiKey,
      payload: input.payload,
      attempts: input.attempts ?? 0,
      status: 0,
      nextRetryAt: input.nextRetryAt,
      createdAt: now,
      updatedAt: now,
    };
    const [r] = await db.insert(webhookDeliveries).values(insert);
    const id = r.insertId;
    const [row] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
    return row;
  }

  /** Pull pending deliveries due for retry. */
  async listPendingWebhookDeliveries(limit: number, now: number): Promise<WebhookDelivery[]> {
    return await db
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.status, 0), lte(webhookDeliveries.nextRetryAt, now)))
      .orderBy(asc(webhookDeliveries.nextRetryAt))
      .limit(limit);
  }

  async markWebhookDeliveryAttempt(input: {
    id: number;
    attempts: number;
    status: 0 | 1 | 2 | 3;
    nextRetryAt: number;
    lastError: string | null;
  }): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(webhookDeliveries)
      .set({
        attempts: input.attempts,
        status: input.status,
        nextRetryAt: input.nextRetryAt,
        lastError: input.lastError,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, input.id));
  }

  // ===================== INVITATIONS =====================

  async createInvitation(data: {
    token: string;
    companyId: number;
    createdByUserId: number;
    position: string | null;
    isAdmin: boolean;
  }): Promise<Invitation> {
    const now = Math.floor(Date.now() / 1000);
    const [result] = await db.insert(invitations).values({
      token: data.token,
      companyId: data.companyId,
      createdByUserId: data.createdByUserId,
      position: data.position,
      isAdmin: data.isAdmin,
      createdAt: now,
    });
    const insertId = (result as any).insertId;
    const [row] = await db.select().from(invitations).where(eq(invitations.id, insertId));
    if (!row) throw new Error("Failed to create invitation");
    return row;
  }

  async getInvitationById(id: number): Promise<Invitation | undefined> {
    const [row] = await db.select().from(invitations).where(eq(invitations.id, id));
    return row || undefined;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [row] = await db.select().from(invitations).where(eq(invitations.token, token));
    return row || undefined;
  }

  async getInvitationsByCompany(companyId: number, includeAll: boolean): Promise<Invitation[]> {
    if (includeAll) {
      return await db
        .select()
        .from(invitations)
        .where(eq(invitations.companyId, companyId))
        .orderBy(desc(invitations.createdAt));
    }
    return await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.companyId, companyId),
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(desc(invitations.createdAt));
  }

  /**
   * Атомарно помечает приглашение как использованное.
   * Возвращает true если получилось, false — если кто-то уже использовал
   * или приглашение отозвано (race condition при параллельных accept'ах).
   */
  async markInvitationUsed(id: number, usedByUserId: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .update(invitations)
      .set({ usedAt: now, usedByUserId })
      .where(
        and(
          eq(invitations.id, id),
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const affected = (result as any).affectedRows ?? (result as any)[0]?.affectedRows ?? 0;
    return affected > 0;
  }

  async revokeInvitation(id: number): Promise<Invitation | undefined> {
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.id, id),
          isNull(invitations.revokedAt),
          isNull(invitations.usedAt),
        ),
      );
    return await this.getInvitationById(id);
  }

  // ===================== BANNERS =====================

  async listAllBanners(): Promise<Banner[]> {
    return await db
      .select()
      .from(banners)
      .orderBy(asc(banners.position), desc(banners.createdAt));
  }

  async listActiveBanners(placement: "top" | "content"): Promise<Banner[]> {
    const now = Math.floor(Date.now() / 1000);
    return await db
      .select()
      .from(banners)
      .where(
        and(
          eq(banners.active, true),
          or(eq(banners.placement, placement), eq(banners.placement, "both")),
          or(isNull(banners.startsAt), lte(banners.startsAt, now)),
          or(isNull(banners.endsAt), gte(banners.endsAt, now)),
        ),
      )
      .orderBy(asc(banners.position), desc(banners.createdAt));
  }

  async getBanner(id: number): Promise<Banner | undefined> {
    const [b] = await db.select().from(banners).where(eq(banners.id, id));
    return b || undefined;
  }

  async createBanner(data: BannerInput): Promise<Banner> {
    const now = Math.floor(Date.now() / 1000);
    const [result] = await db.insert(banners).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    const insertId = (result as any).insertId;
    const [created] = await db.select().from(banners).where(eq(banners.id, insertId));
    if (!created) throw new Error("Failed to create banner");
    return created;
  }

  async updateBanner(id: number, data: Partial<BannerInput>): Promise<Banner | undefined> {
    await db
      .update(banners)
      .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(banners.id, id));
    return await this.getBanner(id);
  }

  async deleteBanner(id: number): Promise<void> {
    await db.delete(banners).where(eq(banners.id, id));
  }
}

export const storage = new DatabaseStorage();
