import type { Task } from "@shared/schema";
import { dayInZone, daysBetween, isDay, shiftDay } from "@shared/day";
import { DEFAULT_NOTIFY } from "@shared/notify";
import { DEFAULT_PHOTO_SETTINGS } from "@shared/photo-settings";
import { PLANS } from "@shared/plans";
import { DEFAULT_PRICES, type BillingInfo } from "@shared/billing";
import { buildCsv, fromHistoryRow, sortItems, summarize, todayItems } from "@shared/history-report";
import type { HistoryItem } from "@shared/history";
import { createDemoState, DEMO_TZ, type DemoState } from "./demo-data";
import { exitDemo } from "./demo-mode";

/**
 * API демо-кабинета прямо в браузере: перехватываем fetch к /api/* и
 * отвечаем из памяти. На сервер ничего не уходит — ни задачи, ни фото;
 * перезагрузка страницы начинает демо заново. Отчёты и журнал считает тот
 * же код, что и сервер (shared/history-report.ts).
 */
type Reply = { status?: number; json?: unknown; text?: string; type?: string };

const ROLE_KEY = "tf_demo_role";
function storedRole(): "admin" | "worker" {
  try {
    return sessionStorage.getItem(ROLE_KEY) === "worker" ? "worker" : "admin";
  } catch {
    return "admin";
  }
}

let state: DemoState = createDemoState();
state.meId = storedRole() === "worker" ? 2 : 1;
const now = () => Math.floor(Date.now() / 1000);

/** Тариф демо-кофейни: «Команда» ещё на 12 дней, один прошлый платёж. */
function demoBilling(): BillingInfo {
  const t = now();
  const paidAt = t - 18 * 86400;
  return {
    configured: true,
    testMode: false,
    recurringAvailable: true,
    plan: { id: "team", until: t + 12 * 86400, perpetual: false, usersCount: state.users.length },
    prices: DEFAULT_PRICES.map((p) => ({ ...p })),
    recurring: { active: false, plan: null, months: null, amountRub: null, nextChargeAt: null },
    orders: [
      { id: 1042, plan: "team", months: 1, amountRub: 990, description: "TasksFlow, тариф «Команда» на 1 месяц", status: "paid", isTest: false, automatic: false, createdAt: paidAt, paidAt, planUntil: t + 12 * 86400, refundStatus: null },
    ],
    email: null,
    now: t,
  };
}
const me = () => state.users.find((u) => u.id === state.meId)!;
const isAdmin = () => me().isAdmin;

/** Сменить роль: админ ↔ сотрудник (Анна). */
export function setDemoRole(role: "admin" | "worker"): void {
  state.meId = role === "admin" ? 1 : 2;
  try {
    sessionStorage.setItem(ROLE_KEY, role);
  } catch {
    // роль сбросится при перезагрузке
  }
}
export function demoRole(): "admin" | "worker" {
  return state.meId === 1 ? "admin" : "worker";
}

const company = () => ({
  id: 1,
  name: "Кофейня «Демо»",
  email: "demo@tasksflow.ru",
  createdAt: state.users[0].createdAt,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
  timezone: DEMO_TZ,
  plan: "business",
  planUntil: null,
  notify: DEFAULT_NOTIFY,
  photo: DEFAULT_PHOTO_SETTINGS,
  planInfo: { ...PLANS.business, until: null, enforced: false },
  wesetupConfigured: false,
});

function visibleTasks(): Task[] {
  return isAdmin() ? state.tasks : state.tasks.filter((t) => t.workerId === state.meId);
}

function findTask(id: number): Task | undefined {
  return state.tasks.find((t) => t.id === id);
}

function patchTask(id: number, patch: Partial<Task>): Task {
  const i = state.tasks.findIndex((t) => t.id === id);
  state.tasks[i] = { ...state.tasks[i], ...patch } as Task;
  return state.tasks[i];
}

function credit(workerId: number | null, amount: number) {
  if (!workerId || !amount) return;
  const u = state.users.find((x) => x.id === workerId);
  if (u) u.bonusBalance = Math.max(0, u.bonusBalance + amount);
}

async function readBody(body: BodyInit | null | undefined): Promise<any> {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (body instanceof FormData) return body;
  return null;
}

function photoFrom(form: unknown): string | null {
  if (!(form instanceof FormData)) return null;
  const file = form.get("photo");
  return file instanceof Blob ? URL.createObjectURL(file) : null;
}

function historyFor(from: string, to: string, workerIds: number[] | null): HistoryItem[] {
  const today = dayInZone(now(), DEMO_TZ);
  const allowed = workerIds ? new Set(workerIds) : null;
  const past = state.history
    .filter((h) => h.day >= from && h.day <= to && h.day < today && (!allowed || (h.workerId != null && allowed.has(h.workerId))))
    .map((h) => fromHistoryRow(h, DEMO_TZ));
  const live = to >= today ? todayItems(state.tasks, DEMO_TZ, today, workerIds) : [];
  return sortItems([...past, ...live]);
}

