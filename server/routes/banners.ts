// Баннеры: публичный список и управление ими у root.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { bannerInputSchema } from "@shared/schema";
import { requireRoot } from "./common";

export function registerBannerRoutes(app: Express): void {
  // ===================== БАННЕРЫ =====================
  // Публичный список активных баннеров под место показа. Без авторизации —
  // используется публичными страницами (полоса сверху + блок в контенте).
  app.get("/api/banners", async (req, res) => {
    try {
      const placement = req.query.placement === "content" ? "content" : "top";
      const list = await storage.listActiveBanners(placement);
      res.json(list);
    } catch (err) {
      console.error("[banners] не удалось получить активные баннеры", err);
      res.status(500).json({ message: "Не удалось получить баннеры" });
    }
  });

  // Управление баннерами — только root.
  app.get("/api/admin/banners", requireRoot, async (_req, res) => {
    res.json(await storage.listAllBanners());
  });

  app.post("/api/admin/banners", requireRoot, async (req, res) => {
    const parsed = bannerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные баннера", errors: parsed.error.flatten() });
    }
    const created = await storage.createBanner(parsed.data);
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
    res.json(updated);
  });

  app.delete("/api/admin/banners/:id", requireRoot, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Некорректный id" });
    await storage.deleteBanner(id);
    res.json({ ok: true });
  });
}
