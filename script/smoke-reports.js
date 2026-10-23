// «История и отчёты» и «Расписание дня» на UI-превью: журнал дня с фото,
// сводка с графиком и таблицей, клавиатура на графике, просмотр фото,
// фильтр по человеку, CSV-ссылка, сохранение пояса и напоминаний.
// API подменён фикстурами — история и сводка сервера здесь не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const admin = { id: 1, name: 'Ирина Смирнова', phone: '+79990000001', isAdmin: true, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: 1, managedWorkerIds: null, hasPin: true };
  const people = [admin,
    { id: 10, name: 'Анна Петрова', phone: '+79990000010', isAdmin: false, companyId: 1, createdAt: 1, bonusBalance: 0 },
    { id: 11, name: 'Борис Кузнецов', phone: '+79990000011', isAdmin: false, companyId: 1, createdAt: 1, bonusBalance: 0 },
    { id: 12, name: 'Вера Соколова', phone: '+79990000012', isAdmin: false, companyId: 1, createdAt: 1, bonusBalance: 0 }];
  const TODAY = '2026-10-24';
  const item = (o) => ({ key: `${o.taskId}:${o.day ?? TODAY}`, day: TODAY, category: null, completedAt: null, time: null, photoUrls: [], checklist: null, price: 0, claimedByWorkerId: null, verificationStatus: null, ...o });
  const dayItems = (day) => day === TODAY ? [
    item({ taskId: 1, workerId: 10, title: 'Протереть витрину', status: 'done', time: '09:42', photoUrls: ['/uploads/p1.jpg', '/uploads/p2.jpg'], price: 150, category: 'Уборка' }),
    item({ taskId: 2, workerId: 10, title: 'Проверить сроки годности', status: 'submitted', time: '10:05', photoUrls: ['/uploads/p3.jpg'] }),
    item({ taskId: 3, workerId: 10, title: 'Пол в зале', status: 'pending' }),
    item({ taskId: 4, workerId: 11, title: 'Приёмка товара', status: 'done', time: '08:15', photoUrls: ['/uploads/p4.jpg', '/uploads/p5.jpg', '/uploads/p6.jpg', '/uploads/p7.jpg'] }),
    item({ taskId: 5, workerId: 11, title: 'Касса: сверка', status: 'claimed' }),
    item({ taskId: 6, workerId: 12, title: 'Санобработка инвентаря с очень длинным названием, которое не помещается в строку', status: 'pending', category: 'Санитария' }),
  ] : [
    item({ taskId: 1, day, workerId: 10, title: 'Протереть витрину', status: 'done', time: '09:12', photoUrls: ['/uploads/p1.jpg'], price: 150 }),
    item({ taskId: 3, day, workerId: 10, title: 'Пол в зале', status: 'missed', checklist: [{ id: 'a', title: 'Зал', done: true, photoUrls: ['/uploads/p8.jpg'] }, { id: 'b', title: 'Коридор', done: false, photoUrls: [] }] }),
    item({ taskId: 4, day, workerId: 11, title: 'Приёмка товара', status: 'done', time: '08:01', photoUrls: ['/uploads/p4.jpg'] }),
  ];
  const shift = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const summary = (from, to) => {
    const days = [];
    for (let d = from; d <= to; d = shift(d, 1)) {
      const n = Number(d.slice(8));
      days.push({ day: d, done: 14 + (n * 7) % 9, missed: d === TODAY ? 0 : (n * 3) % 4 });
    }
    return { from, to, today: TODAY, timezone: 'Europe/Moscow', days,
      people: [
        { workerId: 10, name: 'Анна Петрова', done: 58, claimed: 2, missed: 2, pending: 1, bonus: 2400, photos: 61, rate: 58 / 60 },
        { workerId: 11, name: 'Борис Кузнецов', done: 41, claimed: 0, missed: 9, pending: 0, bonus: 600, photos: 40, rate: 41 / 50 },
        { workerId: 12, name: 'Вера Соколова', done: 19, claimed: 1, missed: 11, pending: 1, bonus: 0, photos: 12, rate: 19 / 30 },
      ],
      totals: { done: 118, claimed: 3, missed: 22, pending: 2, bonus: 3000 } };
  };
  const company = { id: 1, name: 'Кафе «Ромашка»', email: 'owner@example.com', timezone: 'Europe/Moscow', notify: { morning: '09:00', evening: null, digest: '20:30' }, wesetupConfigured: false };
  const svg = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="hsl(${hue} 60% 70%)"/><circle cx="320" cy="240" r="120" fill="hsl(${hue} 60% 45%)"/></svg>`;

  async function open(viewport, theme) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', colorScheme: theme });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const puts = [];
    await page.route('**/uploads/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: svg((route.request().url().length * 37) % 360) }));
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const p = url.pathname;
      if (p === '/api/auth/me') return route.fulfill({ json: admin });
      if (p === '/api/users') return route.fulfill({ json: people });
      if (p === '/api/companies/me' && route.request().method() === 'PUT') { puts.push(JSON.parse(route.request().postData())); return route.fulfill({ json: company }); }
      if (p === '/api/companies/me') return route.fulfill({ json: company });
      if (p === '/api/history') { const day = url.searchParams.get('day') ?? TODAY; return route.fulfill({ json: { day, today: TODAY, timezone: 'Europe/Moscow', items: dayItems(day) } }); }
      if (p === '/api/reports/summary') return route.fulfill({ json: summary(url.searchParams.get('from') ?? shift(TODAY, -6), url.searchParams.get('to') ?? TODAY) });
      if (p === '/api/events') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ json: [] });
    });
    if (theme === 'dark') await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    return { context, page, errors, puts };
  }

  for (const [label, viewport, theme] of [['desktop', { width: 1280, height: 900 }, 'light'], ['mobile', { width: 390, height: 844 }, 'light'], ['mobile-dark', { width: 390, height: 844 }, 'dark'], ['w360', { width: 360, height: 740 }, 'light']]) {
    const { context, page, errors } = await open(viewport, theme);
    await page.goto(base + '/reports');
    await page.getByRole('heading', { name: 'Сегодня' }).waitFor();
    await page.getByText('Протереть витрину').first().waitFor();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: day view overflows`);
    await page.screenshot({ path: `output/playwright/reports-${label}-day.png`, fullPage: true });
    await page.getByRole('button', { name: 'Предыдущий день' }).click();
    await page.getByRole('heading', { name: 'Вчера' }).waitFor();
    await page.getByText('пункты 1 из 2').waitFor();
    await page.screenshot({ path: `output/playwright/reports-${label}-yesterday.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Сводка' }).click();
    await page.getByText('По дням', { exact: true }).waitFor();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: summary overflows`);
    const col = page.locator('.report-column').nth(3);
    await col.hover();
    await page.locator('.report-tooltip').waitFor();
    await page.screenshot({ path: `output/playwright/reports-${label}-summary.png`, fullPage: true });
    await page.getByRole('radio', { name: '30 дней' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.report-column').length === 30);
    await page.screenshot({ path: `output/playwright/reports-${label}-summary-30.png`, fullPage: true });
    check(errors.length === 0, `${label} errors: ${errors.join('; ')}`);
    await context.close();
  }

  // Просмотр фото и клавиатура на графике.
  {
    const { context, page, errors } = await open({ width: 1280, height: 900 }, 'light');
    await page.goto(base + '/reports');
    await page.getByRole('button', { name: /Фото 1 из 2: Протереть витрину/ }).click();
    await page.locator('.photo-viewer').waitFor();
    await page.screenshot({ path: `output/playwright/reports-viewer.png` });
    await page.keyboard.press('Escape');
    await page.locator('.photo-viewer').waitFor({ state: 'detached' });
    const focusBack = await page
      .waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Фото 1 из 2'), null, { timeout: 2000 })
      .then(() => true, () => false);
    check(focusBack, `focus did not return to the thumbnail: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`);
    await page.getByRole('tab', { name: 'Сводка' }).click();
    await page.locator('.report-column[tabindex="0"]').focus();
    await page.keyboard.press('ArrowLeft');
    await page.locator('.report-tooltip').waitFor();
    const tip = await page.locator('.report-tooltip').innerText();
    check(/сделано/.test(tip), `tooltip on keyboard: ${tip}`);
    const csv = await page.getByRole('link', { name: /Excel/ }).getAttribute('href');
    check(/^\/api\/reports\/export\.csv\?from=2026-10-18&to=2026-10-24$/.test(csv), `csv href ${csv}`);
    // Фильтр по человеку из таблицы.
    await page.getByRole('button', { name: 'Борис Кузнецов' }).click();
    check(await page.locator('.reports-select').inputValue() === '11', 'person filter not applied');
    check(errors.length === 0, `viewer errors: ${errors.join('; ')}`);
    await context.close();
  }

  // Расписание дня в настройках.
  {
    const { context, page, errors, puts } = await open({ width: 1280, height: 1000 }, 'light');
    await page.goto(base + '/admin/settings');
    await page.getByText('Расписание дня').waitFor();
    await page.locator('.schedule-settings select').selectOption('Asia/Vladivostok');
    await page.getByRole('checkbox', { name: /Вечером/ }).check();
    await page.getByLabel('Время: Утром — список задач').fill('08:30');
    await page.locator('.schedule-settings').screenshot({ path: `output/playwright/reports-schedule.png` });
    await page.getByRole('button', { name: 'Сохранить расписание' }).click();
    await page.waitForTimeout(400);
    check(puts.length === 1 && puts[0].timezone === 'Asia/Vladivostok' && puts[0].notify.morning === '08:30' && puts[0].notify.evening === '18:00' && puts[0].notify.digest === '20:30' && puts[0].email === undefined, `PUT ${JSON.stringify(puts)}`);
    check(errors.length === 0, `settings errors: ${errors.join('; ')}`);
    await context.close();
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'day journal (today/yesterday), summary 7/30 days, chart tooltip by hover and keyboard, photo viewer focus return, person filter, CSV link, schedule settings PUT, 360/390/desktop, dark', failures };
}
