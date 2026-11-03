// Вход под сотрудником и возврат; ПК / 360–390px, обе темы, ошибки API,
// общий вход в двух вкладках, отсутствие данных руководителя после смены.
// API подменён: настоящую авторизацию проверяет tests/impersonation.test.ts.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  const access = (id, extra = {}) => ({ userId: id, kind: 'employee', roleId: null, roleName: 'Сотрудник', isAdmin: false, manageTasks: false, manageUsers: false, verifyTasks: false, viewReports: false, requiresApproval: false, taskScope: [id], reviewScope: [], reportScope: [id], ...extra });
  const worker = { id: 7, name: 'Александра Константиновна Александрова', phone: '+79990000007', companyId: 42, isAdmin: false, hasPin: true, bonusBalance: 0, createdAt: 1, access: access(7) };
  const company = { id: 42, name: 'Кафе', wesetupConfigured: false, employeeApproval: false, planInfo: { id: 'team', name: 'Стандарт', maxUsers: 30, until: null, enforced: true }, photo: { stamp: false, cameraOnly: false } };
  const variants = [
    { width: 1280, theme: 'light', kind: 'admin' },
    { width: 1280, theme: 'dark', kind: 'admin' },
    { width: 360, theme: 'light', kind: 'manager' },
    { width: 390, theme: 'dark', kind: 'role' },
    { width: 1280, theme: 'light', kind: 'admin', targetAdmin: true },
    { width: 390, theme: 'dark', kind: 'admin', targetAdmin: true },
  ];
  for (const variant of variants) {
    const { width, theme, kind } = variant;
    const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript((theme) => {
      localStorage.setItem('theme-preference', theme);
      localStorage.setItem('tf_onboarded_v1', 'true');
    }, theme);
    const actor = { ...worker, id: 1, name: 'Руководитель', isAdmin: kind === 'admin', managedWorkerIds: kind === 'manager' ? '[7]' : null,
      access: access(1, kind === 'admin'
        ? { kind, isAdmin: true, roleName: 'Администратор', manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, taskScope: null, reviewScope: null, reportScope: null }
        : kind === 'manager'
          ? { kind, roleName: 'Руководитель', manageTasks: true, verifyTasks: true, taskScope: [1, 7], reviewScope: [7], reportScope: [1, 7] }
          : { kind, roleName: 'Руководитель', manageTasks: true, manageUsers: true, verifyTasks: true, taskScope: null, reviewScope: null }) };
    const target = variant.targetAdmin
      ? { ...worker, id: 11, name: 'Другой администратор', isAdmin: true, access: { ...actor.access, userId: 11 } }
      : worker;
    const shotSuffix = `${width}-${theme}${variant.targetAdmin ? '-admin' : ''}`;
    let preview = false;
    let startFailed = width === 1280 && theme === 'light';
    let stopFailed = true;
    let posts = 0;
    let authReads = 0;
    let releaseStart;
    let startRequested;
    const starting = new Promise((resolve) => { startRequested = resolve; });
    const errors = [];
    await context.route('**/api/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path === '/api/auth/me') {
        authReads += 1;
        return route.fulfill({ json: preview ? { ...target, impersonation: { actorId: 1, readOnly: true } } : actor });
      }
      if (path === '/api/auth/impersonate') {
        posts += 1;
        check(req.postDataJSON().userId === target.id, 'в запросе неверный сотрудник');
        if (startFailed) { startFailed = false; return route.fulfill({ status: 403, json: { message: 'Просмотр этого аккаунта недоступен' } }); }
        await new Promise((resolve) => { releaseStart = resolve; startRequested(); });
        preview = true;
        return route.fulfill({ json: { success: true } });
      }
      if (path === '/api/auth/impersonate/stop') {
        if (stopFailed) { stopFailed = false; return route.fulfill({ status: 500, json: { message: 'Не удалось вернуться. Повторите попытку.' } }); }
        preview = false;
        return route.fulfill({ json: { success: true } });
      }
      if (path === '/api/users') return route.fulfill({ json: preview ? [target] : [actor, { ...target, canImpersonate: true }] });
      if (path === '/api/companies/me') return route.fulfill({ json: company });
      if (path === '/api/roles') return route.fulfill({ json: { roles: [], employeeApproval: false } });
      if (path === '/api/push/config') return route.fulfill({ json: { web: { enabled: false }, apns: { enabled: false } } });
      if (path === '/api/me/telegram') return route.fulfill({ json: { connected: false, botConfigured: false } });
      if (path === '/api/app/info') return route.fulfill({ json: { android: {}, ios: {} } });
      return route.fulfill({ json: [] });
    });
    const tab = await context.newPage();
    tab.on('pageerror', (error) => errors.push(error.message));
    tab.setDefaultTimeout(10_000);
    let stage = 'список сотрудников';
    try {
      await tab.goto(base + '/admin/users');
      const enter = tab.getByRole('button', { name: `Войти как сотрудник: ${target.name}`, exact: true });
      await enter.waitFor();
      check(await tab.getByRole('button', { name: /Войти как сотрудник:/ }).count() === 1, 'кнопка входа должна быть только у доступного сотрудника');
      if (kind === 'manager') check(await tab.getByRole('heading', { name: 'Добавить сотрудника' }).count() === 0, 'WeSetup-руководителю показана форма добавления');
      await tab.screenshot({ path: `output/playwright/impersonation-users-${shotSuffix}.png`, fullPage: true });
      if (startFailed) {
        await enter.click();
        await tab.getByText('Просмотр этого аккаунта недоступен', { exact: true }).waitFor();
        check(new URL(tab.url()).pathname === '/admin/users', 'ошибка входа увела со списка');
      }
      // Вторая вкладка должна обновиться: cookie сессии общая для всего origin.
      const other = await context.newPage();
      await other.goto(base + '/dashboard');
      await other.locator('.cabinet-frame[data-cabinet-frame]').waitFor();
      const readsBefore = authReads;
      stage = 'вход в основной вкладке';
      await enter.click();
      await tab.getByText('Открываем…', { exact: true }).waitFor();
      check(await enter.isDisabled(), 'повторный вход доступен во время запроса');
      await starting;
      releaseStart();
      await tab.waitForURL('**/dashboard');
      const banner = tab.getByRole('region', { name: 'Просмотр кабинета сотрудника' });
      await banner.waitFor();
      stage = 'обновление второй вкладки';
      await other.getByRole('region', { name: 'Просмотр кабинета сотрудника' }).waitFor();
      check(authReads >= readsBefore + 2, 'другая вкладка сохранила прежний аккаунт');
      check(await banner.innerText().then((text) => text.includes(target.name) && text.includes('Только просмотр')), 'непонятно, кто вошёл и какие ограничения');
      check(await tab.locator('.app-sidebar').getByRole('link', { name: 'Сотрудники', exact: true }).count() === (target.isAdmin && width >= 1024 ? 1 : 0), 'меню не соответствует правам просматриваемого аккаунта');
      check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `горизонтальная прокрутка: ${width} ${theme}`);
      await tab.screenshot({ path: `output/playwright/impersonation-preview-${shotSuffix}.png`, fullPage: true });
      stage = 'переход в аккаунт';
      await tab.goto(base + '/account');
      await banner.waitFor();
      const back = banner.getByRole('button', { name: 'Вернуться в свой аккаунт', exact: true });
      await back.click();
      stage = 'ошибка возврата';
      await banner.getByRole('alert').waitFor();
      check(preview, 'ошибка возврата уничтожила режим просмотра');
      await back.focus();
      await tab.keyboard.press('Enter');
      stage = 'возврат';
      await tab.waitForURL(`**/admin/users?user=${target.id}`);
      await enter.waitFor();
      await other.getByRole('region', { name: 'Просмотр кабинета сотрудника' }).waitFor({ state: 'hidden' });
      check(await banner.count() === 0, 'после возврата осталась плашка');
      check(posts >= 1, 'запрос входа не отправлен');
      check(errors.length === 0, errors.join('; '));
      await other.close();
    } catch (error) {
      await tab.screenshot({ path: `output/playwright/impersonation-failed-${shotSuffix}.png`, fullPage: true }).catch(() => {});
      throw new Error(`${width}px ${theme} ${kind}, ${stage}, ${tab.url()}: ${error.message}`);
    } finally { await context.close(); }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return { variants: variants.length, ok: true };
}
