import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  console.log("[Vite] Setting up Vite dev server...");
  
  const serverOptions = {
    middlewareMode: true,
    hmr: { 
      server,
    },
    allowedHosts: true as const,
    watch: {
      usePolling: false,
      interval: 100,
    },
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  console.log("[Vite] Vite dev server initialized");
  app.use(vite.middlewares);
  console.log("[Vite] Vite middleware mounted");

  // SSR публичных страниц (/, /blog...) ДО SPA-catch-all, чтобы лендинг
  // и блог рендерились на сервере, а не отдавались как SPA index.html.
  const { setupPublicSsrDev } = await import("./ssr");
  setupPublicSsrDev(app, vite);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Пропускаем API и uploads запросы - они обрабатываются раньше
    if (url.startsWith("/api") || url.startsWith("/uploads")) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
