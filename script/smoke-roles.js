// Роли, проверка выполненного и уведомления на UI-превью:
//  1) админ: «Роли и права» — заготовка «Руководитель», проверка у «Сотрудника»,
//     новый сотрудник с должностью и ролью; светлая и тёмная тема, ПК;
//  2) руководитель с ролью на телефоне 390px: «Сотрудники» без ролей, точек и
//     тарифа, админа не трогает, «Руководителя» и админа не выдаёт;
//  3) руководитель создаёт задачу со временем напоминания;
//  4) «Мой аккаунт» → «Уведомления»: письма о новых задачах, тёмная тема 360px.
// API подменён фикстурами — сервер и БД не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);
  const shots = 'output/playwright';

  const PERM_LEAD = { manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, requiresApproval: false };
  const PERM_SENIOR = { manageTasks: true, manageUsers: false, verifyTasks: false, viewReports: false, requiresApproval: false };
  const access = (extra) => ({ userId: 0, kind: 'employee', roleId: null, roleName: 'Сотрудник', isAdmin: false, manageTasks: false, manageUsers: false, verifyTasks: false, viewReports: false, requiresApproval: false, taskScope: [], reviewScope: [], reportScope: [], ...extra });
  const adminAccess = access({ userId: 1, kind: 'admin', roleName: 'Администратор', isAdmin: true, manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, taskScope: null, reviewScope: null, reportScope: null });
  const leadAccess = access({ userId: 2, kind: 'role', roleId: 3, roleName: 'Руководитель', ...PERM_LEAD, taskScope: null, reviewScope: null, reportScope: null });
  const workerAccess = access({ userId: 10, taskScope: [10], reportScope: [10], requiresApproval: true });

  const person = (id, name, extra = {}) => ({ id, name, phone: `+7999000${String(id).padStart(4, '0')}`, isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: now - 86400 * 20, managedWorkerIds: null, position: null, hasPin: true, locationId: null, roleId: null, email: null, ...extra });
  const admin = person(1, 'Денис', { isAdmin: true, access: adminAccess });
  const lead = person(2, 'Михаил Шеф Сушеф', { roleId: 3, position: 'Шеф', access: leadAccess });
  const worker = person(10, 'Анна', { position: 'Повар', access: workerAccess, email: 'anna@example.com' });

  function fixtures(me) {
    const state = {
      roles: [{ id: 3, companyId: 1, name: 'Руководитель', permissions: PERM_LEAD, createdAt: now, updatedAt: now }, { id: 4, companyId: 1, name: 'Старший смены', permissions: PERM_SENIOR, createdAt: now, updatedAt: now }],
      employeeApproval: false,
      people: [admin, lead, worker, person(11, 'Борис')],
      calls: [],
    };
    if (me.id === 1) state.roles = [{ id: 4, companyId: 1, name: 'Старший смены', permissions: PERM_SENIOR, createdAt: now, updatedAt: now }];
    const handler = async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (p !== '/api/events') state.calls.push({ method: req.method(), p, body });
      if (p === '/api/auth/me') return route.fulfill({ json: { ...me, notify: me.notify ?? undefined } });
      if (p === '/api/users' && req.method() === 'GET') return route.fulfill({ json: state.people });
      if (p === '/api/users' && req.method() === 'POST') {
        const created = person(50, body.name || null, { phone: body.phone, position: body.position ?? null, roleId: body.roleId ?? null, isAdmin: body.role === 'admin' });
        state.people = [...state.people, created];
        return route.fulfill({ status: 201, json: created });
      }
      if (p === '/api/roles' && req.method() === 'GET') return route.fulfill({ json: { roles: state.roles, employeeApproval: state.employeeApproval } });
      if (p === '/api/roles' && req.method() === 'POST') {
        const role = { id: 20 + state.roles.length, companyId: 1, ...body, createdAt: now, updatedAt: now };
        state.roles = [...state.roles, role];
        return route.fulfill({ status: 201, json: role });
      }
      if (p === '/api/roles/settings') {
        state.employeeApproval = body.employeeApproval;
        return route.fulfill({ json: { roles: state.roles, employeeApproval: state.employeeApproval } });
      }
      if (p === '/api/account/notify-prefs') return route.fulfill({ json: { notify: body } });
      if (p === '/api/companies/me') return route.fulfill({ json: { id: 1, name: 'ООО БФС', planInfo: { id: 'start', name: 'Старт', maxUsers: 10, locations: false, until: null, enforced: true }, photo: { stamp: true, cameraOnly: false }, notify: { morning: '08:30', evening: '18:00', digest: '20:30' }, wesetupConfigured: false, employeeApproval: state.employeeApproval } });
      if (p === '/api/locations') return route.fulfill({ json: [] });
      if (p === '/api/tasks' && req.method() === 'POST') return route.fulfill({ status: 201, json: { id: 99, ...body } });
      if (p === '/api/push/config') return route.fulfill({ json: { web: { enabled: false, publicKey: null }, apns: { enabled: false } } });
      if (p === '/api/me/telegram') return route.fulfill({ json: { connected: false, botConfigured: false } });
      if (p === '/api/app/info') return route.fulfill({ json: { android: { apk: null, playUrl: null, rustoreUrl: null }, ios: { appStoreUrl: null } } });
      return route.fulfill({ json: [] });
    };
    return { state, handler };
  }

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
    const fx = fixtures(me);
    await tab.route('**/api/**', fx.handler);
    return { context, tab, errors, fx };
  }

  const noOverflow = (tab) => tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  // ---------- 1. Админ: роли и новый сотрудник ----------
  {
    const { context, tab, errors, fx } = await open(admin, { width: 1280, height: 900 });
    try {
      await tab.goto(base + '/admin/users');
      const panel = tab.locator('.roles-panel');
      await panel.getByRole('heading', { name: 'Роли и права' }).waitFor();
      check(await panel.getByText('Администратор', { exact: true }).isVisible(), 'нет встроенной роли «Администратор»');
      await panel.getByRole('button', { name: 'Роль «Руководитель»' }).click();
      const form = panel.getByRole('form', { name: 'Новая роль' });
      await form.waitFor();
      check(await form.getByRole('textbox', { name: 'Название роли' }).inputValue() === 'Руководитель', 'заготовка: название');
      check(await form.getByRole('checkbox', { name: /Ставит задачи себе и другим/ }).isChecked(), 'заготовка: задачи');
      check(await form.getByRole('checkbox', { name: /Добавляет сотрудников/ }).isChecked(), 'заготовка: сотрудники');
      check(!(await form.getByRole('checkbox', { name: /Выполненные задачи — на проверку/ }).isChecked()), 'заготовка: свои задачи руководителя без проверки');
      await tab.screenshot({ path: `${shots}/roles-admin-form-1280.png`, fullPage: true });
      await form.getByRole('button', { name: 'Добавить роль' }).click();
      await panel.locator('.role-card-name', { hasText: 'Руководитель' }).waitFor();
      const created = fx.state.calls.find((c) => c.method === 'POST' && c.p === '/api/roles');
      check(created?.body?.name === 'Руководитель' && created?.body?.permissions?.manageUsers === true, 'POST /api/roles: название и права');

      await panel.getByRole('checkbox', { name: /Выполненные задачи — на проверку/ }).check();
      await tab.waitForFunction(() => true);
      const setting = fx.state.calls.find((c) => c.p === '/api/roles/settings');
      check(setting?.body?.employeeApproval === true, 'PUT /api/roles/settings employeeApproval=true');

      await tab.getByRole('textbox', { name: /Номер телефона/ }).fill('+79991112233').catch(async () => {
        await tab.locator('input[type="tel"]').first().fill('+79991112233');
      });
      await tab.getByPlaceholder('Например, Анна Петрова').first().fill('Новый повар');
      await tab.getByPlaceholder('Например, Повар').first().fill('Повар');
      await tab.locator('#new-user-role').selectOption({ label: 'Руководитель' });
      await tab.getByRole('button', { name: 'Добавить сотрудника' }).click();
      await tab.getByText('Сотрудник добавлен').first().waitFor();
      const post = fx.state.calls.find((c) => c.method === 'POST' && c.p === '/api/users');
      check(post?.body?.position === 'Повар', 'POST /api/users: должность');
      check(typeof post?.body?.roleId === 'number', 'POST /api/users: roleId');
      check(await tab.locator('.role-badge', { hasText: 'Админ' }).first().isVisible(), 'бейдж «Админ» в списке');
      await tab.screenshot({ path: `${shots}/roles-admin-1280.png`, fullPage: true });
      check(errors.length === 0, `админ: ошибки страницы: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // Тёмная тема — та же страница.
  {
    const { context, tab, errors } = await open(admin, { width: 1280, height: 900 }, 'dark');
    try {
      await tab.goto(base + '/admin/users');
      await tab.locator('.roles-panel').getByRole('heading', { name: 'Роли и права' }).waitFor();
      await tab.locator('.roles-panel').scrollIntoViewIfNeeded();
      await tab.screenshot({ path: `${shots}/roles-admin-dark-1280.png`, fullPage: true });
      check(errors.length === 0, `админ, тёмная: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 2. Руководитель с ролью на телефоне ----------
  {
    const { context, tab, errors } = await open(lead, { width: 390, height: 844 });
    try {
      await tab.goto(base + '/admin/users');
      await tab.getByRole('heading', { name: 'Сотрудники', exact: true }).waitFor();
      await tab.getByText('Анна').first().waitFor();
      check(await tab.locator('.roles-panel').count() === 0, 'руководителю не показываем «Роли и права»');
      check(await tab.getByRole('heading', { name: 'Точки' }).count() === 0, 'руководителю не показываем «Точки»');
      check(await tab.getByText(/Тариф «Старт»/).count() === 0, 'руководитель не видит тариф');
      check(await tab.getByRole('button', { name: 'Изменить: Денис' }).count() === 0, 'руководитель не меняет админа');
      check(await tab.getByRole('button', { name: 'Изменить: Михаил Шеф Сушеф' }).count() === 0, 'руководитель не меняет себя');
      check(await tab.getByRole('button', { name: 'Изменить: Анна' }).count() === 1, 'руководитель меняет сотрудника');
      const options = await tab.locator('#new-user-role option:not([disabled])').allTextContents();
      check(JSON.stringify(options) === JSON.stringify(['Сотрудник', 'Старший смены']), `роли руководителя: ${options.join(', ')}`);
      check(await noOverflow(tab), 'сотрудники 390: горизонтальная прокрутка');
      await tab.screenshot({ path: `${shots}/roles-lead-users-390.png`, fullPage: true });

      // ---------- 3. Задача со временем напоминания ----------
      await tab.goto(base + '/tasks/new');
      await tab.getByPlaceholder('Что нужно сделать?').waitFor();
      check(await tab.getByText('Доступ запрещен').count() === 0, 'руководитель с ролью открывает создание задачи');
      await tab.getByPlaceholder('Что нужно сделать?').fill('Принять поставку');
      await tab.getByRole('checkbox', { name: 'Анна' }).click();
      const remind = tab.getByTestId('input-remind-at');
      await remind.scrollIntoViewIfNeeded();
      await remind.fill('14:00');
      check(await noOverflow(tab), 'создание задачи 390: горизонтальная прокрутка');
      await tab.screenshot({ path: `${shots}/roles-lead-task-remind-390.png`, fullPage: true });
      await tab.getByRole('button', { name: 'Создать', exact: true }).click();
      await tab.waitForURL((u) => !u.pathname.endsWith('/tasks/new'), { timeout: 10000 }).catch(() => {});
      check(errors.length === 0, `руководитель: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 4. «Уведомления» у сотрудника, тёмная тема 360 ----------
  {
    const { context, tab, errors, fx } = await open(worker, { width: 360, height: 780 }, 'dark');
    try {
      await tab.goto(base + '/account');
      const card = tab.locator('#notifications');
      await card.getByRole('heading', { name: 'Уведомления' }).waitFor();
      check(await card.getByText('На anna@example.com').isVisible(), 'письма — на email сотрудника');
      check(await card.getByText('Задачи на проверку').count() === 0, 'сотруднику нет пункта «Задачи на проверку»');
      check(!(await card.getByRole('checkbox', { name: /Письма о новых задачах/ }).isChecked()), 'письма — по желанию, по умолчанию выключены');
      await card.getByRole('checkbox', { name: /Письма о новых задачах/ }).check();
      await tab.waitForTimeout(300);
      const put = fx.state.calls.find((c) => c.p === '/api/account/notify-prefs');
      check(put?.body?.emailNewTask === true && put?.body?.newTask === true, 'PUT notify-prefs: письма включены, остальное как было');
      check(await noOverflow(tab), 'аккаунт 360: горизонтальная прокрутка');
      await card.scrollIntoViewIfNeeded();
      await tab.screenshot({ path: `${shots}/roles-notify-dark-360.png` });
      check(errors.length === 0, `аккаунт: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'roles panel preset + employee approval, add worker with position/role, lead 390 limits, task remind time, notify prefs dark 360', failures };
}
