// «Уведомление сотрудникам» на UI-превью:
//  1) админ на ПК: кнопка-колокольчик в шапке задач, выбор «Всем», заготовка
//     текста, отправка — тело запроса, итог «Дошло» и «Не дошло» с подсказкой;
//  2) руководитель на телефоне 390 и в тёмной теме 360: меню → «Уведомление
//     сотрудникам», в списке только свои люди, без себя;
//  3) «Сотрудники»: кнопка «Уведомление»; сотруднику кнопки нет.
// API подменён фикстурами — сервер и БД не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);
  const shots = 'output/playwright';
  const access = (extra) => ({ userId: 0, kind: 'employee', roleId: null, roleName: 'Сотрудник', isAdmin: false, manageTasks: false, manageUsers: false, verifyTasks: false, viewReports: false, requiresApproval: false, taskScope: [], reviewScope: [], reportScope: [], ...extra });
  const person = (id, name, extra = {}) => ({ id, name, phone: `+7999000${String(id).padStart(4, '0')}`, isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: now - 86400 * 20, managedWorkerIds: null, position: null, hasPin: true, locationId: null, roleId: null, email: null, ...extra });
  const admin = person(1, 'Денис', { isAdmin: true, access: access({ userId: 1, kind: 'admin', isAdmin: true, manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, taskScope: null, reviewScope: null, reportScope: null }) });
  const lead = person(2, 'Михаил Шеф Сушеф', { access: access({ userId: 2, kind: 'role', roleName: 'Руководитель', manageTasks: true, manageUsers: true, taskScope: [3, 4], reviewScope: [3, 4], reportScope: [3, 4] }) });
  const worker = person(3, 'Анна', { position: 'Повар', access: access({ userId: 3, taskScope: [3] }) });
  const people = [admin, lead, worker, person(4, 'Борис', { position: 'Мойщик' }), person(5, 'Вера')];
  const task = { id: 1, title: 'Протереть витрину', workerId: 3, requiresPhoto: false, photoUrl: null, photoUrls: [], examplePhotoUrls: [], isCompleted: false, weekDays: null, monthDay: null, isRecurring: true, price: 0, category: null, description: null, companyId: 1, journalLink: null, createdAt: now - 3600, completedAt: null, claimedByWorkerId: null, verificationStatus: null, verifierWorkerId: null, checklist: [], dueDate: null };

  async function open(me, viewport, theme = 'light') {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    await context.addInitScript((t) => { localStorage.setItem('tf_onboarded_v1', 'true'); localStorage.setItem('theme-preference', t); }, theme);
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    const calls = [];
    await tab.route('**/api/**', async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const body = req.postData() && (req.headers()['content-type'] || '').includes('json') ? JSON.parse(req.postData()) : null;
      if (p !== '/api/events') calls.push({ method: req.method(), p, body });
      if (p === '/api/auth/me') return route.fulfill({ json: me });
      if (p === '/api/users') return route.fulfill({ json: people });
      if (p === '/api/companies/me') return route.fulfill({ json: { id: 1, name: 'Кафе', planInfo: { id: 'team', name: 'Стандарт', maxUsers: 30, locations: false, until: null, enforced: true }, photo: { stamp: true, cameraOnly: false }, wesetupConfigured: false, taskBonus: 0 } });
      if (p === '/api/tasks') return route.fulfill({ json: [task] });
      if (p === '/api/roles') return route.fulfill({ json: { roles: [], employeeApproval: false } });
      if (p === '/api/notifications/reach') return route.fulfill({ json: people.filter((u) => u.id !== me.id).map((u) => ({ id: u.id, devices: u.id === 3 ? 1 : 0, telegram: u.id === 4 })) });
      if (p === '/api/notifications/send') {
        const pick = people.filter((u) => body.userIds.includes(u.id));
        return route.fulfill({ json: { delivered: pick.slice(0, -1).map((u) => ({ id: u.id, name: u.name, channels: u.id === 3 ? ['push', 'telegram'] : ['push'] })), unreachable: pick.slice(-1).map((u) => ({ id: u.id, name: u.name, channels: [], reason: 'no-device', telegram: false })) } });
      }
      if (p === '/api/push/config') return route.fulfill({ json: { web: { enabled: true, publicKey: 'BCYEmp1hk_80I1M2-FtEbDgNzXdPmkQ-c3FH5a7f2hYvmuWLhZQxB1T6n9A0JP-uq86Ij54jVi8mOZ9BeeS-6LM' }, apns: { enabled: false } } });
      if (p === '/api/me/telegram') return route.fulfill({ json: { connected: false, botConfigured: false } });
      if (p === '/api/app/info') return route.fulfill({ json: { android: { apk: null, playUrl: null, rustoreUrl: null }, ios: { appStoreUrl: null } } });
      if (p === '/api/events') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ json: [] });
    });
    return { context, tab, errors, calls };
  }
  const noOverflow = (tab) => tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  // ---------- 1. Админ на ПК ----------
  {
    const { context, tab, errors, calls } = await open(admin, { width: 1280, height: 900 });
    try {
      await tab.goto(base + '/dashboard');
      await tab.getByTestId('header-broadcast').click();
      const dialog = tab.getByTestId('broadcast-dialog');
      await dialog.waitFor();
      check(await dialog.getByRole('checkbox', { name: 'Денис' }).count() === 0, 'себе писать нельзя');
      check(await dialog.getByRole('checkbox').count() === 4, `админ видит ${await dialog.getByRole('checkbox').count()}, ждали 4`);
      check(await dialog.getByTestId('broadcast-send').isDisabled(), 'отправка без людей и текста');
      // Состояние связи видно заранее: у Веры нет уведомлений.
      const vera = dialog.getByRole('checkbox', { name: 'Вера' });
      await vera.locator('.broadcast-reach.is-off').waitFor();
      check((await dialog.getByRole('checkbox', { name: 'Анна' }).innerText()).includes('телефон'), 'у Анны не видно телефона');
      check((await dialog.getByRole('checkbox', { name: 'Борис' }).innerText()).includes('Telegram'), 'у Бориса не видно Telegram');
      await dialog.getByTestId('broadcast-all').click();
      await dialog.getByRole('button', { name: 'Проверьте невыполненные задачи перед уходом' }).click();
      check((await dialog.innerText()).includes('уведомления не включены — им не придёт'), 'нет предупреждения до отправки');
      check(await dialog.getByTestId('broadcast-text').inputValue() === 'Проверьте невыполненные задачи перед уходом', 'заготовка не подставилась');
      await tab.screenshot({ path: `${shots}/broadcast-admin-1280.png` });
      await dialog.getByTestId('broadcast-send').click();
      await dialog.getByTestId('broadcast-unreachable').waitFor();
      const sent = calls.find((c) => c.p === '/api/notifications/send');
      check(JSON.stringify(sent?.body) === JSON.stringify({ userIds: [2, 3, 4, 5], text: 'Проверьте невыполненные задачи перед уходом' }), `тело ${JSON.stringify(sent?.body)}`);
      check((await dialog.innerText()).includes('Дошло: 3 человека'), 'нет итога «Дошло»');
      check((await dialog.getByTestId('broadcast-unreachable').innerText()).includes('Вера'), 'нет «Не дошло: Вера»');
      check((await dialog.getByTestId('broadcast-unreachable').innerText()).includes('уведомления TasksFlow на телефоне не включены'), 'нет причины «не дошло»');
      await tab.screenshot({ path: `${shots}/broadcast-result-1280.png` });
      await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      check(errors.length === 0, `админ: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 2. Руководитель на телефоне ----------
  for (const [viewport, theme, name] of [[{ width: 390, height: 844 }, 'light', '390'], [{ width: 360, height: 780 }, 'dark', 'dark-360']]) {
    const { context, tab, errors, calls } = await open(lead, viewport, theme);
    try {
      await tab.goto(base + '/dashboard');
      await tab.locator('button[aria-expanded]').first().click();
      // В меню — настоящий переключатель уведомлений, отдельно от звука.
      const pushToggle = tab.getByTestId('menu-push-toggle');
      await pushToggle.waitFor();
      check((await pushToggle.innerText()).includes('Уведомления на телефоне'), `${name}: нет переключателя уведомлений`);
      check(await tab.getByRole('switch', { name: 'Звук и вибрация при «Готово»' }).count() === 1, `${name}: звук не переименован`);
      await tab.screenshot({ path: `${shots}/broadcast-menu-${name}.png` });
      await tab.getByTestId('menu-broadcast').click();
      const dialog = tab.getByTestId('broadcast-dialog');
      await dialog.waitFor();
      const names = await dialog.getByRole('checkbox').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
      check(JSON.stringify(names) === JSON.stringify(['Анна', 'Борис']), `${name}: руководитель видит ${names.join(', ')}`);
      await dialog.getByRole('checkbox', { name: 'Анна' }).click();
      await dialog.getByTestId('broadcast-text').fill('Срочно подойдите на кухню');
      check(await noOverflow(tab), `${name}: горизонтальная прокрутка`);
      await tab.screenshot({ path: `${shots}/broadcast-lead-${name}.png` });
      await dialog.getByTestId('broadcast-send').click();
      await dialog.getByText(/Не дошло|Дошло/).first().waitFor();
      check(calls.some((c) => c.p === '/api/notifications/send' && c.body.userIds.join() === '3'), `${name}: запрос не ушёл`);
      check(errors.length === 0, `${name}: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 3. «Сотрудники» и сотрудник ----------
  {
    const { context, tab, errors } = await open(admin, { width: 390, height: 844 });
    try {
      await tab.goto(base + '/admin/users');
      await tab.getByTestId('users-broadcast').click();
      await tab.getByTestId('broadcast-dialog').waitFor();
      check(errors.length === 0, `сотрудники: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }
  {
    const { context, tab, errors } = await open(worker, { width: 390, height: 844 });
    try {
      await tab.goto(base + '/dashboard');
      await tab.locator('.task-card').first().waitFor();
      check(await tab.getByTestId('header-broadcast').count() === 0, 'у сотрудника есть кнопка рассылки');
      check(errors.length === 0, `сотрудник: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'admin header bell → all + preset + send body + delivered/unreachable, lead 390/dark-360 via menu: own people only, users page button, no button for worker', failures };
}
