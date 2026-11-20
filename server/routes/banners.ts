// Баннеры: публичный список (из JSON-снимка без SQL) и управление ими у root.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { bannerInputSchema } from "@shared/schema";
import { requireRoot } from "./common";
import {
  getPromoCacheStatus,
  getPublicBannersForPlacement,
  refreshAllPromoDatasets,
  refreshPromoDatasetSafe,
} from "../promo-cache/datasets";

export function registerBannerRoutes(app: Express): void {
  // ===================== БАННЕРЫ =====================
  // Публичный список активных баннеров под место показа. Без авторизации —
  // читает дисковый снимок public-banners.json и фильтрует окно startsAt..endsAt в памяти (0 SELECT).
  app.get("/api/banners", async (req, res) => {
    try {
      const placement = req.query.placement === "content" ? "content" : "top";
      const list = await getPublicBannersForPlacement(placement);
      res.set("Cache-Control", "public, max-age=60").json(list);
    } catch (err) {
      console.error("[banners] не удалось получить активные баннеры", err);
      res.status(500).json({ message: "Не удалось получить баннеры" });
    }
  });

  // Управление баннерами — только root. Каждая запись атомарно обновляет public-banners.json.
  app.get("/api/admin/banners", requireRoot, async (_req, res) => {
    res.json(await storage.listAllBanners());
  });

  app.post("/api/admin/banners", requireRoot, async (req, res) => {
    const parsed = bannerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные баннера", errors: parsed.error.flatten() });
    }
    const created = await storage.createBanner(parsed.data);
    await refreshPromoDatasetSafe("public-banners");
    res.status(201).json(created);
  });

  app.patch("/api/admin/banners/:id", requireRoot, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Некорректный id" });
    const parsed = bannerInputSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные баннера", errors: parsed.error.flatten() });
    }
    const updated = await storage.updateBanner(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Баннер не найден" });
    await refreshPromoDatasetSafe("public-banners");
    res.json(updated);
  });

  app.delete("/api/admin/banners/:id", requireRoot, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Некорректный id" });
    await storage.deleteBanner(id);
    await refreshPromoDatasetSafe("public-banners");
    res.json({ ok: true });
  });

  // Диагностика и ручная пересборка JSON-кэша промо-страниц (только root).
  app.get("/api/root/promo-cache/status", requireRoot, (_req, res) => {
    res.set("Cache-Control", "no-store").json(getPromoCacheStatus());
  });

  app.post("/api/root/promo-cache/refresh", requireRoot, async (_req, res) => {
    try {
      const status = await refreshAllPromoDatasets();
      res.set("Cache-Control", "no-store").json({ ok: true, ...status });
    } catch (err) {
      console.error("[promo-cache] ручное обновление не прошло", err);
      res.status(500).json({ message: "Не удалось пересобрать кэш промо-страниц" });
    }
  });
}
