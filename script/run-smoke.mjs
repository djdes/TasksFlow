// UI smoke без playwright-cli: поднимает script/preview-ui.mjs (без БД — API
// подменяют сами сценарии) и прогоняет script/smoke-*.js в задокументированном
// порядке, каждую группу в своей браузерной сессии.
// Нужна свежая сборка: npm run build && npm run smoke.
// PORT — порт превью (по умолчанию 5301); PLAYWRIGHT_CHROMIUM_PATH — свой chromium.
// Скриншоты сценариев: output/playwright/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5301;
const base = `http://127.0.0.1:${port}`;
const SCRIPT_TIMEOUT_MS = 4 * 60 * 1000;

// Порядок из CLAUDE.md: workspace идёт после smoke-motion в той же сессии,
// details и extra — после smoke-motion в другой.
const SESSIONS = [
  ['script/smoke-motion.js', 'script/smoke-workspace.js'],
  ['script/smoke-motion.js', 'script/smoke-motion-details.js', 'script/smoke-motion-extra.js'],
  // PIN-вход: свои контексты и фикстуры API, отдельная сессия.
  ['script/smoke-pin.js'],
  // История и отчёты, расписание дня.
  ['script/smoke-reports.js'],
  // Фото: сжатие, «только камера», очередь без сети.
  ['script/smoke-photo.js'],
  // Точки, тарифы, root «Компании».
  ['script/smoke-company.js'],
  // Демо-кабинет без сервера.
  ['script/smoke-demo.js'],
  // Приложение: манифест, /app, офлайн-страница, push на устройстве.
  ['script/smoke-pwa.js'],
  // Тариф и оплата: форма, Робокасса (подменена), возврат, автопродление, root «Цены».
  ['script/smoke-billing.js'],
];

// SMOKE_ONLY=billing — только сессии, где есть такой сценарий (для отладки).
const only = process.env.SMOKE_ONLY?.trim();
const RUN = only ? SESSIONS.filter((files) => files.some((f) => f.includes(only))) : SESSIONS;

process.chdir(root);
if (!fs.existsSync('dist/server/entry-server.js') || !fs.existsSync('dist/public/index.html')) {
  console.error('Нет сборки: сначала выполните npm run build');
  process.exit(1);
}
fs.mkdirSync('output/playwright', { recursive: true });

const preview = spawn(process.execPath, ['script/preview-ui.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let previewLog = '';
preview.stdout.on('data', (chunk) => { previewLog += chunk; });
preview.stderr.on('data', (chunk) => { previewLog += chunk; });
const stopPreview = () => { if (preview.exitCode === null) preview.kill('SIGTERM'); };
process.on('exit', stopPreview);

async function waitForPreview() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Превью завершилось с кодом ${preview.exitCode}:\n${previewLog}`);
    try {
      const response = await fetch(`${base}/login`);
      if (response.ok) return;
    } catch { /* ещё не слушает */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Превью не ответило за 20 с:\n${previewLog}`);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: таймаут ${ms / 1000} с`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let failed = 0;
let browser;
try {
  await waitForPreview();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  browser = await chromium.launch({ executablePath });
  for (const [index, scripts] of RUN.entries()) {
    console.log(`— сессия ${index + 1}: ${scripts.map((s) => path.basename(s)).join(' → ')}`);
    // Service worker перехватывал бы навигации и ассеты мимо page.route —
    // его проверяет smoke-pwa.js в своём контексте.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(`${base}/dashboard`);
    for (const file of scripts) {
      const started = Date.now();
      // Сценарии — выражение `async (page) => {...}`, как для playwright-cli run-code.
      const run = (0, eval)(fs.readFileSync(file, 'utf8'));
      try {
        const result = await withTimeout(run(page), SCRIPT_TIMEOUT_MS, file);
        const summary = JSON.stringify(result ?? null);
        console.log(`PASS ${file} ${Date.now() - started}ms ${summary.length > 300 ? `${summary.slice(0, 300)}…` : summary}`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`FAIL ${file} ${Date.now() - started}ms ${message.split('\n').slice(0, 8).join(' | ')}`);
      }
    }
    await context.close();
  }
} catch (error) {
  failed += 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  await browser?.close().catch(() => {});
  stopPreview();
}

console.log(failed ? `Smoke: упало ${failed}` : 'Smoke: всё прошло');
process.exit(failed ? 1 : 0);
