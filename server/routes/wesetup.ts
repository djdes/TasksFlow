// Прокси к WeSetup: каталог журналов, формы задач, выполнение с данными, привязка строк, синхронизация.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { tasks } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { publishToCompany } from "../live-events";
import { getJournalLinkIntegrationId, parseJournalLink } from "@shared/journal-link";
import type { JournalLink } from "@shared/journal-link";
import {
  findTaskFormInCatalog,
  journalKindToTemplateCode,
  normalizeTaskFormPayload,
  type TaskFormSchema,
  type WesetupCatalog,
} from "@shared/wesetup-journal-mode";
import {
  getPublicTasksflowBaseUrl,
  getPublicWesetupBaseUrl,
  toPublicWesetupUrl,
} from "../public-urls";
import { onTaskSubmitted, safely } from "../push/events";
import { accessWithApproval } from "../access";
import { requireAuth, requireAdmin, canActOnTask, getCompanyIdFromReq } from "./common";

export type ResolvedWesetupTarget = {
  baseUrl: string;
  key: string;
  companyId: number | null;
  source: "company" | "env";
};

export type WesetupTargetResult =
  | ResolvedWesetupTarget
  | { error: string; status: number };

export async function fetchWesetupCatalogFromTarget(target: ResolvedWesetupTarget) {
  const upstream = await fetch(
    `${target.baseUrl}/api/integrations/tasksflow/journals-catalog`,
    {
      headers: { Authorization: `Bearer ${target.key}` },
      cache: "no-store",
      // 30s timeout: catalog fetch — admin UI view, не должна
      // вешать handler если WeSetup тормозит. Без таймаута Express
      // ждёт до browser ~5min.
      signal: AbortSignal.timeout(30_000),
    }
  );
  return upstream;
}

export function extractUpstreamMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { message?: unknown; error?: unknown };
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  return null;
}

export function normalizeWesetupNetworkError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err || "");
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/i.test(message)) {
    return "WeSetup недоступен. Проверьте адрес, ключ и доступность сервера.";
  }
  return message || "Network error";
}

export async function fetchWesetupJournalsCatalog(req: Request) {
  const target = await resolveWesetupTarget(req);
  if ("error" in target) {
    throw Object.assign(new Error(target.error), { status: target.status });
  }
  return fetchWesetupCatalogFromTarget(target);
}

/**
 * Resolve the WeSetup integration pair for the current request. Each
 * TasksFlow company owns its own (baseUrl, apiKey) pair — stored on
 * `companies.wesetup_base_url / wesetup_api_key`. Falls back to the
 * legacy single-tenant `.env` values when the company row is null so
 * old deployments keep working.
 */
export async function resolveWesetupTarget(req: Request): Promise<WesetupTargetResult> {
  const userId = (req as any).session?.userId;
  let companyId: number | null = null;
  if (userId) {
    const u = await storage.getUserById(userId);
    companyId = u?.companyId ?? null;
  }
  if (companyId) {
    const company = await storage.getCompanyById(companyId);
    const companyBaseUrl = company?.wesetupBaseUrl?.trim().replace(/\/+$/, "");
    const companyKey = company?.wesetupApiKey?.trim();
    if (companyBaseUrl && companyKey) {
      return {
        baseUrl: companyBaseUrl,
        key: companyKey,
        companyId,
        source: "company",
      };
    }
    if (companyBaseUrl || companyKey) {
      return {
        error:
          "WeSetup-интеграция компании настроена не полностью: нужны и baseUrl, и apiKey.",
        status: 503,
      };
    }
  }
  const baseUrl = process.env.WESETUP_BASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.WESETUP_API_KEY?.trim();
  if (baseUrl && key) {
    return { baseUrl, key, companyId, source: "env" };
  }
  return {
    error:
      "WeSetup-интеграция не настроена для этой компании. Добавьте wesetup_api_key в companies или WESETUP_API_KEY в .env.",
    status: 503,
  };
}

