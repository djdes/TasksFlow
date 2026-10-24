// Точки и тарифы на UI-превью: блок «Точки» и точка сотрудника, строка
// тарифа при включённых лимитах, фильтр точки на дашборде и в отчётах,
// root «Компании». API подменён фикстурами — сервер и БД не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);

  const admin = { id: 1, name: 'Ирина', phone: '+79990000001', isAdmin: true, isRoot: true, companyId: 1, bonusBalance: 0, createdAt: now - 86400 * 30, managedWorkerIds: null, hasPin: true, locationId: null };
  const people = [
    admin,
    { id: 10, name: 'Анна', phone: '+79990000010', isAdmin: false, companyId: 1, createdAt: now - 86400, bonusBalance: 0, hasPin: true, locationId: 5 },
    { id: 11, name: 'Борис', phone: '+79990000011', isAdmin: false, companyId: 1, createdAt: now - 86400, bonusBalance: 0, hasPin: true, locationId: 6 },
  ];
  let locations = [
    { id: 5, companyId: 1, name: 'Кафе на Ленина', address: null, createdAt: now, archivedAt: null },
    { id: 6, companyId: 1, name: 'Кафе на Мира', address: null, createdAt: now, archivedAt: null },
  ];
  const task = (id, title, workerId) => ({ id, title, workerId, requiresPhoto: false, photoUrl: null, photoUrls: [], examplePhotoUrls: [], isCompleted: false, weekDays: null, monthDay: null, isRecurring: true, price: 0, category: null, description: null, companyId: 1, journalLink: null, createdAt: now - 3600, completedAt: null, claimedByWorkerId: null, verificationStatus: null, verifierWorkerId: null, checklist: [], dueDate: null });
  const tasks = [task(1, 'Витрина на Ленина', 10), task(2, 'Склад на Мира', 11)];
  const calls = [];

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.addInitScript(() => localStorage.setItem('tf_onboarded_v1', 'true'));
  const tab = await context.newPage();
  tab.setDefaultTimeout(10000);
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (p !== '/api/events') calls.push({ method: req.method(), p, q: url.search, body });
    if (p === '/api/auth/me') return route.fulfill({ json: admin });
    if (p === '/api/users') return route.fulfill({ json: people });
    if (p === '/api/tasks') return route.fulfill({ json: tasks });
    if (p === '/api/companies/me') return route.fulfill({ json: { id: 1, name: 'Кафе', planInfo: { id: 'start', name: 'Старт', maxUsers: 5, locations: false, until: null, enforced: true }, photo: { stamp: true, cameraOnly: false }, wesetupConfigured: false } });
    if (p === '/api/locations' && req.method() === 'GET') return route.fulfill({ json: locations });
    if (p === '/api/locations' && req.method() === 'POST') {
      const loc = { id: 7, companyId: 1, name: body.name, address: null, createdAt: now, archivedAt: null };
      locations = [...locations, loc];
      return route.fulfill({ status: 201, json: loc });
    }
    if (/^\/api\/locations\/\d+$/.test(p) && req.method() === 'PUT') {
      const id = Number(p.split('/').pop());
      locations = locations.map((l) => (l.id === id ? { ...l, name: body.name } : l));
      return route.fulfill({ json: locations.find((l) => l.id === id) });
    }
    if (/^\/api\/locations\/\d+$/.test(p) && req.method() === 'DELETE') {
      const id = Number(p.split('/').pop());
      locations = locations.filter((l) => l.id !== id);
      return route.fulfill({ json: { ok: true } });
    }
    if (/^\/api\/users\/\d+\/location$/.test(p)) return route.fulfill({ json: { ...people[1], locationId: body.locationId } });
    if (p === '/api/history') return route.fulfill({ json: { day: '2026-10-24', today: '2026-10-24', timezone: 'Europe/Moscow', items: [] } });
    if (p === '/api/root/companies' && req.method() === 'GET') {
      return route.fulfill({ json: { enforced: false, companies: [
        { id: 1, name: 'Кафе', email: 'owner@example.com', createdAt: now - 86400 * 90, plan: null, planUntil: null, effectivePlan: 'start', usersCount: 7, tasksCount: 120, lastCompletedAt: now - 600 },
        { id: 2, name: 'Пекарня', email: null, createdAt: now - 86400 * 10, plan: 'team', planUntil: now + 86400 * 20, effectivePlan: 'team', usersCount: 12, tasksCount: 40, lastCompletedAt: null },
      ] } });
    }
    if (/^\/api\/root\/companies\/\d+\/plan$/.test(p)) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: [] });
  });

  try {
    // «Сотрудники»: тариф, точки, точка сотрудника.
    await tab.goto(base + '/admin/users');
    await tab.getByText('Тариф «Старт»: 3 из 5 человек.').waitFor();
    await tab.getByRole('heading', { name: 'Точки' }).waitFor();
    await tab.getByRole('textbox', { name: 'Новая точка' }).fill('Кафе у вокзала');
    await tab.getByRole('button', { name: 'Добавить', exact: true }).click();
    await tab.locator('.locations-list').getByText('Кафе у вокзала').waitFor();
    await tab.getByRole('button', { name: 'Переименовать: Кафе на Мира' }).click();
    await tab.getByRole('textbox', { name: 'Название точки' }).fill('Кафе на Мира, 2');
    await tab.getByRole('button', { name: 'Сохранить' }).first().click();
    await tab.locator('.locations-list').getByText('Кафе на Мира, 2').waitFor();
    await tab.getByRole('button', { name: 'Удалить: Кафе у вокзала' }).click();
    await tab.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
    await tab.locator('.locations-list').getByText('Кафе у вокзала').waitFor({ state: 'detached' });
    const selects = tab.locator('select[aria-label="Точка сотрудника"]');
    await selects.first().waitFor();
    check(await selects.count() === 3, `location selects: ${await selects.count()}`);
    await selects.nth(1).selectOption('6');
    await tab.waitForTimeout(200);
    check(calls.some((c) => c.method === 'PUT' && c.p === '/api/users/10/location' && c.body?.locationId === 6), 'assign location not sent');
    check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'admin users overflows');
    await tab.screenshot({ path: 'output/playwright/company-admin-users.png', fullPage: true });

    // Дашборд: фильтр по точке.
    await tab.goto(base + '/dashboard');
    await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
    const expandAll = async () => {
      // Секции сотрудников — <details>: раскрываем свёрнутые.
      const closed = tab.locator('details:not([open]) > summary.worker-section-header');
      for (let i = 0; i < 20 && (await closed.count()) > 0; i++) await closed.first().click();
    };
    await expandAll();
    await tab.getByRole('button', { name: 'Витрина на Ленина', exact: true }).first().waitFor();
    await tab.getByRole('combobox', { name: 'Точка' }).click();
    await tab.getByRole('option', { name: 'Кафе на Мира, 2' }).click();
    await expandAll();
    await tab.getByRole('button', { name: 'Склад на Мира', exact: true }).first().waitFor();
    check(await tab.getByRole('button', { name: 'Витрина на Ленина', exact: true }).count() === 0, 'location filter kept other location task');
    await tab.screenshot({ path: 'output/playwright/company-dashboard-location.png' });

    // Отчёты: точка уходит в запрос.
    await tab.goto(base + '/reports');
    await tab.getByRole('heading', { name: 'Сегодня' }).waitFor();
    // По имени, а не .first(): пока точки грузятся, первым стоит другой select
    // (сотрудник или пояс), и выбор ждал бы на нём опцию, которой там нет.
    await tab.getByRole('combobox', { name: 'Точка', exact: true }).selectOption('5');
    await tab.waitForTimeout(300);
    check(calls.some((c) => c.p === '/api/history' && /locationId=5/.test(c.q)), 'reports location not sent');

    // Root: компании и тарифы.
    await tab.goto(base + '/admin/companies');
    await tab.getByRole('heading', { name: 'Компании' }).waitFor();
    await tab.getByText('людей: 7 из 5').waitFor();
    await tab.getByRole('combobox', { name: 'Тариф: Кафе' }).selectOption('team');
    await tab.getByRole('textbox', { name: 'Действует до: Кафе' }).fill('2026-12-31');
    await tab.locator('.root-company').first().getByRole('button', { name: 'Сохранить' }).click();
    await tab.waitForTimeout(300);
    const put = calls.find((c) => c.p === '/api/root/companies/1/plan');
    check(put?.body?.plan === 'team' && typeof put?.body?.until === 'number', `root plan ${JSON.stringify(put)}`);
    await tab.setViewportSize({ width: 390, height: 844 });
    check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'root companies overflows at 390');
    await tab.screenshot({ path: 'output/playwright/company-root.png', fullPage: true });
    check(errors.length === 0, `errors: ${errors.join('; ')}`);
  } finally {
    await context.close();
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'plan line, locations add/rename/archive, user location, dashboard location filter, reports locationId, root plans, 390px', failures };
}
