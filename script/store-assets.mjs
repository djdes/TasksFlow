// Скриншоты для магазинов приложений из демо-кабинета и баннер Google Play.
//   npm run build && node script/store-assets.mjs
// Поднимает script/preview-ui.mjs (без БД: демо отвечает из памяти браузера)
// и снимает одни и те же экраны в размерах, которые требуют магазины:
//   android  1080×2160 — Google Play и RuStore (телефон);
//   ios-6.9  1320×2868 — App Store, iPhone 6,9″ (обязательный размер);
//   ipad-13  2064×2752 — App Store, iPad 13″.
// Результат — mobile/store/screenshots/<устройство>/NN-экран.jpg и
// mobile/store/android/feature-graphic.jpg. Полоса «Демо» скрыта.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5321;
const base = `http://127.0.0.1:${port}`;
const out = path.join(root, 'mobile/store');

const DEVICES = [
  { name: 'android', viewport: { width: 360, height: 720 }, scale: 3, mobile: true },
  { name: 'ios-6.9', viewport: { width: 440, height: 956 }, scale: 3, mobile: true },
  { name: 'ipad-13', viewport: { width: 1032, height: 1376 }, scale: 2, mobile: false },
];

// Что снимаем: роль демо, адрес и что сделать перед снимком.
const SCREENS = [
  { file: '01-tasks', role: 'worker', path: '/dashboard', ready: (p) => p.locator('.task-card').first().waitFor() },
  {
    file: '02-task-photo',
    role: 'worker',
    path: '/dashboard',
    ready: async (p) => {
      await p.locator('.task-card').first().waitFor();
      await p.locator('.task-card').first().click();
      await p.getByRole('dialog').waitFor();
    },
  },
  { file: '03-shift', role: 'admin', path: '/dashboard', ready: (p) => p.locator('.shift-summary').first().waitFor() },
  {
    // Вчерашний журнал всегда полный: кто что сделал и фото (очередь проверки в демо зависит от часа).
    file: '04-journal',
    role: 'admin',
    path: '/reports',
    ready: async (p) => {
      await p.getByRole('heading', { name: 'Сегодня' }).waitFor();
      await p.getByRole('button', { name: 'Предыдущий день' }).click();
      await p.getByRole('heading', { name: 'Вчера' }).waitFor();
      await p.locator('.reports-item img').first().waitFor();
    },
  },
  {
    file: '05-reports',
    role: 'admin',
    path: '/reports',
    ready: async (p) => {
      await p.getByRole('tab', { name: 'Сводка' }).click();
      await p.getByText('По дням', { exact: true }).waitFor();
    },
  },
];

const preview = spawn(process.execPath, ['script/preview-ui.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
process.on('exit', () => preview.kill());
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`${base}/login`)).ok) break;
  } catch {
    // ещё стартует
  }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
for (const device of DEVICES) {
  const dir = path.join(out, 'screenshots', device.name);
  fs.mkdirSync(dir, { recursive: true });
  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: device.scale,
      isMobile: device.mobile,
      hasTouch: device.mobile,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    await context.addInitScript((role) => {
      localStorage.setItem('tf_onboarded_v1', 'true');
      sessionStorage.setItem('tf_demo_role', role);
    }, screen.role);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`${base}/demo`);
    await page.waitForURL('**/dashboard');
    if (screen.path !== '/dashboard') await page.goto(`${base}${screen.path}`);
    await page.addStyleTag({ content: '.demo-bar, .help-fab { display: none !important; }' });
    await screen.ready(page);
    await page.waitForTimeout(500);
    const file = path.join(dir, `${screen.file}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`jpg  ${path.relative(root, file)}`);
    await context.close();
  }
}

// Баннер Google Play 1024×500: без альфа-канала, поэтому JPEG.
const fonts = path.join(root, 'node_modules/@fontsource/onest/files');
const font = fs.existsSync(path.join(fonts, 'onest-cyrillic-800-normal.woff2'))
  ? `@font-face{font-family:Onest;font-weight:800;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fonts, 'onest-cyrillic-800-normal.woff2')).toString('base64')})}`
  : '';
const context = await browser.newContext({ viewport: { width: 1024, height: 500 } });
const page = await context.newPage();
await page.setContent(`<!doctype html><html><head><style>${font}
  body{margin:0;width:1024px;height:500px;overflow:hidden;background:linear-gradient(155deg,#4b5bef,#5566f6 48%,#6a5cf7);font-family:Onest,system-ui,sans-serif;color:#fff;display:flex;align-items:center;gap:44px;padding:0 72px;box-sizing:border-box}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgb(255 255 255/.07) 1px,transparent 1px),linear-gradient(90deg,rgb(255 255 255/.07) 1px,transparent 1px);background-size:40px 40px;-webkit-mask-image:radial-gradient(80% 120% at 15% 10%,#000 20%,transparent 75%)}
  svg{position:relative;flex:none} h1{font-size:76px;font-weight:800;letter-spacing:-.04em;margin:0} p{font-size:30px;line-height:1.25;margin:14px 0 0;opacity:.9;max-width:560px;font-weight:800;letter-spacing:-.02em}
  div{position:relative}</style></head><body><span class="grid"></span>
  <svg width="168" height="168" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="rgb(255 255 255/.16)"/><path d="M8 12V9.5A1.5 1.5 0 0 1 9.5 8H12M20 8h2.5A1.5 1.5 0 0 1 24 9.5V12M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20M12 24H9.5A1.5 1.5 0 0 1 8 22.5V20" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/><path d="m11.5 16.5 3 3 6-7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div><h1>TasksFlow</h1><p>Задачи смены, чек-листы и фотоотчёты в телефоне</p></div></body></html>`);
await page.waitForTimeout(200);
fs.mkdirSync(path.join(out, 'android'), { recursive: true });
await page.screenshot({ path: path.join(out, 'android/feature-graphic.jpg'), type: 'jpeg', quality: 92 });
console.log('jpg  mobile/store/android/feature-graphic.jpg');
await browser.close();
preview.kill();