export function parseJsonOrUndefined(text: string): unknown | undefined {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function resolveTaskFormFromCatalog(
  target: ResolvedWesetupTarget,
  taskId: number
): Promise<{ resolved: true; form: unknown | null } | { resolved: false }> {
  const task = await storage.getTask(taskId);
  const journalLink = parseJournalLink(task?.journalLink);
  if (!journalLink) return { resolved: false };

  const catalogResponse = await fetchWesetupCatalogFromTarget(target);
  if (!catalogResponse.ok) return { resolved: false };
  const catalogText = await catalogResponse.text();
  const catalog = parseJsonOrUndefined(catalogText) as WesetupCatalog | undefined;
  if (!catalog?.journals) return { resolved: false };
  const templateCode = journalKindToTemplateCode(journalLink.kind);
  const journal = catalog.journals.find(
    (item) =>
      item.templateCode === templateCode ||
      `wesetup-${item.templateCode}` === journalLink.kind
  );
  const form = findTaskFormInCatalog(catalog, journalLink.kind);

  return {
    resolved: true,
    form: form ?? createGenericJournalTaskForm(journalLink, journal?.label),
  };
}

export function createGenericJournalTaskForm(
  journalLink: JournalLink,
  journalLabel?: string | null
): TaskFormSchema {
  const templateCode = journalKindToTemplateCode(journalLink.kind);
  return {
    intro: journalLabel
      ? `WeSetup пока не передал структуру формы для журнала «${journalLabel}». Можно подтвердить выполнение и оставить комментарий.`
      : "WeSetup пока не передал структуру формы для этого журнала. Можно подтвердить выполнение и оставить комментарий.",
    fields: [
      {
        type: "hidden",
        key: "journalCode",
        label: "Код журнала",
        defaultValue: templateCode,
      },
      {
        type: "hidden",
        key: "documentId",
        label: "Документ",
        defaultValue: journalLink.documentId,
      },
      {
        type: "hidden",
        key: "rowKey",
        label: "Строка",
        defaultValue: journalLink.rowKey,
      },
      {
        type: "boolean",
        key: "completed",
        label: "Работа выполнена",
        defaultValue: true,
      },
      {
        type: "textarea",
        key: "comment",
        label: "Комментарий",
        placeholder: "Что сделано / замечания",
      },
    ],
    submitLabel: "Отправить в WeSetup",
  };
}

export async function proxyToWesetup(
  req: Request,
  res: Response,
  path: string,
  method: "GET" | "POST",
) {
  const target = await resolveWesetupTarget(req);
  if ("error" in target) {
    return res.status(target.status).json({ message: target.error });
  }
  const { baseUrl, key } = target;
  try {
    const upstream = await fetch(`${baseUrl}${path}`, {
      method,
      // 60s — этот generic-proxy используется для sync-users и
      // sync-tasks, массовых операций. 30s могло обрезать на
      // больших компаниях.
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${key}`,
        ...(method === "POST"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: method === "POST" ? JSON.stringify(req.body || {}) : undefined,
      cache: "no-store",
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json",
    );
    res.send(text);
  } catch (err: any) {
    console.error(`[wesetup-proxy] ${path} failed`, err);
    res.status(502).json({
      message: normalizeWesetupNetworkError(err),
    });
  }
}

export function registerWesetupRoutes(app: Express): void {
  // ===================== WESETUP PROXY =====================
  // Тонкий прокси, чтобы создание задачи в «Журнальном» режиме не зависело
  // от того, видит ли браузер админа сервер WeSetup. Сервер TasksFlow ходит
  // в WeSetup со своим WESETUP_API_KEY (тот же tfk_, что админ вписал в
  // настройках интеграции в WeSetup) и отдаёт каталог фронту.

  // Каталог всех журналов (любого типа), которые WeSetup готов
  // предложить TasksFlow для привязки. Старый /cleaning-catalog
  // оставлен для обратной совместимости — внутри он ходит сюда же.
  app.get("/api/wesetup/journals-catalog", requireAuth, requireAdmin, async (req, res) => {
    try {
      const upstream = await fetchWesetupJournalsCatalog(req);
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json"
      );
      res.send(text);
    } catch (err: any) {
      console.error("[wesetup-proxy] journals-catalog failed", err);
      res.status(err?.status || 502).json({
        message: normalizeWesetupNetworkError(err),
      });
    }
  });

  // Backwards-compat shim: старая страница CreateTask.tsx звала
  // /cleaning-catalog. Теперь оборачиваем универсальный ответ так,
  // чтобы клиент, ожидающий старый формат, не падал.
  app.get("/api/wesetup/cleaning-catalog", requireAuth, requireAdmin, async (req, res) => {
    try {
      const upstream = await fetchWesetupJournalsCatalog(req);
      if (!upstream.ok) {
        const text = await upstream.text();
        res.status(upstream.status);
        res.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") || "application/json"
        );
        return res.send(text);
      }
      const data = (await upstream.json()) as {
        journals?: Array<{
          templateCode: string;
          documents: Array<{
            documentId: string;
            documentTitle: string;
            period: { from: string; to: string };
            rows: Array<{
              rowKey: string;
              label: string;
              sublabel?: string;
              responsibleUserId: string | null;
              existingTasksflowTaskId: number | null;
            }>;
          }>;
        }>;
      };
      const cleaning = data.journals?.find((j) => j.templateCode === "cleaning");
      const documents = (cleaning?.documents ?? []).map((doc) => ({
        documentId: doc.documentId,
        title: doc.documentTitle,
        period: doc.period,
        pairs: doc.rows.map((row) => ({
          rowKey: row.rowKey,
          cleaningTitle: row.label,
          cleaningUserName: row.label,
          controlTitle: row.sublabel ?? "",
          controlUserName: null,
          cleaningUserId: row.responsibleUserId,
          existingTasksflowTaskId: row.existingTasksflowTaskId,
        })),
      }));
      res.json({ journalCode: "cleaning", documents });
    } catch (err: any) {
      console.error("[wesetup-proxy] cleaning-catalog (compat) failed", err);
      res.status(err?.status || 502).json({
        message: normalizeWesetupNetworkError(err),
      });
    }
  });

  app.get("/api/wesetup/health", requireAuth, requireAdmin, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({
        ok: false,
        message: target.error,
      });
    }

    try {
      const upstream = await fetchWesetupCatalogFromTarget(target);
      const text = await upstream.text();
      const parsed = parseJsonOrUndefined(text);
      const upstreamMessage = extractUpstreamMessage(parsed);

      if (!upstream.ok) {
        return res.status(upstream.status === 401 || upstream.status === 403 ? 401 : 502).json({
          ok: false,
          upstreamStatus: upstream.status,
          message:
            upstreamMessage ||
            `WeSetup вернул HTTP ${upstream.status}. Проверьте ключ и адрес интеграции.`,
        });
      }

      const catalog = parsed as Partial<WesetupCatalog> | undefined;
      if (!catalog || !Array.isArray(catalog.journals)) {
        return res.status(502).json({
          ok: false,
          upstreamStatus: upstream.status,
          message: "WeSetup ответил не каталогом журналов TasksFlow.",
        });
      }

      res.json({
        ok: true,
        source: target.source,
        baseUrl: target.baseUrl,
        journalsCount: catalog.journals.length,
        formsCount: catalog.journals.filter((journal) => Boolean(journal.taskForm)).length,
        assignableUsersCount: Array.isArray(catalog.assignableUsers)
          ? catalog.assignableUsers.length
          : 0,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        message: normalizeWesetupNetworkError(err),
      });
    }
  });

  // Прокси, который минтит HMAC-токен на WeSetup и отдаёт фронту
  // готовый URL вида
  //   https://wesetup.ru/task-fill/<taskId>?token=<signed>&return=<back>
  // Браузер редиректит сотрудника на этот URL — WeSetup рендерит
  // ту же форму, которой пользуется админ в своём журнале. Никакой
  // WeSetup-сессии у сотрудника не нужно: токен HMAC'ан нашим
  // webhookSecret.
  app.get("/api/wesetup/task-fill-url", requireAuth, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    const taskId = Number(req.query.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "Bad taskId" });
    }
    const task = await storage.getTask(taskId);
    if (!task) {
      return res.status(404).json({ message: "Задача не найдена" });
    }
    // Multi-tenant scope: задача должна принадлежать компании юзера.
    const callerCompanyId = await getCompanyIdFromReq(req);
    if (callerCompanyId !== null && task.companyId !== callerCompanyId) {
      return res.status(404).json({ message: "Задача не найдена" });
    }
    const journalLinkIntegrationId = getJournalLinkIntegrationId(
      task.journalLink
    );
    try {
      const upstream = await fetch(
        `${baseUrl}/api/integrations/tasksflow/task-fill-token`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId,
            ...(journalLinkIntegrationId
              ? { integrationId: journalLinkIntegrationId }
              : {}),
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        }
      );
      const text = await upstream.text();
      if (!upstream.ok) {
        res.status(upstream.status);
        res.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") || "application/json"
        );
        return res.send(text);
      }
      const data = parseJsonOrUndefined(text) as { url?: string; token?: string } | undefined;
      if (!data) {
        return res.status(502).json({
          message: "WeSetup вернул не JSON при создании ссылки заполнения.",
        });
      }
      if (!data?.url) {
        return res.status(502).json({ message: "No url in response" });
      }
      // Tack on a public return= parameter so the worker can bounce back to
      // TasksFlow after submit. WeSetup may be called through localhost on the
      // server, but the browser must never receive localhost in production.
      const returnUrl = `${getPublicTasksflowBaseUrl(req)}/dashboard`;
      const publicWesetupBaseUrl = getPublicWesetupBaseUrl(baseUrl);
      const publicTaskFillUrl = toPublicWesetupUrl(data.url, publicWesetupBaseUrl);
      const sep = publicTaskFillUrl.includes("?") ? "&" : "?";
      const finalUrl = `${publicTaskFillUrl}${sep}return=${encodeURIComponent(
        returnUrl
      )}`;
      res.json({ url: finalUrl, token: data.token });
    } catch (err: any) {
      console.error("[wesetup-proxy] task-fill-url failed", err);
      res.status(502).json({ message: normalizeWesetupNetworkError(err) });
    }
  });

  // Прокси для task-form: фронт задачи зовёт сюда,
  // когда сотруднику нужно показать форму заполнения перед
  // «Выполнено». Возвращает TaskFormSchema или null.
  app.get("/api/wesetup/task-form", requireAuth, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    const taskId = Number(req.query.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "taskId required" });
    }
    let task: Awaited<ReturnType<typeof storage.getTask>>;
    try {
      task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      // Multi-tenant scope: задача должна принадлежать компании юзера.
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && task.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const journalLinkIntegrationId = getJournalLinkIntegrationId(
        task.journalLink
      );
      const upstreamUrl = new URL(
        `${baseUrl}/api/integrations/tasksflow/task-form`
      );
      upstreamUrl.searchParams.set("taskId", String(taskId));
      if (journalLinkIntegrationId) {
        upstreamUrl.searchParams.set("integrationId", journalLinkIntegrationId);
      }
      const upstream = await fetch(upstreamUrl, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const text = await upstream.text();
      const parsed = parseJsonOrUndefined(text);
      const normalized =
        parsed === undefined ? null : normalizeTaskFormPayload(parsed);
      const parsedObject =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
      const upstreamJournalCode =
        typeof parsedObject?.journalCode === "string"
          ? parsedObject.journalCode
          : null;

      // Photo-enforcement (2026-05-10): прокидываем task.requiresPhoto и
      // photoUrls в ответ, чтобы TaskFormFiller знал когда показывать
      // photo upload UI и блокировать «Сделал» без фото. Раньше форма
      // возвращалась без этих полей → юзер просто видел checkbox-фильд
      // «Сделал», нажимал, /complete-with-values пропускал без
      // photo-check (теперь чек добавлен). Без UI-аплоада — юзер видел
      // 400 «Необходимо загрузить фото» без способа загрузить.
      const taskMeta = {
        requiresPhoto: Boolean((task as any).requiresPhoto),
        photoUrls: Array.isArray((task as any).photoUrls)
          ? ((task as any).photoUrls as string[])
          : [],
        photoUrl: (task as any).photoUrl ?? null,
      };

      if (upstream.ok) {
        if (normalized?.form) {
          return res
            .status(upstream.status)
            .json({ ...normalized, task: taskMeta });
        }
        if (normalized && !upstreamJournalCode) {
          return res.status(404).json({
            message:
              "Задача не связана со строкой журнала WeSetup. Создайте журнальную задачу заново через режим WeSetup.",
          });
        }
        const fallback = await resolveTaskFormFromCatalog(target, taskId);
        if (fallback.resolved) {
          return res.json({ form: fallback.form, task: taskMeta });
        }
        if (normalized || !text.trim()) {
          return res
            .status(upstream.status)
            .json({ form: null, task: taskMeta });
        }
        return res.status(502).json({
          message: "WeSetup вернул task-form в неизвестном формате",
        });
      }

      if ([404, 500, 502, 503].includes(upstream.status)) {
        const fallback = await resolveTaskFormFromCatalog(target, taskId);
        if (fallback.resolved) {
          return res.json({ form: fallback.form });
        }
      }

      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (err: any) {
      console.error("[wesetup-proxy] task-form failed", err);
      res.status(502).json({ message: normalizeWesetupNetworkError(err) });
    }
  });

  // Прокси для «выполнить с данными формы». Отличие от обычного
  // /api/tasks/:id/complete в том, что здесь летят structured values,
  // которые WeSetup разложит по колонкам журнала. После успеха тут же
  // отмечаем задачу выполненной локально.
  app.post("/api/wesetup/complete-with-values", requireAuth, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    const { taskId, values, isCompleted } = req.body || {};
    if (typeof taskId !== "number") {
      return res.status(400).json({ message: "taskId должен быть числом" });
    }

    // Проверим, что сотрудник — исполнитель этой задачи (или админ),
    // и что задача принадлежит компании текущего юзера (multi-tenant).
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const user = req.session?.userId
        ? await storage.getUserById(req.session.userId)
        : null;
      if (user?.companyId != null && task.companyId !== user.companyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const isAllowed = await canActOnTask(user ?? undefined, task);
      if (!isAllowed) {
        return res.status(403).json({
          message: "Вы не являетесь исполнителем этой задачи",
        });
      }
      // 2026-05-10: photo-enforcement parity с /complete endpoint.
      // Раньше /complete-with-values (путь journal-задач WeSetup) шёл
      // мимо photo-check → юзер мог завершить задачу без фото даже
      // когда task.requiresPhoto=true. Теперь блокируем как и /complete.
      // Skip только для uncomplete (isCompleted:false) — там photo
      // не нужен, юзер откатывает, не завершает.
      const willComplete = Boolean(isCompleted ?? true);
      if (willComplete && task.requiresPhoto) {
        const taskPhotoUrls = (task as any).photoUrls || [];
        const hasPhotos = taskPhotoUrls.length > 0 || task.photoUrl;
        if (!hasPhotos) {
          return res
            .status(400)
            .json({ message: "Необходимо загрузить фото перед завершением" });
        }
      }
    } catch (err: any) {
      console.error("[wesetup-proxy] complete auth check failed", err);
      return res.status(500).json({ message: "Ошибка проверки прав" });
    }

    // Двухстадийная верификация для journal-задач.
    // Раньше /complete-with-values сразу:
    //   1) звонил WeSetup → applyRemoteCompletion записал в журнал
    //   2) transitionTaskToCompleted локально → isCompleted=true
    // — обходил submitForVerification, заведующая не видела задачу.
    //
    // Теперь если task.verifierWorkerId set + не self + isCompleted=true:
    // сохраняем JSON-payload в submitted_values, делаем submitForVerification,
    // НЕ ЗВОНИМ в WeSetup. Approve-handler позже сам отправит данные
    // в журнал. Это позволяет заведующей отклонить запись ДО того
    // как она попадёт в журнал WeSetup.
    const taskBeforeAny = await storage.getTask(taskId);
    const desired = Boolean(isCompleted ?? true);
    const meId = req.session?.userId;
    const byVerifier =
      desired &&
      !!taskBeforeAny &&
      typeof taskBeforeAny.verifierWorkerId === "number" &&
      taskBeforeAny.verifierWorkerId !== meId;
    // Как в /complete: роль исполнителя требует проверки — запись в журнал
    // ждёт «Принять» руководителя или админа (shared/roles.ts).
    let byRole = false;
    if (
      !byVerifier &&
      desired &&
      taskBeforeAny &&
      meId != null &&
      taskBeforeAny.workerId === meId &&
      taskBeforeAny.verifierWorkerId !== meId
    ) {
      const me = await storage.getUserById(meId);
      byRole = !!me && (await accessWithApproval(me)).requiresApproval;
    }
    const requiresVerification = byVerifier || byRole;

    if (requiresVerification) {
      try {
        // Сохраняем payload для будущего approve. Локально transition
        // в submitted (verification_status) — задача появится в очереди
        // у заведующей.
        await db
          .update(tasks)
          .set({ submittedValues: JSON.stringify(values ?? {}) })
          .where(eq(tasks.id, taskId));
        const submitted = byRole
          ? await storage.submitForVerification(taskId, { byRole: true })
          : await storage.submitForVerification(taskId);
        if (!submitted) {
          // Concurrent submit или статус не позволяет (approved/already
          // submitted). Возвращаем текущий стейт — клиент рефрешит UI.
          const fresh = await storage.getTask(taskId);
          return res.status(200).json({
            message: "Задача уже в очереди на проверку",
            task: fresh,
            verificationPending: true,
          });
        }
        safely(() => onTaskSubmitted(taskBeforeAny!, meId ?? null));
        publishToCompany(taskBeforeAny!.companyId, { type: "tasks", taskId });
        return res.status(200).json({
          message: byRole ? "Отправлено на проверку руководителю" : "Отправлено на проверку заведующей",
          verificationPending: true,
        });
      } catch (err) {
        console.error(
          "[wesetup-proxy] submit-for-verification failed",
          err,
        );
        return res.status(500).json({
          message: "Не удалось отправить на проверку",
        });
      }
    }

    const completeJournalLinkIntegrationId = getJournalLinkIntegrationId(
      taskBeforeAny?.journalLink
    );
    const completePayload = {
      taskId,
      isCompleted: desired,
      values: values ?? {},
      ...(completeJournalLinkIntegrationId
        ? { integrationId: completeJournalLinkIntegrationId }
        : {}),
    };
    const completeUrl = `${baseUrl}/api/integrations/tasksflow/complete`;
    try {
      // AbortSignal.timeout — Node 17.3+ built-in. Без таймаута:
      // если WeSetup hang'нется, Express handler ждёт до browser
      // timeout (~5min), все pool-connection'ы заняты — TasksFlow
      // встаёт колом для всех воркеров. /complete-with-values
      // вызывается КАЖДЫМ завершением journal-задачи, самый
      // критичный по UX. 30s достаточно для медленного WeSetup, но
      // не висит часами.
      const upstream = await fetch(completeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(completePayload),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const text = await upstream.text();
      // Local mirror logic. Атомарный переход + начисление баланса
      // если task.price > 0. Раньше `storage.updateTask({isCompleted})`
      // флипал статус БЕЗ начисления — журнальные bonus-задачи
      // выполнялись через /complete-with-values без зарплаты.
      // Кроме того без atomicity параллельные complete + complete-
      // with-values могли двойно зачислить (race), здесь
      // transitionTaskToCompleted закрывает обе дыры.
      const finishLocally = async (): Promise<void> => {
        const desired = Boolean(isCompleted ?? true);
        if (!desired) {
          // uncomplete-флоу: симметричный к complete атомарный
          // переход. Без него concurrent /uncomplete + /complete-
          // with-values{isCompleted:false} могли двойно дебетовать
          // воркера (оба видят isCompleted=true, оба вычитают).
          const transitioned = await storage.transitionTaskToUncompleted(taskId);
          if (!transitioned) return; // уже не completed — никакого debit'а
          const fresh = await storage.getTask(taskId);
          // 2026-05-09: skip reversal для sibling-claimed tasks —
          // balance был given to claimedByWorkerId, не workerId.
          if (
            fresh?.price &&
            fresh.price > 0 &&
            fresh.workerId &&
            fresh.claimedByWorkerId === null
          ) {
            await storage.updateUserBalance(fresh.workerId, -fresh.price);
          }
          return;
        }
        const transitioned = await storage.transitionTaskToCompleted(taskId);
        if (!transitioned) return; // уже выполнена — никакого double-pay
        const fresh = await storage.getTask(taskId);
        if (fresh?.price && fresh.price > 0 && fresh.workerId) {
          await storage.updateUserBalance(fresh.workerId, fresh.price);
        }
      };
      if (upstream.ok) {
        try {
          await finishLocally();
        } catch (err) {
          console.error("[wesetup-proxy] local complete mirror failed", err);
        }
      } else if (upstream.status >= 500 || upstream.status === 408 || upstream.status === 429) {
        // 5xx/408/429 — WeSetup временно недоступен. Кладём в очередь
        // чтобы worker дотащил данные сотрудника позже (см. P1#6).
        // Локально TF-task уже отметим выполненным, чтобы dashboard
        // обновился сразу — иначе сотрудник видит «не сохранено» и
        // тапает повторно, плодя дубли.
        try {
          await finishLocally();
        } catch {
          /* non-fatal */
        }
        try {
          const { attemptOrEnqueue } = await import("../webhook-queue");
          await attemptOrEnqueue({
            taskId,
            eventType: "complete",
            targetUrl: completeUrl,
            apiKey: key,
            payload: completePayload,
          });
        } catch (enqueueErr) {
          console.error(
            "[wesetup-proxy] failed to enqueue complete for retry",
            enqueueErr,
          );
        }
      }
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (err: any) {
      // Network error / timeout — упстрим лежит. Сохраняем delivery
      // в очередь, локально таск отмечаем как выполненный, и отдаём
      // юзеру 202 Accepted с пояснением.
      console.error("[wesetup-proxy] complete failed", err);
      try {
        // Тот же atomic+balance путь что в success/5xx ветках выше.
        const desired = Boolean(isCompleted ?? true);
        if (desired) {
          const transitioned = await storage.transitionTaskToCompleted(taskId);
          if (transitioned) {
            const fresh = await storage.getTask(taskId);
            if (fresh?.price && fresh.price > 0 && fresh.workerId) {
              await storage.updateUserBalance(fresh.workerId, fresh.price);
            }
          }
        }
      } catch {
        /* non-fatal */
      }
      try {
        const { attemptOrEnqueue } = await import("../webhook-queue");
        await attemptOrEnqueue({
          taskId,
          eventType: "complete",
          targetUrl: completeUrl,
          apiKey: key,
          payload: completePayload,
        });
        return res.status(202).json({
          message:
            "WeSetup временно недоступен. Задача сохранена локально, " +
            "данные досинхронизируются автоматически.",
          queued: true,
        });
      } catch (enqueueErr) {
        console.error(
          "[wesetup-proxy] failed to enqueue complete after network error",
          enqueueErr,
        );
        return res
          .status(502)
          .json({ message: normalizeWesetupNetworkError(err) });
      }
    }
  });

  // Прокси для bind-row: фронт CreateTask в журнальном режиме шлёт сюда
  // {documentId, rowKey, title?}. WeSetup создаёт задачу у себя через
  // свою же сохранённую интеграцию + регистрирует TaskLink, и возвращает
  // нам id уже созданной задачи. Мы не дублируем создание — ответ
  // содержит `tasksflowTaskId`, фронт просто рефрешит список.
  app.post("/api/wesetup/bind-row", requireAuth, requireAdmin, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    try {
      const upstream = await fetch(
        `${baseUrl}/api/integrations/tasksflow/bind-row`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req.body || {}),
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        }
      );
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json"
      );
      res.send(text);
    } catch (err: any) {
      console.error("[wesetup-proxy] bind-row failed", err);
      res.status(502).json({
        message: `Не удалось связать с журналом WeSetup: ${normalizeWesetupNetworkError(err)}`,
      });
    }
  });

  // ===================== WESETUP SYNC PROXIES =====================
  // Триггер-кнопки в /admin/integrations звонят сюда вместо WeSetup
  // напрямую: TF держит креды (wesetupBaseUrl + wesetupApiKey per
  // company), и сотруднику без доступа к админке WeSetup проще
  // дёрнуть синхронизацию из родного TF UI. Все четыре эндпоинта —
  // тонкие proxy: метод+тело форвардятся как есть, ответ возвращаем
  // без обработки. Логика — на стороне WeSetup.
  //
  // sync-users      WeSetup ↔ TF user mapping (двусторонне с P1#4)
  // sync-tasks      WeSetup pull выполненных задач из TF
  // sync-hierarchy  ManagerScope → managedWorkerIds на воркерах
  // bulk-assign-today  массово создать задачи на сегодня по журналам
  // links           таблица WeSetup↔TF user link (для просмотра)

  app.post("/api/wesetup/sync-users", requireAuth, requireAdmin, (req, res) =>
    proxyToWesetup(req, res, "/api/integrations/tasksflow/sync-users", "POST"),
  );
  app.post("/api/wesetup/sync-tasks", requireAuth, requireAdmin, (req, res) =>
    proxyToWesetup(req, res, "/api/integrations/tasksflow/sync-tasks", "POST"),
  );
  app.post(
    "/api/wesetup/sync-hierarchy",
    requireAuth,
    requireAdmin,
    (req, res) =>
      proxyToWesetup(req, res, "/api/integrations/tasksflow/sync-hierarchy", "POST"),
  );
  app.post(
    "/api/wesetup/bulk-assign-today",
    requireAuth,
    requireAdmin,
    (req, res) =>
      proxyToWesetup(
        req,
        res,
        "/api/integrations/tasksflow/bulk-assign-today",
        "POST",
      ),
  );
  app.get("/api/wesetup/links", requireAuth, requireAdmin, (req, res) =>
    proxyToWesetup(req, res, "/api/integrations/tasksflow/links", "GET"),
  );
}
