// Фото задачи, пункты чек-листа и пример фото.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { resolveUploadAbs } from "../uploads-paths";
import { itemNeedsPhoto } from "@shared/checklist";
import { isTaskServiceError } from "../services/task-actor";
import {
  attachTaskPhoto,
  attachChecklistItemPhoto,
  setChecklistItemDone,
  setChecklistItemAnswer,
} from "../services/task-photo";
import {
  upload,
  requireAuth,
  requireTaskManager,
  canEditTaskOf,
  actorFromReq,
  canActOnTask,
  getCompanyIdFromReq,
} from "./common";

export function registerTaskPhotoRoutes(app: Express): void {
  // Загрузка фото для задачи (поддержка до 10 фотографий)
  app.post("/api/tasks/:id/photo", requireAuth, (req, res, next) => {
    // Устанавливаем заголовок Content-Type для JSON ответов
    res.setHeader('Content-Type', 'application/json');

    upload.single("photo")(req, res, async (err: any) => {
      // needCleanup — флаг «файл успешно сохранён multer'ом, но мы НЕ
      // дописали его в БД». finally-блок снесёт orphan. Сбрасываем в
      // false только когда photoUrls записан в task.
      let needCleanup = false;
      try {
        if (err) {
          // Ошибки multer (например, неверный тип файла / размер) —
          // multer fileFilter rejects до сохранения, файла на диске нет.
          console.error("Multer upload error:", err);
          return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Файл не загружен" });
        }
        // С этого момента файл лежит на диске — нужен cleanup при early-return.
        needCleanup = true;

        const result = await attachTaskPhoto({
          taskId: Number(req.params.id),
          photoUrl: `/uploads/${req.file.filename}`,
          actor: actorFromReq(req),
        });

        // UPDATE успешен — файл теперь принадлежит БД, cleanup НЕ нужен.
        needCleanup = false;
        return res.json({
          photoUrl: result.photoUrl,
          photoUrls: result.photoUrls,
        });
      } catch (uploadErr: any) {
        if (isTaskServiceError(uploadErr)) {
          return res.status(uploadErr.status).json({ message: uploadErr.message });
        }
        console.error("Error uploading photo:", uploadErr);
        return res.status(500).json({ message: "Ошибка загрузки фото", error: uploadErr.message });
      } finally {
        if (needCleanup && req.file) {
          const abs = resolveUploadAbs(req.file.filename);
          if (abs) {
            const { unlink } = await import("fs/promises");
            await unlink(abs).catch(() => null);
          }
        }
      }
    });
  });

  // ===== Чек-лист (подзадачи): фото на пункт =====
  // Загрузка фото к пункту чек-листа → пункт помечается выполненным.
  // Пункт с фото (requiresPhoto нет или true) иначе не закрыть; пункт без
  // фото отмечается касанием — POST /api/tasks/:id/checklist/:itemId/done.
  app.post("/api/tasks/:id/checklist/:itemId/photo", requireAuth, (req, res) => {
    res.setHeader("Content-Type", "application/json");
    upload.single("photo")(req, res, async (err: any) => {
      let needCleanup = false;
      try {
        if (err) return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        if (!req.file) return res.status(400).json({ message: "Файл не загружен" });
        needCleanup = true;

        const result = await attachChecklistItemPhoto({
          taskId: Number(req.params.id),
          itemId: String(req.params.itemId),
          photoUrl: `/uploads/${req.file.filename}`,
          actor: actorFromReq(req),
        });

        needCleanup = false;
        return res.json({ photoUrl: result.photoUrl, task: result.task });
      } catch (uploadErr: any) {
        if (isTaskServiceError(uploadErr)) {
          return res.status(uploadErr.status).json({ message: uploadErr.message });
        }
        console.error("Error uploading checklist photo:", uploadErr);
        return res.status(500).json({ message: "Ошибка загрузки фото", error: uploadErr.message });
      } finally {
        if (needCleanup && req.file) {
          const abs = resolveUploadAbs(req.file.filename);
          if (abs) {
            const { unlink } = await import("fs/promises");
            await unlink(abs).catch(() => null);
          }
        }
      }
    });
  });

  // Пункт без фото (requiresPhoto: false): отметить касанием или снять отметку.
  app.post("/api/tasks/:id/checklist/:itemId/done", requireAuth, async (req, res) => {
    const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Нужно поле done: true или false", field: "done" });
    }
    try {
      const { task } = await setChecklistItemDone({
        taskId: Number(req.params.id),
        itemId: String(req.params.itemId),
        done: parsed.data.done,
        actor: actorFromReq(req),
      });
      return res.json({ task });
    } catch (e: any) {
      if (isTaskServiceError(e)) {
        return res.status(e.status).json({ message: e.message });
      }
      console.error("Error marking checklist item:", e);
      return res.status(500).json({ message: "Не удалось отметить пункт" });
    }
  });

  // Свой вопрос задачи: выбрать ответ из вариантов (null — убрать ответ).
  app.post("/api/tasks/:id/checklist/:itemId/answer", requireAuth, async (req, res) => {
    const parsed = z.object({ answer: z.string().trim().min(1).max(100).nullable() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Нужно поле answer: один из вариантов ответа или null", field: "answer" });
    }
    try {
      const { task } = await setChecklistItemAnswer({
        taskId: Number(req.params.id),
        itemId: String(req.params.itemId),
        answer: parsed.data.answer,
        actor: actorFromReq(req),
      });
      return res.json({ task });
    } catch (e: any) {
      if (isTaskServiceError(e)) {
        return res.status(e.status).json({ message: e.message });
      }
      console.error("Error answering checklist question:", e);
      return res.status(500).json({ message: "Не удалось сохранить ответ" });
    }
  });

  // Убрать фото у пункта чек-листа (переснять) → у пункта с фото, если фото
  // не осталось, пункт снова не выполнен; у пункта без фото отметка остаётся.
  app.delete("/api/tasks/:id/checklist/:itemId/photo", requireAuth, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Задача не найдена" });

      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && task.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const isAllowed = await canActOnTask(currentUser, task);
      if (!isAllowed) return res.status(403).json({ message: "Вы не являетесь исполнителем этой задачи" });

      const url = typeof req.query.url === "string" ? req.query.url : "";
      const checklist = task.checklist || [];
      const idx = checklist.findIndex((it) => it.id === req.params.itemId);
      if (idx === -1) return res.status(404).json({ message: "Пункт чек-листа не найден" });

      const remaining = (checklist[idx].photoUrls || []).filter((u) => u !== url);
      const newChecklist = checklist.map((it, i) =>
        i === idx
          ? { ...it, photoUrls: remaining, done: itemNeedsPhoto(it) ? remaining.length > 0 : Boolean(it.done) }
          : it,
      );
      const updatedTask = await storage.updateTask(taskId, { checklist: newChecklist });

      // Удаляем сам файл с диска (best-effort).
      const abs = resolveUploadAbs(url.replace(/^\/uploads\//, ""));
      if (abs) {
        const { unlink } = await import("fs/promises");
        await unlink(abs).catch(() => null);
      }
      return res.json({ task: updatedTask });
    } catch (e: any) {
      console.error("Error deleting checklist photo:", e);
      return res.status(500).json({ message: "Ошибка удаления фото" });
    }
  });

  // Загрузка примера фото для задачи (только админ)
  app.post("/api/tasks/:id/example-photo", requireAuth, requireTaskManager, (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');

    upload.single("photo")(req, res, async (err: any) => {
      // см. комментарий к needCleanup в /api/tasks/:id/photo выше.
      let needCleanup = false;
      try {
        if (err) {
          console.error("Multer upload error:", err);
          return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Файл не загружен" });
        }
        needCleanup = true;

        const taskId = Number(req.params.id);
        const task = await storage.getTask(taskId);
        if (!task) {
          return res.status(404).json({ message: "Задача не найдена" });
        }

        // Multi-tenant scope: админ другой компании не должен загружать.
        const adminCompanyId = await getCompanyIdFromReq(req);
        if (adminCompanyId !== null && task.companyId !== adminCompanyId) {
          return res.status(404).json({ message: "Задача не найдена" });
        }
        if (!(await canEditTaskOf(req, task))) {
          return res.status(403).json({ message: "Можно менять только задачи своих подчинённых" });
        }

        // Если у задачи уже был example-photo — удаляем старый файл с
        // диска, чтобы не плодить orphan-файлы. Раньше: каждая
        // переустановка example-photo оставляла старый файл навсегда,
        // /uploads/ распухал на десятки тысяч orphan-ов и в конце
        // концов забивал diskspace.
        const previousExampleUrl = task.examplePhotoUrl;

        const examplePhotoUrl = `/uploads/${req.file.filename}`;
        const updatedTask = await storage.updateTask(taskId, { examplePhotoUrl });

        if (!updatedTask) {
          return res.status(500).json({ message: "Ошибка обновления задачи" });
        }

        // UPDATE успешен — новый файл принадлежит БД.
        needCleanup = false;

        // Best-effort cleanup ПРЕДЫДУЩЕГО example-photo только после
        // успешного UPDATE — иначе получим status update fail +
        // потерянный example.
        if (previousExampleUrl && previousExampleUrl !== examplePhotoUrl) {
          try {
            const abs = resolveUploadAbs(previousExampleUrl);
            if (abs) {
              const { unlink } = await import("fs/promises");
              await unlink(abs).catch(() => null);
            }
          } catch (cleanupErr) {
            console.warn("[example-photo] orphan cleanup failed", cleanupErr);
          }
        }

        return res.json({ examplePhotoUrl: updatedTask.examplePhotoUrl });
      } catch (uploadErr: any) {
        console.error("Error uploading example photo:", uploadErr);
        return res.status(500).json({ message: "Ошибка загрузки фото", error: uploadErr.message });
      } finally {
        if (needCleanup && req.file) {
          const abs = resolveUploadAbs(req.file.filename);
          if (abs) {
            const { unlink } = await import("fs/promises");
            await unlink(abs).catch(() => null);
          }
        }
      }
    });
  });

  // Удаление примера фото задачи (только админ)
  app.delete("/api/tasks/:id/example-photo", requireAuth, requireTaskManager, async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Multi-tenant scope: админ другой компании не должен трогать.
      const adminCompanyId = await getCompanyIdFromReq(req);
      if (adminCompanyId !== null && task.companyId !== adminCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      if (!(await canEditTaskOf(req, task))) {
        return res.status(403).json({ message: "Можно менять только задачи своих подчинённых" });
      }

      if (!task.examplePhotoUrl) {
        return res.status(400).json({ message: "У задачи нет примера фото" });
      }

      // Удаляем файл с диска через resolveUploadAbs (защита от path traversal
      // через basename + защита от абсолютного photoUrl, см. uploads-paths.ts).
      const { unlink } = await import("fs/promises");
      const photoPath = resolveUploadAbs(task.examplePhotoUrl);
      if (!photoPath) {
        console.warn("Refusing to delete file outside uploads/:", task.examplePhotoUrl);
      } else {
        try {
          await unlink(photoPath);
        } catch (unlinkErr: any) {
          console.error("Error deleting example photo file:", unlinkErr);
        }
      }

      const updatedTask = await storage.updateTask(taskId, { examplePhotoUrl: null });
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting example photo:", err);
      res.status(500).json({ message: "Ошибка удаления примера фото" });
    }
  });

  // Удаление конкретного фото задачи по URL
  app.delete("/api/tasks/:id/photo", requireAuth, async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const taskId = Number(req.params.id);
      const photoUrlToDelete = req.query.url as string; // URL фото для удаления

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Multi-tenant scope: задача должна принадлежать компании текущего юзера.
      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && task.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Проверяем права: исполнитель, админ или роль «Ставит задачи»
      const isAllowed = await canActOnTask(currentUser, task);
      if (!isAllowed) {
        return res.status(403).json({ message: "Нет прав для удаления фото" });
      }

      const currentPhotos: string[] = (task as any).photoUrls || [];

      // Helper: безопасное удаление файла только внутри uploads/.
      const safeUnlink = async (relPath: string) => {
        const abs = resolveUploadAbs(relPath);
        if (!abs) {
          console.warn("Refusing to delete outside uploads/:", relPath);
          return;
        }
        const { unlink } = await import("fs/promises");
        try { await unlink(abs); } catch (e: any) { console.error("unlink:", e?.message); }
      };

      // Если передан конкретный URL, удаляем только его
      if (photoUrlToDelete) {
        if (!currentPhotos.includes(photoUrlToDelete)) {
          return res.status(400).json({ message: "Фото не найдено" });
        }

        await safeUnlink(photoUrlToDelete);

        // Обновляем массив фото
        const newPhotoUrls = currentPhotos.filter(url => url !== photoUrlToDelete);
        const lastPhotoUrl = newPhotoUrls.length > 0 ? newPhotoUrls[newPhotoUrls.length - 1] : null;

        const updatedTask = await storage.updateTask(taskId, {
          photoUrls: newPhotoUrls.length > 0 ? newPhotoUrls : null,
          photoUrl: lastPhotoUrl
        });

        if (!updatedTask) {
          return res.status(500).json({ message: "Ошибка обновления задачи" });
        }

        return res.json({
          success: true,
          photoUrls: (updatedTask as any).photoUrls || []
        });
      }

      // Если URL не передан, удаляем все фото (старое поведение)
      if (currentPhotos.length === 0 && !task.photoUrl) {
        return res.status(400).json({ message: "У задачи нет фото" });
      }

      // Удаляем все файлы с диска
      for (const photoUrl of currentPhotos) {
        await safeUnlink(photoUrl);
      }

      // Также удаляем старый photoUrl если он есть и не в массиве
      if (task.photoUrl && !currentPhotos.includes(task.photoUrl)) {
        await safeUnlink(task.photoUrl);
      }

      // Обновляем задачу, убирая все фото
      const updatedTask = await storage.updateTask(taskId, {
        photoUrls: null,
        photoUrl: null
      });
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      res.json({ success: true, photoUrls: [] });
    } catch (err: any) {
      console.error("Error deleting photo:", err);
      res.status(500).json({ message: "Ошибка удаления фото" });
    }
  });
}
