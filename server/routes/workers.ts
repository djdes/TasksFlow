// Старый API /api/workers (людей ведёт /api/users).
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { requireAuth, requireAdmin, requireAuthOrApiKey, getCompanyIdFromReq } from "./common";

export function registerWorkerRoutes(app: Express): void {
  // Workers
  app.get(api.workers.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании. Раньше: companyId ?? undefined →
      // storage.getWorkers(undefined) возвращал ВСЕХ воркеров из
      // ВСЕХ компаний. Edge case: юзер залогинен, потом удалён
      // админом — session ещё валидна, но getCompanyIdFromReq
      // возвращает null → leak всей БД воркеров.
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.json([]);
      }
      const workers = await storage.getWorkers(companyId);
      res.json(workers);
    } catch (err: any) {
      console.error('Error fetching workers:', err);
      res.status(500).json({ message: 'Ошибка загрузки сотрудников' });
    }
  });

  app.get(api.workers.get.path, requireAuthOrApiKey, async (req, res) => {
    try {
      const worker = await storage.getWorker(Number(req.params.id));
      if (!worker) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && worker.companyId !== companyId) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      res.json(worker);
    } catch (err: any) {
      console.error('Error fetching worker:', err);
      res.status(500).json({ message: 'Ошибка' });
    }
  });

  app.post(api.workers.create.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.workers.create.input.parse(req.body);
      // Добавляем companyId текущего пользователя
      const user = await storage.getUserById(req.session.userId!);
      const worker = await storage.createWorker({
        ...input,
        companyId: user?.companyId ?? undefined,
      });
      res.status(201).json(worker);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error creating worker:', err);
      res.status(500).json({ message: 'Ошибка создания сотрудника' });
    }
  });

  app.put(api.workers.update.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.workers.update.input.parse(req.body);
      // Multi-tenant scope: только сотрудники своей компании.
      const existing = await storage.getWorker(Number(req.params.id));
      if (!existing) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && existing.companyId !== companyId) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      const worker = await storage.updateWorker(Number(req.params.id), input);
      if (!worker) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      res.json(worker);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error updating worker:', err);
      res.status(500).json({ message: 'Ошибка обновления' });
    }
  });

  app.delete(api.workers.delete.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      // Multi-tenant scope: только сотрудники своей компании.
      const existing = await storage.getWorker(Number(req.params.id));
      if (!existing) {
        return res.status(204).send();
      }
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && existing.companyId !== companyId) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      await storage.deleteWorker(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      console.error('Error deleting worker:', err);
      res.status(500).json({ message: 'Ошибка удаления' });
    }
  });
}