function scopeIds(url: URL): number[] | null {
  let ids: number[] | null = isAdmin() ? null : [state.meId];
  const worker = url.searchParams.get("workerId");
  if (worker) ids = [Number(worker)];
  const loc = url.searchParams.get("locationId");
  if (loc) {
    const inLoc = state.users.filter((u) => u.locationId === Number(loc)).map((u) => u.id);
    ids = ids ? ids.filter((id) => inLoc.includes(id)) : inLoc;
  }
  return ids;
}

function range(url: URL): { from: string; to: string } {
  const today = dayInZone(now(), DEMO_TZ);
  const to = isDay(url.searchParams.get("to")) ? url.searchParams.get("to")! : today;
  const from = isDay(url.searchParams.get("from")) ? url.searchParams.get("from")! : shiftDay(to, -6);
  return daysBetween(from, to) > 92 ? { from: shiftDay(to, -91), to } : { from, to };
}

async function route(method: string, url: URL, rawBody: BodyInit | null | undefined): Promise<Reply> {
  const path = url.pathname;
  const body = await readBody(rawBody);
  const id = Number(path.split("/")[3]);
  let m: RegExpMatchArray | null;

  // --- сессия и компания ---
  if (path === "/api/auth/me") return { json: { ...me(), pinResetByEmail: false } };
  if (path === "/api/auth/logout") {
    // «Выйти» в демо — выход из демо на лендинг.
    exitDemo();
    setTimeout(() => window.location.assign("/"), 0);
    return { json: { ok: true } };
  }
  if (path === "/api/companies/me") return { json: company() };
  if (path === "/api/locations" && method === "GET") return { json: state.locations };
  if (path === "/api/me/telegram") return { json: { connected: false, botConfigured: false } };
  if (path === "/api/client-errors") return { status: 204, text: "" };

  // --- задачи ---
  if (path === "/api/tasks" && method === "GET") return { json: visibleTasks() };
  if (path === "/api/tasks/awaiting-verification") {
    return { json: isAdmin() ? state.tasks.filter((t) => t.verificationStatus === "submitted") : [] };
  }
  if (path === "/api/tasks" && method === "POST") {
    const task = {
      ...state.tasks[0],
      ...body,
      id: state.nextId++,
      isCompleted: false,
      completedAt: null,
      photoUrl: null,
      photoUrls: [],
      examplePhotoUrls: [],
      createdAt: now(),
      verificationStatus: null,
      verifierWorkerId: null,
      checklist: Array.isArray(body?.checklist) ? body.checklist : [],
      weekDays: body?.weekDays ?? null,
      isRecurring: body?.isRecurring ?? true,
    } as Task;
    state.tasks.push(task);
    return { status: 201, json: task };
  }
  if ((m = path.match(/^\/api\/tasks\/(\d+)$/))) {
    const task = findTask(Number(m[1]));
    if (!task) return { status: 404, json: { message: "Задача не найдена" } };
    if (method === "GET") return { json: task };
    if (method === "PUT" || method === "PATCH") return { json: patchTask(task.id, body ?? {}) };
    if (method === "DELETE") {
      state.tasks = state.tasks.filter((t) => t.id !== task.id);
      return { status: 204, text: "" };
    }
  }
  if ((m = path.match(/^\/api\/tasks\/(\d+)\/complete$/))) {
    const task = findTask(Number(m[1]))!;
    if (task.requiresPhoto && task.photoUrls.length === 0) return { status: 400, json: { message: "Необходимо загрузить фото перед завершением" } };
    if (task.checklist.length > 0 && !task.checklist.every((c) => c.done)) {
      return { status: 400, json: { message: `Отметьте все пункты чек-листа с фото (${task.checklist.filter((c) => c.done).length}/${task.checklist.length})` } };
    }
    if (task.verifierWorkerId && task.verifierWorkerId !== state.meId) {
      return { json: patchTask(task.id, { verificationStatus: "submitted" }) };
    }
    if (!task.isCompleted) credit(task.workerId, task.price);
    return { json: patchTask(task.id, { isCompleted: true, completedAt: now() }) };
  }
  if ((m = path.match(/^\/api\/tasks\/(\d+)\/uncomplete$/))) {
    const task = findTask(Number(m[1]))!;
    if (task.isCompleted) credit(task.workerId, -task.price);
    return { json: patchTask(task.id, { isCompleted: false, completedAt: null }) };
  }
  if ((m = path.match(/^\/api\/tasks\/(\d+)\/verify$/))) {
    const task = findTask(Number(m[1]))!;
    if (body?.decision === "approve") {
      credit(task.workerId, task.price);
      return { json: patchTask(task.id, { isCompleted: true, completedAt: now(), verificationStatus: "approved", verifiedByUserId: state.meId, verifiedAt: now() }) };
    }
    return { json: patchTask(task.id, { verificationStatus: "rejected", rejectReason: body?.reason ?? "Переделать" }) };
  }
  if ((m = path.match(/^\/api\/tasks\/(\d+)\/photo$/))) {
    const task = findTask(Number(m[1]))!;
    if (method === "POST") {
      const url2 = photoFrom(body);
      if (!url2) return { status: 400, json: { message: "Фото не получено" } };
      const updated = patchTask(task.id, { photoUrls: [...task.photoUrls, url2], photoUrl: url2 });
      return { json: { photoUrl: url2, photoUrls: updated.photoUrls } };
    }
    if (method === "DELETE") {
      const target = url.searchParams.get("url");
      const photoUrls = target ? task.photoUrls.filter((p) => p !== target) : [];
      patchTask(task.id, { photoUrls, photoUrl: photoUrls.at(-1) ?? null });
      return { json: { success: true, photoUrls } };
    }
  }
  if ((m = path.match(/^\/api\/tasks\/(\d+)\/checklist\/([^/]+)\/photo$/))) {
    const task = findTask(Number(m[1]))!;
    const itemId = decodeURIComponent(m[2]);
    if (method === "POST") {
      const url2 = photoFrom(body);
      if (!url2) return { status: 400, json: { message: "Фото не получено" } };
      const checklist = task.checklist.map((c) => (c.id === itemId ? { ...c, done: true, photoUrls: [...(c.photoUrls ?? []), url2] } : c));
      return { json: { photoUrl: url2, task: patchTask(task.id, { checklist }) } };
    }
    const target = url.searchParams.get("url");
    const checklist = task.checklist.map((c) => {
      if (c.id !== itemId) return c;
      const photoUrls = (c.photoUrls ?? []).filter((p) => p !== target);
      return { ...c, photoUrls, done: photoUrls.length > 0 };
    });
    return { json: { task: patchTask(task.id, { checklist }) } };
  }

  // --- люди ---
  if (path === "/api/users" && method === "GET") return { json: state.users };
  if (path === "/api/users" && method === "POST") {
    const user = { ...state.users[1], id: state.nextId++, name: body?.name || null, phone: body?.phone, bonusBalance: 0, hasPin: !!body?.pin, locationId: null };
    state.users.push(user);
    return { status: 201, json: user };
  }
  if ((m = path.match(/^\/api\/users\/(\d+)(\/[a-z-]+)?$/))) {
    const user = state.users.find((u) => u.id === Number(m![1]));
    if (!user) return { status: 404, json: { message: "Пользователь не найден" } };
    const tail = m[2] ?? "";
    if (tail === "/location") user.locationId = body?.locationId ?? null;
    else if (tail === "/pin") user.hasPin = method === "POST";
    else if (tail === "/reset-balance") user.bonusBalance = 0;
    else if (method === "PUT") Object.assign(user, { phone: body?.phone ?? user.phone, name: body?.name ?? user.name });
    else if (method === "DELETE") {
      state.users = state.users.filter((u) => u.id !== user.id);
      return { json: { success: true } };
    }
    return { json: user };
  }

  // --- история и отчёты ---
  if (path === "/api/history") {
    const today = dayInZone(now(), DEMO_TZ);
    const day = isDay(url.searchParams.get("day")) ? url.searchParams.get("day")! : today;
    return { json: { day, today, timezone: DEMO_TZ, items: historyFor(day, day, scopeIds(url)) } };
  }
  if (path === "/api/reports/summary") {
    const r = range(url);
    return { json: { ...r, today: dayInZone(now(), DEMO_TZ), timezone: DEMO_TZ, ...summarize(historyFor(r.from, r.to, scopeIds(url)), state.users) } };
  }
  if (path === "/api/reports/export.csv") {
    const r = range(url);
    return { text: buildCsv(historyFor(r.from, r.to, scopeIds(url)), state.users, (p) => p), type: "text/csv; charset=utf-8" };
  }

  // «Тариф и оплата»: форма как настоящая, но оплата не проводится.
  if (path === "/api/billing" && method === "GET") return { json: demoBilling() };
  if (path === "/api/billing/checkout") {
    return { status: 400, json: { message: "В демо оплата не проводится. Зарегистрируйте компанию — оплатить тариф можно будет здесь же." } };
  }
  if (path.startsWith("/api/billing/orders/")) return { status: 404, json: { message: "Заказ не найден" } };
  if (path === "/api/billing/recurring") return { json: { ok: true, active: false } };

  // Остальное (приглашения, ключи, интеграции): пусто, но без ошибок.
  return method === "GET" ? { json: [] } : { json: { ok: true } };
}

let installed = false;

export function installDemoApi(): void {
  if (installed) return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    // Чуть-чуть «сети», чтобы скелетоны и анимации вели себя как в жизни.
    await new Promise((r) => setTimeout(r, 120 + Math.round(Math.random() * 160)));
    try {
      const reply = await route(method, url, init?.body);
      const status = reply.status ?? 200;
      const payload = status === 204 ? null : reply.text ?? JSON.stringify(reply.json ?? null);
      return new Response(payload, { status, headers: { "Content-Type": reply.type ?? "application/json" } });
    } catch (err) {
      console.error("[demo]", err);
      return new Response(JSON.stringify({ message: "В демо что-то пошло не так" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  };
}

export function resetDemo(): void {
  state = createDemoState();
}
