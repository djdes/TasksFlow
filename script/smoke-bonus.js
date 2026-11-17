// Премия за задачу на UI-превью:
//  1) сотрудник 390px: «+30 ₽» справа у каждой задачи, на проверке — спокойная,
//     выполнил галочкой — тост с премией и «+30 ₽» взлетает над балансом;
//  2) тёмная тема 360px и ПК — снимки, без горизонтальной прокрутки;
//  3) админ: «Настройки» → «Премия за задачу», расчёт 3 600 ₽ в месяц,
//     тело PUT; новая задача сразу с премией 30 ₽.
// API подменён фикстурами — сервер и БД не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);
  const shots = 'output/playwright';

  const workerAccess = { userId: 7, kind: 'employee', roleId: null, roleName: 'Сотрудник', isAdmin: false, manageTasks: false, manageUsers: false, verifyTasks: false, viewReports: false, requiresApproval: false, taskScope: [7], reviewScope: [], reportScope: [7] };
  const adminAccess = { userId: 1, kind: 'admin', roleId: null, roleName: 'Администратор', isAdmin: true, manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, requiresApproval: false, taskScope: null, reviewScope: null, reportScope: null };
  const person = (id, name, extra = {}) => ({ id, name, phone: `+7999000${String(id).padStart(4, '0')}`, isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: now - 86400 * 20, managedWorkerIds: null, position: null, hasPin: true, locationId: null, roleId: null, email: null, ...extra });
  const task = (id, title, extra = {}) => ({ id, title, workerId: 7, requiresPhoto: false, photoUrl: null, photoUrls: [], examplePhotoUrls: [], isCompleted: false, weekDays: null, monthDay: null, isRecurring: true, price: 30, category: null, description: null, companyId: 1, journalLink: null, createdAt: now - 3600, completedAt: null, claimedByWorkerId: null, verificationStatus: null, verifierWorkerId: null, checklist: [], dueDate: null, ...extra });

  async function open(me, viewport, theme = 'light') {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    await context.addInitScript((t) => {
      localStorage.setItem('tf_onboarded_v1', 'true');
      localStorage.setItem('theme-preference', t);
    }, theme);
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    const state = {
      me: { ...me },
      tasks: [
        task(1, 'Протереть витрину'),
        task(2, 'Вынести мусор', { verificationStatus: 'submitted' }),
        task(3, 'Проверить холодильник', { isCompleted: true, completedAt: now - 600 }),
        task(4, 'Разобрать поставку', { price: 0 }),
      ],
      calls: [],
      taskBonus: 0,
    };
    await tab.route('**/api/**', async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const body = req.postData() && (req.headers()['content-type'] || '').includes('json') ? JSON.parse(req.postData()) : null;
      if (p !== '/api/events') state.calls.push({ method: req.method(), p, body });
      if (p === '/api/auth/me') return route.fulfill({ json: state.me });
      if (p === '/api/users') return route.fulfill({ json: [state.me, person(7, 'Анна', { access: workerAccess })] });
      if (p === '/api/companies/me/task-bonus') {
        state.taskBonus = body.amount;
        return route.fulfill({ json: { taskBonus: body.amount, open: 4, credited: 1 } });
      }
      if (p === '/api/companies/me') return route.fulfill({ json: { id: 1, name: 'Кафе', email: null, timezone: 'Europe/Moscow', planInfo: { id: 'team', name: 'Стандарт', maxUsers: 30, locations: false, until: null, enforced: true }, photo: { stamp: true, cameraOnly: false }, notify: { morning: '08:30', evening: '16:30', digest: '20:30', days: [0, 1, 2, 3, 4, 5, 6], quietFrom: '22:00' }, wesetupConfigured: false, employeeApproval: false, taskBonus: state.taskBonus } });
      if (p === '/api/tasks' && req.method() === 'GET') return route.fulfill({ json: state.tasks });
      const done = /^\/api\/tasks\/(\d+)\/complete$/.exec(p);
      if (done) {
        const t = state.tasks.find((x) => x.id === Number(done[1]));
        t.isCompleted = true;
        t.completedAt = now;
        state.me = { ...state.me, bonusBalance: (state.me.bonusBalance ?? 0) + (t.price ?? 0) };
        return route.fulfill({ json: t });
      }
      if (p === '/api/push/config') return route.fulfill({ json: { web: { enabled: false, publicKey: null }, apns: { enabled: false } } });
      if (p === '/api/me/telegram') return route.fulfill({ json: { connected: false, botConfigured: false } });
      if (p === '/api/app/info') return route.fulfill({ json: { android: { apk: null, playUrl: null, rustoreUrl: null }, ios: { appStoreUrl: null } } });
      if (p === '/api/events') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ json: [] });
    });
    return { context, tab, errors, state };
  }
  const noOverflow = (tab) => tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const worker = person(7, 'Анна', { bonusBalance: 120, access: workerAccess });
  const admin = person(1, 'Денис', { isAdmin: true, access: adminAccess });

  // ---------- 1. Сотрудник на телефоне ----------
  {
    const { context, tab, errors, state } = await open(worker, { width: 390, height: 844 });
    try {
      await tab.goto(base + '/dashboard');
      const card = tab.locator('.task-card', { hasText: 'Протереть витрину' });
      await card.waitFor();
      const reward = card.getByTestId('task-reward');
      check((await reward.innerText()).replace(/\s/g, '') === '+30₽', `премия на карточке: ${await reward.innerText()}`);
      // Справа от названия, а не под ним.
      const [rb, tb] = await Promise.all([reward.boundingBox(), card.locator('.task-title').boundingBox()]);
      check(rb && tb && rb.x > tb.x + tb.width - 4, 'премия не справа от названия');
      check(await tab.locator('.task-card', { hasText: 'Вынести мусор' }).locator('.task-reward--wait').count() === 1, 'на проверке — не «ждёт»');
      check(await tab.locator('.task-card', { hasText: 'Разобрать поставку' }).getByTestId('task-reward').count() === 0, 'премия у задачи без премии');
      check((await tab.getByTestId('bonus-badge').innerText()).includes('120'), 'баланс в шапке');
      await tab.waitForTimeout(1500);
      check(await noOverflow(tab), 'сотрудник 390: горизонтальная прокрутка');
      await tab.screenshot({ path: `${shots}/bonus-worker-390.png` });

      await card.getByRole('button', { name: /Выполнить задачу: Протереть витрину/ }).click();
      await tab.getByText('Готово · премия +30 ₽', { exact: true }).waitFor();
      check(await tab.getByText('На балансе 150 ₽', { exact: true }).count() > 0, 'в тосте нет нового баланса');
      const gain = tab.getByTestId('bonus-gain');
      await gain.waitFor({ timeout: 8000 });
      check((await gain.innerText()).replace(/\s/g, '') === '+30₽', `прибавка: ${await gain.innerText()}`);
      check((await tab.getByTestId('bonus-badge').innerText()).includes('150'), 'баланс не вырос до 150');
      await tab.screenshot({ path: `${shots}/bonus-worker-gain-390.png` });
      check(state.calls.some((c) => c.p === '/api/tasks/1/complete'), 'выполнение не ушло');
      check(errors.length === 0, `сотрудник: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 2. Тёмная 360 и ПК ----------
  for (const [viewport, theme, name] of [[{ width: 360, height: 780 }, 'dark', 'dark-360'], [{ width: 1280, height: 900 }, 'light', '1280']]) {
    const { context, tab, errors } = await open(worker, viewport, theme);
    try {
      await tab.goto(base + '/dashboard');
      await tab.locator('.task-card', { hasText: 'Протереть витрину' }).getByTestId('task-reward').waitFor();
      check(await noOverflow(tab), `${name}: горизонтальная прокрутка`);
      await tab.screenshot({ path: `${shots}/bonus-worker-${name}.png` });
      check(errors.length === 0, `${name}: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 3. Админ: настройка и новая задача ----------
  {
    const { context, tab, errors, state } = await open(admin, { width: 390, height: 844 });
    try {
      await tab.goto(base + '/admin/settings');
      const panel = tab.getByTestId('task-bonus-panel');
      await panel.waitFor();
      await panel.getByTestId('task-bonus-input').fill('30');
      check((await panel.getByTestId('task-bonus-estimate').innerText()).replace(/\s/g, '').includes('≈3600₽'), `расчёт: ${await panel.getByTestId('task-bonus-estimate').innerText()}`);
      check(await panel.getByTestId('task-bonus-apply').isChecked(), 'по умолчанию — и уже созданным');
      await panel.scrollIntoViewIfNeeded();
      await tab.screenshot({ path: `${shots}/bonus-settings-390.png` });
      await panel.getByTestId('task-bonus-save').click();
      await tab.getByText('Премия за задачу — 30 ₽', { exact: true }).waitFor();
      const put = state.calls.find((c) => c.p === '/api/companies/me/task-bonus');
      check(put?.body?.amount === 30 && put?.body?.applyToExisting === true, `PUT ${JSON.stringify(put?.body)}`);
      check(await noOverflow(tab), 'настройки 390: горизонтальная прокрутка');

      await tab.goto(base + '/tasks/new');
      const note = tab.getByTestId('form-bonus-note');
      await note.waitFor();
      check((await note.innerText()).replace(/\s/g, '').includes('+30₽'), `форма: ${await note.innerText()}`);
      check(errors.length === 0, `админ: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'reward chip right of title (+30 ₽, wait, none), complete → toast + balance gain 120→150, dark 360 + 1280, settings estimate 3 600 ₽ + PUT body, new task prefilled 30 ₽', failures };
}
