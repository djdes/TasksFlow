// API-ключи tfk_: выпуск, отзыв, показ, перевыпуск и мост ключа в WeSetup.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { z } from "zod";
import { generateApiKey, hashApiKey } from "../api-keys";
import { encryptApiKey, decryptApiKey, isApiKeyRevealEnabled } from "../api-key-crypto";
import { requireAuth, requireAdmin, getCompanyIdFromReq } from "./common";

export function registerApiKeyRoutes(app: Express): void {
  // ===================== API KEYS =====================

  app.get("/api/api-keys", requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const rows = await storage.listApiKeysByCompany(companyId);
      const revealEnabled = isApiKeyRevealEnabled();
      const sanitized = rows.map(r => ({
        id: r.id,
        name: r.name,
        keyPrefix: r.keyPrefix,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt ?? 0,
        revokedAt: r.revokedAt ?? 0,
        // Можно ли «открыть и посмотреть» plaintext через reveal-endpoint.
        // Старые ключи (созданные до миграции) keyEncrypted=NULL — для них
        // только rotate. Новые ключи — true если env API_KEY_REVEAL_SECRET
        // задан в момент создания.
        revealable: revealEnabled && Boolean(r.keyEncrypted),
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("[api-keys] list failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/api-keys", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({ name: z.string().trim().min(1).max(100) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Название обязательно (1-100 символов)" });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId || !req.session?.userId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const activeCount = await storage.countActiveApiKeysByCompany(companyId);
      if (activeCount >= 50) {
        return res.status(400).json({ message: "Достигнут лимит активных ключей (50)" });
      }
      const plaintext = generateApiKey();
      const keyHash = hashApiKey(plaintext);
      const keyPrefix = plaintext.slice(0, 12);
      // Если env API_KEY_REVEAL_SECRET задан — шифруем plaintext и
      // сохраняем рядом с hash'ем, чтобы потом можно было «открыть и
      // посмотреть» через /api/api-keys/:id/reveal. Без env — старое
      // поведение (только hash, plaintext одноразовый).
      let keyEncrypted: string | null = null;
      if (isApiKeyRevealEnabled()) {
        try {
          keyEncrypted = encryptApiKey(plaintext);
        } catch (encErr) {
          console.error("[api-keys] encrypt failed", encErr);
          // Не валим запрос — пусть ключ создастся как раньше, без reveal.
        }
      }
      const created = await storage.createApiKey({
        name: parsed.data.name,
        keyHash,
        keyPrefix,
        keyEncrypted,
        companyId,
        createdByUserId: req.session.userId,
      });

      // Auto-bridge: пересчитываем company.wesetupApiKey на самый
      // свежий активный encrypted ключ. Раньше заполнялось только
      // первый раз — после ротации старый plaintext в company.
      // wesetupApiKey протухал и интеграция тихо ломалась. Теперь
      // single source of truth: api_keys (с encryption) → company.
      await syncCompanyWesetupBridge(companyId).catch((err) => {
        console.warn("[api-keys] bridge sync failed (non-fatal)", err);
      });

      res.json({
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        createdAt: created.createdAt,
        secret: plaintext,
      });
    } catch (err) {
      console.error("[api-keys] create failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/api-keys/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Неверный id" });
      }
      const companyId = await getCompanyIdFromReq(req);
      const record = await storage.getApiKeyById(id);
      if (!record || record.companyId !== companyId) {
        return res.status(404).json({ message: "Ключ не найден" });
      }
      if (record.revokedAt && record.revokedAt > 0) {
        return res.json({ ok: true, already: true });
      }
      await storage.revokeApiKey(id);
      // После revoke может пропасть текущий bridge — пересчитываем,
      // чтобы interactive integration не сломалась тихо.
      if (companyId) {
        await syncCompanyWesetupBridge(companyId).catch(() => null);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[api-keys] revoke failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /**
   * POST /api/api-keys/:id/reveal — расшифровать и вернуть plaintext.
   * Требует admin сессии. Доступно только если ключ был создан после
   * миграции add-api-key-encrypted И env API_KEY_REVEAL_SECRET задан.
   * Для старых ключей возвращаем 410 Gone с инструкцией про rotate.
   */
  // Rate-limit на reveal-эндпоинт: даже у админа есть лимит на
  // распаковку plaintext-ключей (защита от случайной утечки сессии
  // — атакующий не сможет дёрнуть reveal на каждом id за минуту).
  const revealLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // 10 reveal'ов на 15 мин на IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message:
        "Слишком много попыток открыть ключ за последние 15 минут. Подождите.",
    },
    validate: false as never,
  });
  app.use("/api/api-keys/:id/reveal", revealLimiter);

  app.post("/api/api-keys/:id/reveal", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Неверный id" });
      }
      const companyId = await getCompanyIdFromReq(req);
      const record = await storage.getApiKeyById(id);
      if (!record || record.companyId !== companyId) {
        return res.status(404).json({ message: "Ключ не найден" });
      }
      if (record.revokedAt && record.revokedAt > 0) {
        return res
          .status(410)
          .json({ message: "Ключ отозван — посмотреть нельзя." });
      }
      if (!record.keyEncrypted) {
        return res.status(410).json({
          message:
            "Этот ключ создан до включения функции «Показать». " +
            "Нажмите «Перевыпустить» чтобы получить новый plaintext.",
          rotateAvailable: true,
        });
      }
      if (!isApiKeyRevealEnabled()) {
        return res.status(503).json({
          message:
            "API_KEY_REVEAL_SECRET не задан в env. " +
            "Без него расшифровать ключ невозможно.",
        });
      }
      let plaintext: string;
      try {
        plaintext = decryptApiKey(record.keyEncrypted);
      } catch (err) {
        console.error("[api-keys] reveal decrypt failed", err);
        return res.status(500).json({
          message:
            "Не удалось расшифровать ключ. Возможно, изменился " +
            "API_KEY_REVEAL_SECRET — перевыпустите ключ.",
        });
      }
      // Sanity-check: первые 12 символов plaintext должны совпасть с
      // keyPrefix. Если нет — БД покрашена, не отдаём ничего.
      if (plaintext.slice(0, 12) !== record.keyPrefix) {
        console.error(
          `[api-keys] reveal mismatch id=${id} prefix=${record.keyPrefix}`,
        );
        return res
          .status(500)
          .json({ message: "Целостность ключа нарушена. Перевыпустите." });
      }
      res.json({
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        secret: plaintext,
      });
    } catch (err) {
      console.error("[api-keys] reveal failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /**
   * POST /api/api-keys/:id/rotate — отозвать старый и создать новый
   * с тем же name. Возвращает новый plaintext (и encrypted если
   * reveal включён). Удобно для ключей, которые нельзя «посмотреть»
   * (создавались до миграции), а также для штатной ротации.
   */
  app.post("/api/api-keys/:id/rotate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Неверный id" });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId || !req.session?.userId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const old = await storage.getApiKeyById(id);
      if (!old || old.companyId !== companyId) {
        return res.status(404).json({ message: "Ключ не найден" });
      }
      // Revoke старый (если ещё активен), чтобы не было двух одинаковых
      // имён в листинге.
      if (!old.revokedAt || old.revokedAt === 0) {
        await storage.revokeApiKey(id);
      }
      const plaintext = generateApiKey();
      const keyHash = hashApiKey(plaintext);
      const keyPrefix = plaintext.slice(0, 12);
      let keyEncrypted: string | null = null;
      if (isApiKeyRevealEnabled()) {
        try {
          keyEncrypted = encryptApiKey(plaintext);
        } catch (encErr) {
          console.error("[api-keys] encrypt during rotate failed", encErr);
        }
      }
      const created = await storage.createApiKey({
        name: old.name,
        keyHash,
        keyPrefix,
        keyEncrypted,
        companyId,
        createdByUserId: req.session.userId,
      });
      // Если ротировали bridge-ключ, переключим company.wesetupApiKey
      // на свежий plaintext автоматически. Иначе integration сломается
      // в момент следующего proxy-вызова (старый ключ revoked).
      await syncCompanyWesetupBridge(companyId).catch(() => null);
      res.json({
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        createdAt: created.createdAt,
        secret: plaintext,
        rotatedFromId: old.id,
      });
    } catch (err) {
      console.error("[api-keys] rotate failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /**
   * Single source of truth: companies.wesetup_api_key/base_url
   * пересчитываются после любого create/rotate/revoke. Берём самый
   * свежий активный ключ с keyEncrypted (raw plaintext), расшифровываем
   * и пишем в company. Старые ключи без keyEncrypted (до миграции
   * add-api-key-encrypted) пропускаем — для них bridge нельзя
   * восстановить, надо вручную rotate.
   *
   * Если ни одного encrypted ключа не осталось — НЕ затираем
   * существующий company.wesetupApiKey. Это страховка для legacy
   * случаев когда юзер вписал tfk_… вручную ещё до миграции.
   */
  async function syncCompanyWesetupBridge(companyId: number): Promise<void> {
    const company = await storage.getCompanyById(companyId);
    if (!company) return;

    const keys = await storage.listApiKeysByCompany(companyId);
    const candidates = keys
      .filter((k) => (!k.revokedAt || k.revokedAt === 0) && k.keyEncrypted)
      .sort((a, b) => b.createdAt - a.createdAt);
    const top = candidates[0];

    if (!top || !top.keyEncrypted) {
      // Нечего подставлять. Дополнительно проверяем что текущий
      // wesetupApiKey ХОТЯ БЫ соответствует какому-то активному
      // hash'у. Если нет — обнуляем bridge: иначе WeSetup продолжит
      // дёргать TF с отозванным ключом и получать тихие 401.
      const activeKeys = keys.filter(
        (k) => !k.revokedAt || k.revokedAt === 0
      );
      if (company.wesetupApiKey) {
        const matchesActive = activeKeys.some(
          (k) => k.keyHash === hashApiKey(company.wesetupApiKey as string)
        );
        if (!matchesActive) {
          await storage.updateCompany(companyId, {
            wesetupApiKey: null,
            wesetupBaseUrl: company.wesetupBaseUrl,
          });
        }
      }
      return;
    }

    let plaintext: string;
    try {
      plaintext = decryptApiKey(top.keyEncrypted);
    } catch (err) {
      console.warn("[bridge-sync] decrypt failed for key id=%s", top.id, err);
      return;
    }
    if (
      company.wesetupApiKey === plaintext &&
      company.wesetupBaseUrl &&
      company.wesetupBaseUrl.length > 0
    ) {
      return;
    }
    await storage.updateCompany(companyId, {
      wesetupApiKey: plaintext,
      wesetupBaseUrl: company.wesetupBaseUrl ?? "https://wesetup.ru",
    });
  }
}
