import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Статические файлы с хешами Vite (assets/*) — кэшируем на год immutable.
  // HTML — не кэшируем (новый bundle ссылается на новые хеши, старый html
  // надо обновлять). Иначе — стандартный 1y без immutable.
  app.use(express.static(distPath, {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      // Vite пишет хеши в base64url-варианте: index-Bh37p_Mr.js,
      // CompanySettings-QVmoLW9d.js, B_Y-k1I5.js. Старая регулярка
      // `\.[0-9a-f]{8,}\.(js|css)$` матчила только hex и пропускала
      // все реальные хеши Vite — assets отдавались без `immutable`,
      // браузер ревалидировал при каждом перезагрузе. Фикс: путь
      // внутри /assets/ ⇒ immutable (Vite туда складывает только
      // хешированные файлы).
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('.html')) {
        // HTML файлы - не кэшировать
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API endpoint not found" });
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
