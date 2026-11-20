// Должностная инструкция → задачи на UI-превью:
//  1) админ на ПК: вкладки «Текст / Word / Excel» в «Добавить сотрудника»,
//     короткий текст не даёт создать человека, Excel уходит файлом после
//     создания, тост «инструкцию разбираем», статус «Задач из инструкции: 4»;
//  2) телефон 390 в тёмной теме: окно «Инструкция» у сотрудника — старый
//     .doc с подсказкой, текст уходит полем text, «Повторить» у неудачной.
// API подменён фикстурами — сервер, БД и диспетчер Ralph не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);
  const shots = 'output/playwright';
  const access = { userId: 1, kind: 'admin', roleId: null, roleName: 'Администратор', isAdmin: true, manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, requiresApproval: false, taskScope: null, reviewScope: null, reportScope: null };
  const person = (id, name, extra = {}) => ({ id, name, phone: `+7999000${String(id).padStart(4, '0')}`, isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: now - 86400 * 20, managedWorkerIds: null, position: null, hasPin: true, locationId: null, roleId: null, email: null, ...extra });
  const admin = person(1, 'Денис', { isAdmin: true, access });
  const people = [admin, person(3, 'Анна', { position: 'Повар' }), person(4, 'Борис', { position: 'Мойщик' })];
  const state = (userId, status, extra = {}) => ({ userId, status, source: 'text', fileName: null, tasksCreated: 0, error: null, updatedAt: now, ...extra });

  async function open(viewport, theme, jobStates) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    await context.addInitScript((t) => { localStorage.setItem('tf_onboarded_v1', 'true'); localStorage.setItem('theme-preference', t); }, theme);
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    const calls = [];
    const users = [...people];
    await tab.route('**/api/**', async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const raw = req.postDataBuffer();
      if (p !== '/api/events') calls.push({ method: req.method(), p, type: req.headers()['content-type'] || '', body: raw ? raw.toString('utf8') : '' });
      if (p === '/api/auth/me') return route.fulfill({ json: admin });
      if (p === '/api/users' && req.method() === 'POST') {
        const body = JSON.parse(raw.toString('utf8'));
        const created = person(9, body.name, { phone: body.phone, position: body.position });
        users.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      if (p === '/api/users') return route.fulfill({ json: users });
      if (p === '/api/companies/me') return route.fulfill({ json: { id: 1, name: 'Кафе', planInfo: { id: 'team', name: 'Стандарт', maxUsers: 30, locations: false, until: null, enforced: true }, photo: { stamp: true, cameraOnly: false }, wesetupConfigured: false, taskBonus: 0 } });
      if (p === '/api/roles') return route.fulfill({ json: { roles: [], employeeApproval: false } });
      if (p === '/api/job-descriptions') return route.fulfill({ json: { gatewayReady: true, items: jobStates() } });
      const m = p.match(/^\/api\/users\/(\d+)\/job-description(\/retry)?$/);
      if (m && req.method() === 'POST') return route.fulfill({ status: m[2] ? 200 : 202, json: { gatewayReady: true, state: state(Number(m[1]), 'queued') } });
      if (p === '/api/push/config') return route.fulfill({ json: { web: { enabled: false, publicKey: null }, apns: { enabled: false } } });
      if (p === '/api/me/telegram') return route.fulfill({ json: { connected: false, botConfigured: false } });
      if (p === '/api/app/info') return route.fulfill({ json: { android: { apk: null, playUrl: null, rustoreUrl: null }, ios: { appStoreUrl: null } } });
      if (p === '/api/events') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ json: [] });
    });
    return { context, tab, errors, calls };
  }
  const noOverflow = (tab) => tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  // ---------- 1. Админ на ПК: новый сотрудник с инструкцией ----------
  {
    let uploaded = false;
    const { context, tab, errors, calls } = await open({ width: 1280, height: 900 }, 'light', () => (uploaded ? [state(9, 'done', { source: 'xlsx', fileName: 'Обязанности.xlsx', tasksCreated: 4 })] : []));
    try {
      await tab.goto(base + '/admin/users');
      const field = tab.getByTestId('job-description');
      await field.waitFor();
      check(await field.getByRole('tab').count() === 3, 'нет трёх вкладок');
      check((await field.innerText()).includes('сами поставим сотруднику задачи'), 'нет пояснения');
      await tab.locator('input[placeholder="Телефон сотрудника"]').fill('+79995556677');
      await tab.locator('input[name="name"]').fill('Галина');
      await tab.getByTestId('job-description-text').fill('мыть');
      await tab.getByRole('button', { name: 'Добавить сотрудника' }).last().click();
      await field.getByRole('alert').waitFor();
      check(!calls.some((c) => c.p === '/api/users' && c.method === 'POST'), 'с коротким текстом человек создался');
      await tab.getByTestId('job-description-tab-xlsx').click();
      await tab.getByTestId('job-description-input').setInputFiles({ name: 'Обязанности.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK\u0003\u0004 test') });
      await tab.getByTestId('job-description-file').waitFor();
      check((await tab.getByTestId('job-description-file').innerText()).includes('Обязанности.xlsx'), 'не видно имени файла');
      await tab.screenshot({ path: `${shots}/job-description-1280.png` });
      uploaded = true;
      await tab.getByRole('button', { name: 'Добавить сотрудника' }).last().click();
      await tab.getByText('Задач из инструкции: 4').waitFor();
      const up = calls.find((c) => c.p === '/api/users/9/job-description');
      check(up && up.type.includes('multipart/form-data') && up.body.includes('filename="Обязанности.xlsx"'), `файл не ушёл: ${up?.type}`);
      check((await tab.locator('body').innerText()).includes('инструкцию разбираем'), 'нет тоста о разборе');
      check(errors.length === 0, `ПК: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // ---------- 2. Телефон, тёмная: окно «Инструкция», повтор ----------
  {
    const { context, tab, errors, calls } = await open({ width: 390, height: 844 }, 'dark', () => [state(4, 'failed', { error: 'Диспетчер Ralph не взял инструкцию за 15 минут — он запущен?' })]);
    try {
      await tab.goto(base + '/admin/users');
      await tab.getByText('Инструкцию не разобрали').waitFor();
      check((await tab.locator('body').innerText()).includes('он запущен?'), 'не видно причины');
      await tab.getByRole('button', { name: 'Повторить' }).click();
      await tab.waitForTimeout(300);
      check(calls.some((c) => c.p === '/api/users/4/job-description/retry'), 'повтор не отправился');
      await tab.getByTestId('user-job-description-3').click();
      const dialog = tab.getByTestId('job-description-dialog');
      await dialog.waitFor();
      await dialog.getByTestId('job-description-tab-docx').click();
      await dialog.getByTestId('job-description-input').setInputFiles({ name: 'Старая.doc', mimeType: 'application/msword', buffer: Buffer.from('old') });
      await dialog.getByTestId('job-description-submit').click();
      check((await dialog.getByRole('alert').innerText()).includes('Старый формат'), 'нет подсказки про .doc');
      await dialog.getByTestId('job-description-tab-text').click();
      await dialog.getByTestId('job-description-text').fill('Каждое утро принимать поставку и сверять накладную. По пятницам мыть холодильник.');
      check(await noOverflow(tab), 'горизонтальная прокрутка в окне 390');
      await tab.screenshot({ path: `${shots}/job-description-390-dark.png` });
      await dialog.getByTestId('job-description-submit').click();
      await dialog.waitFor({ state: 'detached' });
      const sent = calls.find((c) => c.p === '/api/users/3/job-description');
      check(sent && sent.body.includes('name="text"') && sent.body.includes('принимать поставку'), 'текст не ушёл полем text');
      check(errors.length === 0, `телефон: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'tabs + hint, short text blocks create, xlsx after create (multipart) + toast + done badge, 390 dark: failed reason + retry, dialog .doc hint, text field, no overflow', failures };
}
