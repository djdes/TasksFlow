// «Новая задача»: разовая и регулярная вкладки на UI-превью.
//  1) телефон 390px, светлая: разовая по умолчанию, шаблоны — иконкой в шапке,
//     подписи в placeholder, ответственный — список с поиском и галочками,
//     фото проблемы, «Устранить до» быстрым сроком; две копии — фото у каждой;
//  2) регулярная: дни недели, без срока и фото проблемы; тело запроса;
//  3) тёмная тема 360px и ПК 1280px — снимки, без горизонтальной прокрутки.
// API подменён фикстурами — сервер и БД не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);
  const shots = 'output/playwright';

  const adminAccess = { userId: 1, kind: 'admin', roleId: null, roleName: 'Администратор', isAdmin: true, manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, requiresApproval: false, taskScope: null, reviewScope: null, reportScope: null };
  const person = (id, name, extra = {}) => ({ id, name, phone: `+7999000${String(id).padStart(4, '0')}`, isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: now - 86400 * 20, managedWorkerIds: null, position: null, hasPin: true, locationId: null, roleId: null, email: null, ...extra });
  const admin = person(1, 'Денис', { isAdmin: true, access: adminAccess });
  const people = [
    admin,
    person(2, 'Михаил Шеф Сушеф', { position: 'Шеф' }),
    person(3, 'Анна', { position: 'Повар' }),
    person(4, 'Борис', { position: 'Мойщик' }),
    person(5, 'Ёлкина Вера'),
    person(6, 'Галина'),
    person(7, 'Дмитрий', { position: 'Бармен' }),
    person(8, 'Елена'),
  ];
  // 1×1 PNG — «фото проблемы».
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  async function open(viewport, theme = 'light') {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    await context.addInitScript((t) => {
      localStorage.setItem('tf_onboarded_v1', 'true');
      localStorage.setItem('theme-preference', t);
    }, theme);
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    const calls = [];
    let nextId = 100;
    await tab.route('**/api/**', async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const type = req.headers()['content-type'] || '';
      const body = type.includes('json') && req.postData() ? JSON.parse(req.postData()) : null;
      if (p !== '/api/events') calls.push({ method: req.method(), p, body });
      if (p === '/api/auth/me') return route.fulfill({ json: admin });
      if (p === '/api/users') return route.fulfill({ json: people });
      if (p === '/api/companies/me') return route.fulfill({ json: { id: 1, name: 'ООО БФС', planInfo: { id: 'team', name: 'Стандарт', maxUsers: 30, locations: false, until: null, enforced: true }, photo: { stamp: true, cameraOnly: false }, notify: { morning: '08:30' }, wesetupConfigured: false } });
      if (p === '/api/tasks' && req.method() === 'POST') return route.fulfill({ status: 201, json: { id: nextId++, ...body } });
      if (/^\/api\/tasks\/\d+\/example-photo$/.test(p)) return route.fulfill({ json: { examplePhotoUrl: '/uploads/x.png' } });
      if (p === '/api/push/config') return route.fulfill({ json: { web: { enabled: false, publicKey: null }, apns: { enabled: false } } });
      if (p === '/api/me/telegram') return route.fulfill({ json: { connected: false, botConfigured: false } });
      if (p === '/api/app/info') return route.fulfill({ json: { android: { apk: null, playUrl: null, rustoreUrl: null }, ios: { appStoreUrl: null } } });
      return route.fulfill({ json: [] });
    });
    return { context, tab, errors, calls };
  }
  const noOverflow = (tab) => tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const created = (calls) => calls.filter((c) => c.method === 'POST' && c.p === '/api/tasks').map((c) => c.body);

  // ---------- 1. Разовая на телефоне ----------
  {
    const { context, tab, errors, calls } = await open({ width: 390, height: 844 });
    try {
      await tab.goto(base + '/tasks/new');
      const title = tab.getByPlaceholder('Что сделать?');
      await title.waitFor();
      check(await tab.getByTestId('task-kind-once').getAttribute('aria-checked') === 'true', 'разовая не по умолчанию');
      check(await tab.getByRole('button', { name: 'Из шаблона', exact: true }).isVisible(), 'нет иконки шаблонов в шапке');
      check(await tab.getByText('Готовые задачи на смену для вашей отрасли').count() === 0, 'подпись шаблонов осталась над формой');
      check(await tab.locator('.content-panel label:text-is("Название")').count() === 0, 'над названием остался заголовок');
      await tab.screenshot({ path: `${shots}/quick-task-once-390.png`, fullPage: true });

      // Без ответственного — подсказка у поля, запроса нет.
      await title.fill('Отмыть пол у мойки');
      await tab.getByRole('button', { name: 'Создать', exact: true }).click();
      await tab.getByText('Выберите исполнителя').waitFor();
      check(created(calls).length === 0, 'задача ушла без ответственного');

      await tab.getByPlaceholder('Подробности, если нужно').fill('Лужа под второй мойкой');
      await tab.getByTestId('worker-picker').click();
      const search = tab.getByTestId('worker-picker-search');
      await search.waitFor();
      await search.fill('елк');
      check(await tab.getByRole('checkbox', { name: 'Ёлкина Вера' }).isVisible(), 'поиск: «ё» = «е»');
      check(await tab.getByRole('checkbox').count() === 1, 'поиск не отфильтровал список');
      await search.fill('пов');
      await tab.getByRole('checkbox', { name: 'Анна' }).click();
      await search.fill('');
      await tab.getByRole('checkbox', { name: 'Борис' }).click();
      check(await tab.getByRole('checkbox', { name: 'Анна' }).getAttribute('aria-checked') === 'true', 'галочка не стоит');
      await tab.screenshot({ path: `${shots}/quick-task-picker-390.png` });
      await tab.getByRole('button', { name: 'Готово', exact: true }).click();
      check((await tab.getByTestId('worker-picker').innerText()).includes('Анна и Борис'), 'выбранные не видны в поле');
      check(await tab.getByText('Каждому — своя копия').isVisible(), 'нет подсказки про копии');

      await tab.getByTestId('problem-photo-upload').setInputFiles({ name: 'problem.png', mimeType: 'image/png', buffer: png });
      await tab.locator('.photo-slot img').waitFor();
      // «Срок до» — одно поле, варианты — по нажатию.
      await tab.getByTestId('due-trigger').click();
      await tab.getByTestId('due-tomorrow').click();
      check((await tab.locator('.due-quick .due-quick-text').innerText()).startsWith('Срок до '), 'срок не подписан');
      check(await noOverflow(tab), 'разовая 390: горизонтальная прокрутка');
      await tab.screenshot({ path: `${shots}/quick-task-once-filled-390.png`, fullPage: true });

      await tab.getByRole('button', { name: 'Создать', exact: true }).click();
      await tab.waitForURL((u) => !u.pathname.endsWith('/tasks/new'), { timeout: 10000 }).catch(() => {});
      const bodies = created(calls);
      check(bodies.length === 2, `разовая: создано ${bodies.length}, ждали 2`);
      const b = bodies[0] || {};
      check(b.isRecurring === false && b.weekDays === null && b.monthDay === null && typeof b.dueDate === 'number', `разовая: тело ${JSON.stringify(b)}`);
      check(b.description === 'Лужа под второй мойкой', 'описание не ушло');
      check(new Set(bodies.map((x) => x.workerId)).size === 2, 'копии не разным сотрудникам');
      const photos = calls.filter((c) => /example-photo$/.test(c.p)).map((c) => c.p);
      check(photos.length === 2 && photos.includes('/api/tasks/100/example-photo') && photos.includes('/api/tasks/101/example-photo'), `фото проблемы у каждой копии: ${photos.join(', ')}`);
      check(errors.length === 0, `разовая: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 2. Регулярная ----------
  {
    const { context, tab, errors, calls } = await open({ width: 390, height: 844 });
    try {
      await tab.goto(base + '/tasks/new');
      await tab.getByPlaceholder('Что сделать?').fill('Протереть витрину');
      await tab.getByTestId('due-trigger').click();
      await tab.getByTestId('due-today').click();
      await tab.getByTestId('task-kind-recurring').click();
      check(await tab.getByTestId('input-due-date').count() === 0, 'срок на регулярной');
      check((await tab.locator('.photo-slot-add').innerText()).includes('Фото-пример'), 'у регулярной фото — «Фото-пример»');
      await tab.getByTestId('worker-picker').click();
      await tab.getByRole('checkbox', { name: 'Анна' }).click();
      await tab.keyboard.press('Escape');
      // Расписание — одно поле: дни, число и повтор — по нажатию.
      await tab.getByTestId('schedule-trigger').click();
      for (const day of ['Пн', 'Ср']) await tab.getByRole('button', { name: day, exact: true }).click();
      check((await tab.getByTestId('schedule-summary').innerText()).startsWith('По понедельникам и средам'), 'сводка расписания');
      await tab.keyboard.press('Escape');
      await tab.getByTestId('task-more-toggle').click();
      await tab.getByPlaceholder('Премия, ₽').fill('150');
      check((await tab.getByTestId('task-more-toggle').innerText()).includes('1'), '«Дополнительно» не показывает, что задано');
      check(await noOverflow(tab), 'регулярная 390: горизонтальная прокрутка');
      await tab.screenshot({ path: `${shots}/quick-task-recurring-390.png`, fullPage: true });
      await tab.getByRole('button', { name: 'Создать', exact: true }).click();
      await tab.waitForURL((u) => !u.pathname.endsWith('/tasks/new'), { timeout: 10000 }).catch(() => {});
      const b = created(calls)[0] || {};
      check(b.dueDate === null && b.isRecurring === true && JSON.stringify(b.weekDays) === '[1,3]' && b.price === 150, `регулярная: тело ${JSON.stringify(b)}`);
      check(errors.length === 0, `регулярная: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 3. Тёмная тема 360 и ПК ----------
  for (const [viewport, theme, name] of [[{ width: 360, height: 780 }, 'dark', 'dark-360'], [{ width: 1280, height: 900 }, 'light', '1280']]) {
    const { context, tab, errors } = await open(viewport, theme);
    try {
      await tab.goto(base + '/tasks/new');
      await tab.getByPlaceholder('Что сделать?').waitFor();
      await tab.getByTestId('worker-picker').click();
      await tab.getByRole('checkbox', { name: 'Михаил Шеф Сушеф' }).click();
      await tab.screenshot({ path: `${shots}/quick-task-picker-${name}.png` });
      await tab.keyboard.press('Escape');
      check(await noOverflow(tab), `${name}: горизонтальная прокрутка`);
      await tab.screenshot({ path: `${shots}/quick-task-${name}.png`, fullPage: true });
      check(errors.length === 0, `${name}: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'one-time default, templates icon, placeholder labels, worker picker search/ё/checkboxes, problem photo on every copy, due shortcut, recurring body, dark 360 + 1280', failures };
}
