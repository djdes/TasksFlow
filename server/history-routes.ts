import type { Express, Request, RequestHandler } from "express";
import { dayInZone, daysBetween, isDay, shiftDay, zoneOrDefault } from "@shared/day";
import { DatabaseStorage, storage } from "./storage";
import { listHistory } from "./task-history-store";
import type { HistoryItem } from "@shared/history";
import { buildCsv, fromHistoryRow, oneOffItems, sortItems, summarize, todayItems } from "@shared/history-report";
import { getPublicTasksflowBaseUrl } from "./public-urls";

/**
 * История выполнения и отчёты.
 *
 *   GET /api/history?day=YYYY-MM-DD&workerId=&locationId=      — журнал дня
 *   GET /api/reports/summary?from=&to=&workerId=&locationId=   — сводка по людям и дням
 *   GET /api/reports/export.csv?from=&to=&workerId=&locationId= — то же построчно для Excel
 *
 * Видимость как у задач: админ и API-ключ — вся компания, руководитель —
 * свои сотрудники и он сам, сотрудник — только он сам.
 */
type Deps = {
  requireAuthOrApiKey: RequestHandler;
  getCompanyIdFromReq: (req: Request) => Promise<number | null>;
};

const MAX_RANGE_DAYS = 92;

type Scope = { companyId: number; tz: string; today: string; workerIds: number[] | null };

class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string) {
    super(message);
  }
}

async function resolveScope(req: Request, deps: Deps): Promise<Scope> {
  const companyId = await deps.getCompanyIdFromReq(req);
  if (!companyId) throw new HttpError(404, "Компания не найдена");
  const company = await storage.getCompanyById(companyId);
  const tz = zoneOrDefault(company?.timezone);
  const today = dayInZone(Math.floor(Date.now() / 1000), tz);
  let workerIds: number[] | null = null;
  if (!req.apiKey) {
    const me = await storage.getUserById(req.session.userId!);
    if (!me) throw new HttpError(401, "Требуется авторизация");
    if (!me.isAdmin) {
      const managed = DatabaseStorage.parseManagedWorkerIds(me.managedWorkerIds);
      workerIds = managed ? Array.from(new Set([...managed, me.id])) : [me.id];
    }
  }
  return { companyId, tz, today, workerIds };
}

/** workerId из запроса в пределах видимости. */
function pickWorkers(scope: Scope, raw: unknown): number[] | null {
  if (raw === undefined || raw === "") return scope.workerIds;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Неверный сотрудник", "workerId");
  if (scope.workerIds && !scope.workerIds.includes(id)) throw new HttpError(403, "Нет доступа к этому сотруднику");
  return [id];
}

/** Сотрудники точки в пределах уже выбранных (точка — свойство сотрудника). */
async function narrowByLocation(scope: Scope, workerIds: number[] | null, raw: unknown): Promise<number[] | null> {
  if (raw === undefined || raw === "") return workerIds;
  const locationId = Number(raw);
  if (!Number.isInteger(locationId) || locationId <= 0) throw new HttpError(400, "Неверная точка", "locationId");
  const inLocation = (await storage.getAllUsers(scope.companyId)).filter((u) => u.locationId === locationId).map((u) => u.id);
  return workerIds ? workerIds.filter((id) => inLocation.includes(id)) : inLocation;
}

async function pickScope(scope: Scope, query: Request["query"]): Promise<number[] | null> {
  return narrowByLocation(scope, pickWorkers(scope, query.workerId), query.locationId);
}

function readRange(scope: Scope, query: Request["query"]): { from: string; to: string } {
  const to = query.to === undefined ? scope.today : String(query.to);
  const from = query.from === undefined ? shiftDay(to, -6) : String(query.from);
  if (!isDay(from)) throw new HttpError(400, "Неверная дата начала", "from");
  if (!isDay(to)) throw new HttpError(400, "Неверная дата конца", "to");
  if (from > to) throw new HttpError(400, "Начало периода позже конца", "from");
  if (to > scope.today) throw new HttpError(400, "Период не может заканчиваться в будущем", "to");
  if (daysBetween(from, to) > MAX_RANGE_DAYS) throw new HttpError(400, `Период — не больше ${MAX_RANGE_DAYS} дней`, "from");
  return { from, to };
}

async function collect(scope: Scope, from: string, to: string, workerIds: number[] | null): Promise<HistoryItem[]> {
  const items: HistoryItem[] = [];
  const tasks = await storage.getTasks(scope.companyId);
  if (from < scope.today) {
    const lastPast = to < scope.today ? to : shiftDay(scope.today, -1);
    const rows = await listHistory({ companyId: scope.companyId, from, to: lastPast, workerIds });
    for (const row of rows) items.push(fromHistoryRow(row, scope.tz));
    // Разовые задачи сброс не архивирует — они в tasks по дате выполнения.
    items.push(...oneOffItems(tasks, scope.tz, from, lastPast, workerIds));
  }
  if (to >= scope.today) {
    items.push(...todayItems(tasks, scope.tz, scope.today, workerIds));
  }
  return sortItems(items);
}

function handle(fn: (req: Request, res: import("express").Response) => Promise<unknown>): RequestHandler {
  return (req, res) => {
    fn(req, res).catch((err) => {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ message: err.message, ...(err.field ? { field: err.field } : {}) });
      }
      console.error("[history]", err);
      res.status(500).json({ message: "Не удалось загрузить историю" });
    });
  };
}

export function registerHistoryRoutes(app: Express, deps: Deps): void {
  app.get(
    "/api/history",
    deps.requireAuthOrApiKey,
    handle(async (req, res) => {
      const scope = await resolveScope(req, deps);
      const day = req.query.day === undefined ? scope.today : String(req.query.day);
      if (!isDay(day) || day > scope.today) throw new HttpError(400, "Неверная дата", "day");
      const items = await collect(scope, day, day, await pickScope(scope, req.query));
      res.json({ day, today: scope.today, timezone: scope.tz, items });
    }),
  );

  app.get(
    "/api/reports/summary",
    deps.requireAuthOrApiKey,
    handle(async (req, res) => {
      const scope = await resolveScope(req, deps);
      const { from, to } = readRange(scope, req.query);
      const items = await collect(scope, from, to, await pickScope(scope, req.query));
      const users = await storage.getAllUsers(scope.companyId);
      res.json({ from, to, today: scope.today, timezone: scope.tz, ...summarize(items, users) });
    }),
  );

  app.get(
    "/api/reports/export.csv",
    deps.requireAuthOrApiKey,
    handle(async (req, res) => {
      const scope = await resolveScope(req, deps);
      const { from, to } = readRange(scope, req.query);
      const items = await collect(scope, from, to, await pickScope(scope, req.query));
      const users = await storage.getAllUsers(scope.companyId);
      const base = getPublicTasksflowBaseUrl(req).replace(/\/+$/, "");
      const csv = buildCsv(items, users, (path) => (/^https?:\/\//.test(path) ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="tasksflow-${from}_${to}.csv"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(csv);
    }),
  );
}
