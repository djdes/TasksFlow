// PIN-вход на UI-превью: первый вход с созданием PIN, ошибка и блокировка,
// PIN от руководителя, регистрация с согласием, вход из формы лендинга.
// API подменён фикстурами — сервер, БД и реальная проверка PIN не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  const worker = { id: 7, name: 'Сергей', phone: '+79991234567', isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: 1, managedWorkerIds: null, hasPin: true };
  const admin = { id: 1, name: 'Ирина', phone: '+79990000001', isAdmin: true, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: 1, managedWorkerIds: null, hasPin: true };

  async function open(viewport, handler, run) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const p = await context.newPage();
    p.setDefaultTimeout(10000);
    const errors = [];
    p.on('pageerror', (error) => errors.push(error.message));
    await p.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postData() ? JSON.parse(request.postData()) : null;
      const response = await handler(path, request.method(), body);
      if (response) return route.fulfill(response);
      return route.fulfill({ json: path === '/api/companies/me' ? { id: 1, wesetupConfigured: false } : [] });
    });
    try {
      await run(p);
      check(errors.length === 0, 'Browser errors: ' + errors.join('; '));
    } finally {
      await context.close();
    }
  }

  // Первый вход: простой PIN отклоняется, затем придумать и повторить.
  for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
    let authed = false;
    const logins = [];
    await open(viewport, async (path, method, body) => {
      if (path === '/api/auth/me') return authed ? { json: worker } : { status: 401, json: { message: 'Not authenticated' } };
      if (path === '/api/auth/login') {
        logins.push(body);
        if (!body.pin) return { json: { step: 'setup' } };
        authed = true;
        return { json: worker };
      }
      return null;
    }, async (p) => {
      await p.goto(base + '/login');
      await p.locator('input[type="tel"]').fill('9991234567');
      await p.locator('button[type="submit"]').click();
      await p.getByText('Придумайте PIN', { exact: true }).waitFor();
      await p.keyboard.type('1234');
      await p.getByText(/подряд/).waitFor();
      await p.screenshot({ path: `output/playwright/pin-${label}-setup-weak.png` });
      await p.keyboard.type('4826');
      await p.getByText('Повторите PIN', { exact: true }).waitFor();
      await p.keyboard.type('4826');
      await p.waitForURL('**/dashboard');
      check(logins.length === 2 && logins[0].pin === undefined && logins[1].pin === '4826', `${label}: login payloads ${JSON.stringify(logins)}`);
    });
  }

  // Ошибка с остатком попыток; поле не теряет фокус; блокировка с отсчётом.
  let attempts = 0;
  await open({ width: 390, height: 844 }, async (path, method, body) => {
    if (path === '/api/auth/me') return { status: 401, json: { message: 'Not authenticated' } };
    if (path === '/api/auth/login') {
      if (!body.pin) return { json: { step: 'pin' } };
      attempts++;
      if (attempts === 1) return { status: 401, json: { message: 'Неверный PIN', field: 'pin', attemptsLeft: 4 } };
      return { status: 429, headers: { 'Retry-After': '900' }, json: { message: 'Слишком много попыток. Вход заблокирован на 15 мин', field: 'pin', retryAfterSec: 900, attemptsLeft: 0 } };
    }
    return null;
  }, async (p) => {
    await p.goto(base + '/login');
    await p.locator('input[type="tel"]').fill('9991234567');
    await p.locator('button[type="submit"]').click();
    await p.getByText('Введите PIN', { exact: true }).waitFor();
    await p.keyboard.type('1357');
    await p.getByText('Неверный PIN. Осталось попыток: 4', { exact: true }).waitFor();
    await p.keyboard.type('2468');
    await p.getByText(/Повторите через 1[45]:\d\d/).waitFor();
    await p.screenshot({ path: 'output/playwright/pin-mobile-locked.png' });
    check(attempts === 2, `PIN input lost focus after an error: ${attempts} attempts`);
    check(await p.locator('input[autocomplete="off"]').first().isDisabled(), 'PIN input is enabled while locked');
  });

  // Руководитель: PIN при создании, статусы в списке, новый PIN и сброс.
  const created = [];
  const pinCalls = [];
  const list = [admin, { ...worker, hasPin: false }, { ...worker, id: 8, name: 'Ольга', phone: '+79995554433', pinLocked: true }];
  await open({ width: 1280, height: 900 }, async (path, method, body) => {
    if (path === '/api/auth/me') return { json: admin };
    if (path === '/api/users' && method === 'GET') return { json: list };
    if (path === '/api/users' && method === 'POST') { created.push(body); return { status: 201, json: { ...worker, id: 9, ...body } }; }
    if (/^\/api\/users\/\d+\/pin$/.test(path)) { pinCalls.push({ path, method, body }); return { json: { ...worker, hasPin: method === 'POST' } }; }
    return null;
  }, async (p) => {
    await p.goto(base + '/admin/users');
    const pin = p.getByLabel('PIN для входа');
    await pin.waitFor();
    check(/^\d{4}$/.test(await pin.inputValue()), 'Create form has no generated PIN');
    await p.locator('input[type="tel"]').first().fill('9997776655');
    await pin.fill('1111');
    await p.getByRole('button', { name: 'Создать пользователя' }).click();
    await p.getByText(/одинаковые/).waitFor();
    check(created.length === 0, 'Weak PIN reached the API');
    await pin.fill('5830');
    await p.getByRole('button', { name: 'Создать пользователя' }).click();
    await p.getByText(/сообщите его сотруднику/).waitFor();
    check(created[0]?.pin === '5830' && created[0]?.phone === '+79997776655', `Create payload ${JSON.stringify(created)}`);
    check(await p.getByText('Без PIN', { exact: true }).count() === 1, 'No "Без PIN" status');
    check(await p.getByText('Вход заблокирован', { exact: true }).count() === 1, 'No locked status');
    await p.getByRole('button', { name: 'PIN: Ольга' }).click();
    await p.getByRole('button', { name: 'Сохранить PIN' }).click();
    await p.getByText(/сообщите его сотруднику/).nth(1).waitFor();
    check(pinCalls[0]?.path === '/api/users/8/pin' && /^\d{4}$/.test(pinCalls[0]?.body?.pin ?? ''), `Set PIN ${JSON.stringify(pinCalls)}`);
    await p.screenshot({ path: 'output/playwright/pin-admin-users.png', fullPage: true });
    await p.getByRole('button', { name: 'Готово' }).nth(1).click();
    await p.getByRole('button', { name: 'PIN: Ольга' }).click();
    await p.getByRole('button', { name: /Сбросить — придумает сам/ }).click();
    await p.getByText('PIN сброшен', { exact: true }).waitFor();
    check(pinCalls[1]?.method === 'DELETE', `Clear PIN ${JSON.stringify(pinCalls)}`);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.getByRole('button', { name: 'PIN: Сергей' }).click();
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admin users overflow at 390px');
  });

  // Регистрация компании: без согласия дальше нельзя, затем PIN.
  const regs = [];
  await open({ width: 390, height: 844 }, async (path, method, body) => {
    if (path === '/api/auth/me') return { status: 401, json: { message: 'Not authenticated' } };
    if (path === '/api/companies/register') { regs.push(body); return { status: 201, json: admin }; }
    return null;
  }, async (p) => {
    await p.goto(base + '/register/company?phone=%2B79990000001');
    await p.getByPlaceholder('ИП Иванов Иван').fill('Кафе «Ромашка»');
    await p.getByPlaceholder('admin@company.ru').fill('owner@example.com');
    await p.getByRole('button', { name: 'Далее — придумать PIN' }).click();
    await p.getByText('Отметьте согласие, чтобы продолжить').waitFor();
    await p.getByRole('checkbox').first().check();
    await p.getByRole('button', { name: 'Далее — придумать PIN' }).click();
    await p.getByText('Придумайте PIN', { exact: true }).waitFor();
    await p.keyboard.type('4826');
    await p.getByText('Повторите PIN', { exact: true }).waitFor();
    await p.keyboard.type('4826');
    await p.waitForURL('**/dashboard');
    check(regs[0]?.pin === '4826' && regs[0]?.consent === true, `Register payload ${JSON.stringify(regs)}`);
  });

  // Форма лендинга: телефон → PIN в той же шторке.
  const landingLogins = [];
  await open({ width: 390, height: 844 }, async (path, method, body) => {
    if (path === '/api/auth/me') return { status: 401, json: { message: 'Not authenticated' } };
    if (path === '/api/auth/login') { landingLogins.push(body); return body.pin ? { json: worker } : { json: { step: 'pin' } }; }
    return null;
  }, async (p) => {
    await p.goto(base + '/');
    await p.getByRole('button', { name: 'Войти', exact: true }).first().click();
    const dialog = p.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByPlaceholder('Телефон или email').fill('+79991234567');
    await dialog.locator('button[type="submit"]').first().click();
    await dialog.getByText('Введите PIN', { exact: true }).waitFor();
    await p.screenshot({ path: 'output/playwright/pin-landing.png' });
    await p.keyboard.type('4826');
    await p.waitForURL('**/dashboard');
    check(landingLogins.at(-1)?.pin === '4826', `Landing login ${JSON.stringify(landingLogins)}`);
  });

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'first-login PIN setup (desktop, 390px), wrong PIN keeps focus, lock countdown, admin PIN create/set/reset, registration consent + PIN, landing PIN step', failures };
}
