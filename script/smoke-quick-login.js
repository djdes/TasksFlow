// API подменён: проверяем интерфейс входа, права и реальные PDF макетов.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const token = 'a'.repeat(64);
  const endpoint = `/api/quick-login/by-token/${token}`;
  const worker = { id: 7, companyId: 42, name: 'Анна', position: 'Повар', isAdmin: false, hasPin: true, phone: '+79991234567', createdAt: 1 };
  const manager = { ...worker, id: 1, name: 'Ирина', managedWorkerIds: '[7]', isAdmin: false };
  const directory = { companyName: 'Производство «Север»', users: [worker, { id: 8, name: 'Анна', position: 'Кладовщик', hasPin: true }, { id: 9, name: 'Олег', position: null, hasPin: false }] };
  const link = { companyName: directory.companyName, url: `${base}/quick-login/${token}` };
  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  const errors = [];

  async function open(viewport, theme, handler, run) {
    const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript((theme) => {
      localStorage.setItem('theme-preference', theme);
      localStorage.setItem('tf_onboarded_v1', 'true');
      localStorage.setItem('tf_motion_enabled', 'false');
      window.print = () => { window.top.__quickPrints = (window.top.__quickPrints || 0) + 1; };
    }, theme);
    const p = await context.newPage();
    p.setDefaultTimeout(12000);
    p.on('pageerror', (e) => errors.push(e.message));
    await p.route('**/api/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const response = await handler(path, req.method(), req.postDataJSON());
      return route.fulfill(response || { json: path === '/api/companies/me' ? { id: 42 } : [] });
    });
    try { await run(p); } finally { await context.close(); }
  }
  const noOverflow = async (p, label) => check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), `${label}: горизонтальная прокрутка`);

  for (const [label, viewport, theme] of [
    ['desktop', { width: 1280, height: 900 }, 'light'],
    ['mobile-dark', { width: 360, height: 800 }, 'dark'],
  ]) {
    let session = null;
    let attempts = 0;
    let failDirectory = true;
    await open(viewport, theme, async (path, method, body) => {
      if (path === '/api/auth/me') return { json: session };
      if (path === endpoint) {
        if (failDirectory) { failDirectory = false; return { status: 503, json: { message: 'Не удалось загрузить сотрудников. Повторите попытку.' } }; }
        return { json: directory };
      }
      if (path === endpoint + '/login') {
        attempts++;
        check(body.userId === 7, 'Неверный сотрудник в payload');
        check(!('phone' in body), 'В payload оказался телефон');
        if (body.pin !== '4826') return { status: 401, json: { message: 'Неверный PIN', attemptsLeft: 4 } };
        session = worker;
        return { json: { success: true } };
      }
      return null;
    }, async (p) => {
      await p.goto(`${base}/quick-login/${token}`);
      await p.getByRole('button', { name: /Повтор/ }).click();
      await p.getByLabel('Найдите себя').fill('Кладовщик');
      check(await p.getByRole('button', { name: /Анна/ }).count() === 1, 'Поиск по должности');
      await p.getByLabel('Найдите себя').fill('Олег');
      await p.getByRole('button', { name: /Олег/ }).click();
      await p.getByText(/PIN ещё не задан/).waitFor();
      check(await p.getByLabel('Ваш PIN').count() === 0, 'При отсутствии PIN нельзя придумывать новый');
      await p.getByRole('button', { name: 'Выбрать другого сотрудника' }).click();
      await p.getByLabel('Найдите себя').fill('Повар');
      await p.screenshot({ path: `output/playwright/quick-login-${label}-directory.png` });
      await noOverflow(p, label);
      await p.getByRole('button', { name: /Анна/ }).click();
      await p.getByLabel('Ваш PIN').fill('1357');
      await p.getByRole('button', { name: 'Войти к задачам' }).click();
      await p.getByText('Неверный PIN', { exact: true }).waitFor();
      await p.getByLabel('Ваш PIN').fill('4826');
      await p.screenshot({ path: `output/playwright/quick-login-${label}-pin.png` });
      await noOverflow(p, label);
      await p.getByRole('button', { name: 'Войти к задачам' }).click();
      await p.waitForURL('**/dashboard');
      check(attempts === 2, 'Вход должен пройти после исправления PIN');
    });
  }

  // Общий планшет: существующая сессия явно видна, выйти и выбрать себя.
  let session = worker;
  await open({ width: 390, height: 844 }, 'light', async (path, method) => {
    if (path === '/api/auth/me') return { json: session };
    if (path === '/api/auth/logout') { session = null; return { json: { success: true } }; }
    if (path === endpoint) return { json: directory };
    if (path.endsWith('/login') && method === 'POST') return { status: 429, json: { message: 'Вход заблокирован на 15 мин', retryAfterSec: 900 } };
    return null;
  }, async (p) => {
    await p.goto(`${base}/quick-login/${token}`);
    await p.getByRole('button', { name: 'Войти другим сотрудником' }).click();
    await p.getByRole('button', { name: /Анна.*#7/ }).click();
    await p.getByLabel('Ваш PIN').fill('4826');
    await p.getByRole('button', { name: 'Войти к задачам' }).click();
    await p.getByText(/Повторите через/).waitFor();
    check(await p.getByLabel('Ваш PIN').isDisabled(), 'Блокировка должна выключать PIN');
  });

  // Руководитель получает постоянный QR, оба формата печатаются на одной странице.
  for (const [label, viewport, theme] of [
    ['desktop', { width: 1280, height: 900 }, 'light'],
    ['mobile-dark', { width: 360, height: 800 }, 'dark'],
  ]) {
    let created = false;
    await open(viewport, theme, async (path, method) => {
      if (path === '/api/auth/me') return { json: manager };
      if (path === '/api/quick-login/link') {
        if (method === 'POST') created = true;
        return { json: created ? link : { ...link, url: null } };
      }
      return null;
    }, async (p) => {
      await p.goto(base + '/admin/quick-login');
      await p.getByRole('button', { name: 'Создать QR-код входа' }).click();
      await p.frameLocator('iframe[title="Предпросмотр распечатки"]').getByAltText('QR-код входа в организацию').waitFor();
      for (const format of ['a4', 'label']) {
        if (format === 'label') await p.getByLabel('Стикер 58 × 40 мм', { exact: true }).check();
        await p.screenshot({ path: `output/playwright/quick-login-${label}-${format}.png`, fullPage: true });
        await noOverflow(p, `${label}-${format}`);
        if (label === 'desktop') {
          const html = await p.locator('iframe[title="Предпросмотр распечатки"]').getAttribute('srcdoc');
          const pdfPage = await p.context().newPage();
          await pdfPage.setContent(html);
          await pdfPage.locator('img').evaluate((img) => img.decode());
          const pdf = await pdfPage.pdf({ path: `output/playwright/quick-login-${format}.pdf`, preferCSSPageSize: true, printBackground: true });
          const text = pdf.toString('latin1');
          check((text.match(/\/Type\s*\/Page\b/g) || []).length === 1, `${format}: PDF должен содержать одну страницу`);
          const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
          check(box && Math.abs(Number(box[1]) - (format === 'a4' ? 595 : 164.4)) < 2 && Math.abs(Number(box[2]) - (format === 'a4' ? 842 : 113.4)) < 2, `${format}: неверный размер PDF ${box?.[0]}`);
          await pdfPage.close();
        }
      }
      await p.getByRole('button', { name: 'Печатать', exact: true }).click();
      await p.waitForFunction(() => window.__quickPrints === 1);
    });
  }
  await open({ width: 390, height: 844 }, 'light', async (path) => path === '/api/auth/me' ? { json: worker } : null, async (p) => {
    await p.goto(base + '/admin/quick-login');
    await p.waitForURL('**/dashboard');
  });
  // Максимальная длина названия не вытесняет QR и не растягивает его.
  await open({ width: 390, height: 844 }, 'light', async (path) => {
    if (path === '/api/auth/me') return { json: manager };
    if (path === '/api/quick-login/link') return { json: { ...link, companyName: 'Производственная компания Северный регион '.repeat(8).slice(0, 255) } };
    return null;
  }, async (p) => {
    await p.goto(base + '/admin/quick-login');
    for (const format of ['a4', 'label']) {
      if (format === 'label') await p.getByLabel('Стикер 58 × 40 мм', { exact: true }).check();
      const preview = p.frameLocator('iframe[title="Предпросмотр распечатки"]');
      await preview.getByAltText('QR-код входа в организацию').waitFor();
      const image = await preview.locator('img').boundingBox();
      check(image && Math.abs(image.width - image.height) < 1, `${format}: QR должен оставаться квадратным`);
      check(await preview.locator('body').evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), `${format}: длинное название не помещается в макет`);
      await noOverflow(p, 'long-name');
    }
    await p.screenshot({ path: 'output/playwright/quick-login-long-name.png', fullPage: true });
  });
  check(errors.length === 0, errors.join('; '));
  if (failures.length) throw new Error(failures.join('\n'));
  const fs = await import('node:fs/promises');
  const files = ['quick-login-desktop-a4.png', 'quick-login-mobile-dark-directory.png', 'quick-login-mobile-dark-pin.png', 'quick-login-mobile-dark-label.png'];
  const pictures = await Promise.all(files.map(async (file) => `<figure><figcaption>${file}</figcaption><img src="data:image/png;base64,${(await fs.readFile('output/playwright/' + file)).toString('base64')}"></figure>`));
  await page.setViewportSize({ width: 1480, height: 1040 });
  await page.setContent(`<html><style>body{margin:0;padding:20px;background:#edf0f5;font:13px sans-serif;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:12px}figure{margin:0}figcaption{margin-bottom:12px}img{width:100%;height:auto;display:block}</style>${pictures.join('')}</html>`);
  await page.screenshot({ path: 'output/playwright/quick-login-contact-sheet.png', fullPage: true });
  return { ok: true, pdf: ['quick-login-a4.pdf', 'quick-login-label.pdf'] };
}
