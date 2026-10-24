// Меню кабинета слева на ПК (как в WeSetup) и быстрый переход Ctrl+K: разделы
// по ролям, текущий подсвечен, счётчик «На проверке», тариф, горячие клавиши,
// тема, ширины 1024/1023/390 и тёмная тема. API подменён — сервер и БД не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  const admin = { id: 1, name: 'Анна Смирнова', phone: '+79990000001', email: 'anna@cafe.test', isAdmin: true, isRoot: true, createdAt: 1, bonusBalance: 0, companyId: 1, managedWorkerIds: null, hasPin: true };
  const worker = { id: 2, name: 'Иван Петров', phone: '+79990000002', email: null, isAdmin: false, isRoot: false, createdAt: 1, bonusBalance: 0, companyId: 1, managedWorkerIds: null, hasPin: true, position: 'Повар' };
  const task = (id, title, extra = {}) => ({
    id, title, workerId: 2, requiresPhoto: false, photoUrl: null, photoUrls: [], examplePhotoUrl: null, examplePhotoUrls: [], isCompleted: false,
    weekDays: [0, 1, 2, 3, 4, 5, 6], monthDay: null, isRecurring: true, price: 0, category: 'Смена', description: null, companyId: 1, journalLink: null,
    createdAt: now, completedAt: null, checklist: [], verificationStatus: null, dueDate: null, ...extra,
  });
  const tasks = [task(1, 'Открыть смену'), task(2, 'Проверить витрину')];
  // Шестеро и больше — у списка сотрудников появляется поиск.
  const extraPeople = ['Ольга Смирнова', 'Денис Орлов', 'Мария Ким', 'Пётр Лебедев', 'Ирина Белова'].map((name, i) => ({ ...worker, id: 10 + i, name, phone: `+7999111223${i}`, position: 'Бариста' }));
  const awaiting = [task(3, 'Фото склада', { verificationStatus: 'submitted', isCompleted: true }), task(4, 'Фото кухни', { verificationStatus: 'submitted', isCompleted: true })];

  async function open(user, { width = 1440, height = 900, planUntil = now + 3 * DAY } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('tf_onboarded_v1', 'true');
      localStorage.setItem('theme-preference', 'light');
    });
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const errors = [];
    const calls = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p !== '/api/events') calls.push(p);
      let data = [];
      if (p === '/api/auth/me') data = user;
      else if (p === '/api/tasks') data = tasks;
      else if (p === '/api/tasks/awaiting-verification') data = awaiting;
      else if (p === '/api/users') data = [admin, worker, ...extraPeople];
      else if (p === '/api/workers') data = [{ id: 2, name: worker.name, companyId: 1 }];
      else if (/^\/api\/workers\/\d+$/.test(p)) data = { id: 2, name: worker.name, companyId: 1 };
      else if (/^\/api\/tasks\/\d+$/.test(p)) data = tasks[0];
      else if (/^\/api\/users\/\d+$/.test(p)) data = worker;
      else if (p === '/api/companies/me') data = { id: 1, name: 'Кафе «Ромашка»', planInfo: { id: 'team', name: 'Команда', until: planUntil }, photo: null };
      else if (p === '/api/me/telegram') data = { connected: false, botConfigured: false };
      else if (p === '/api/app/info') data = { android: { apk: null, playUrl: null, rustoreUrl: null }, ios: { appStoreUrl: null, testflightUrl: null } };
      else if (p.includes('/wesetup/')) data = { enabled: false, ok: false, configured: false };
      await route.fulfill({ json: data });
    });
    return { context, tab, errors, calls };
  }
  const sidebarOf = (tab) => tab.getByRole('complementary', { name: 'Меню кабинета' });

  // 1. ПК, админ и root: панель, разделы по группам, счётчик, тариф скоро кончится.
  {
    const { context, tab, errors } = await open(admin);
    try {
      await tab.goto(base + '/dashboard');
      await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
      const sidebar = sidebarOf(tab);
      await sidebar.waitFor();
      await sidebar.getByText('Кафе «Ромашка»').waitFor();
      check(await sidebar.locator('.app-sidebar-plan.is-warn').count() === 1, 'plan ending soon is not highlighted');
      const labels = await sidebar.getByRole('navigation', { name: 'Разделы' }).getByRole('link').allInnerTexts();
      const names = labels.map((t) => t.replace(/\s*\d+$/, '').trim());
      check(JSON.stringify(names) === JSON.stringify(['Задачи', 'На проверке', 'История и отчёты', 'Сотрудники', 'Приглашения', 'Настройки', 'Тариф и оплата', 'Компании и тарифы', 'Промо-баннеры', 'Помощь']), `admin nav ${JSON.stringify(names)}`);
      check(await sidebar.getByRole('link', { name: 'Задачи', exact: true }).getAttribute('aria-current') === 'page', 'Задачи not active on /dashboard');
      await sidebar.getByLabel('2 ждут проверки').waitFor();
      // Вкладка: раздел и число ждущих проверки — видно и в фоне.
      check(await tab.title() === '(2) Задачи · TasksFlow', `tab title ${await tab.title()}`);
      // Tab с начала страницы — «К содержимому», Enter — фокус на странице, мимо меню.
      await tab.reload();
      await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
      await tab.keyboard.press('Tab');
      check(await tab.evaluate(() => document.activeElement?.textContent) === 'К содержимому', `skip link is not first: ${await tab.evaluate(() => document.activeElement?.outerHTML.slice(0, 160))}`);
      await tab.keyboard.press('Enter');
      check(await tab.evaluate(() => document.activeElement?.id) === 'cabinet-content', 'skip link did not move focus');
      check(await tab.getByRole('button', { name: 'Меню', exact: true }).isHidden(), 'burger visible on desktop');
      check(await sidebar.getByRole('link', { name: /Создать задачу/ }).count() === 1, 'create action missing');
      const box = await sidebar.boundingBox();
      check(box && box.x === 0 && Math.abs(box.width - 256) < 1 && box.height >= 899, `sidebar box ${JSON.stringify(box)}`);
      await tab.screenshot({ path: 'output/playwright/sidebar-dashboard.png' });

      // Переход по разделу: адрес, подсветка; «К задачам» на ПК не нужен.
      await sidebar.getByRole('link', { name: 'Сотрудники', exact: true }).click();
      await tab.waitForURL('**/admin/users');
      check(await sidebar.getByRole('link', { name: 'Сотрудники', exact: true }).getAttribute('aria-current') === 'page', 'Сотрудники not active');
      check(await tab.locator('.page-back[data-home-back]').first().isHidden(), 'home back button visible next to sidebar');
      check(await tab.title() === '(2) Сотрудники · TasksFlow', `users tab title ${await tab.title()}`);
      // Старый адрес правки — в «Сотрудники», раздел подсвечен.
      await tab.goto(base + '/workers/2/edit');
      await tab.waitForURL('**/admin/users');
      await sidebar.getByRole('link', { name: 'Сотрудники', exact: true }).and(tab.locator('[aria-current="page"]')).waitFor();

      // Прокрутка страницы: панель стоит на месте.
      await tab.goto(base + '/help');
      await tab.locator('#root').evaluate((el) => { el.scrollTop = 800; });
      const after = await sidebar.boundingBox();
      check(after && after.y === 0, `sidebar scrolled away: ${JSON.stringify(after)}`);

      // Ctrl+K: раздел по слову из ключевых.
      await tab.keyboard.press('Control+k');
      const palette = tab.getByRole('dialog');
      await palette.getByRole('combobox', { name: 'Быстрый переход' }).waitFor();
      await tab.keyboard.type('пин');
      const found = await palette.getByRole('option').allInnerTexts();
      check(found.length === 3 && found[0].includes('Сотрудники') && found[1].includes('Мой аккаунт') && found[2].includes('Добавить сотрудника'), `palette keyword search ${JSON.stringify(found)}`);
      await palette.evaluate((el) => Promise.allSettled(el.getAnimations().map((a) => a.finished)));
      await tab.screenshot({ path: 'output/playwright/sidebar-palette.png' });
      await tab.keyboard.press('ArrowDown');
      await tab.keyboard.press('Enter');
      await tab.waitForURL('**/account');
      await palette.waitFor({ state: 'hidden' });
      // Аккаунт в панели — один: блок с именем внизу, он и подсвечен.
      check(await sidebar.locator('a[href="/account"]').count() === 1, 'single account link in sidebar');
      check(await sidebar.getByRole('link', { name: /^Мой аккаунт:/ }).getAttribute('aria-current') === 'page', 'account block current on /account');
      await tab.getByRole('switch', { name: 'Звук и вибрация' }).waitFor();
      check(await tab.getByText('Что-то пошло не так').count() === 0, 'account page crashed');
      // Сотрудник по имени, стрелки и Enter.
      await tab.keyboard.press('Control+k');
      await palette.getByRole('combobox', { name: 'Быстрый переход' }).waitFor();
      await tab.keyboard.type('иван');
      await palette.getByRole('option', { name: /Иван Петров/ }).waitFor();
      await tab.keyboard.press('Enter');
      // Человек — в «Сотрудниках»: строка подсвечена и в фокусе.
      await tab.waitForURL('**/admin/users?user=2');
      await palette.waitFor({ state: 'hidden' });
      await tab.locator('[data-user-row="2"].is-highlighted').waitFor();
      check(await tab.evaluate(() => document.activeElement?.getAttribute('data-user-row')) === '2', 'found person row not focused');
      // Имя крупно, телефон группами; поиск по имени и по цифрам телефона.
      const row = tab.locator('[data-user-row="2"]');
      check((await row.innerText()).includes('+7 999 000-00-02 · Повар'), `person row text ${await row.innerText()}`);
      const search = tab.getByRole('searchbox', { name: 'Найти сотрудника' });
      await search.fill('орлов');
      check(await tab.locator('[data-user-row]').count() === 1, 'search by name');
      for (const phone of ['00002', '000-00-02', '89990000002']) {
        await search.fill(phone);
        check(await tab.locator('[data-user-row]').count() === 1 && await row.count() === 1, `search by phone ${phone}`);
      }
      await search.fill('кассир');
      await tab.getByText('Никого не нашли', { exact: false }).waitFor();
      await search.fill('');
      // Удаление — через наше окно, а не confirm() браузера; «Отмена» ничего не трогает.
      await tab.getByRole('button', { name: 'Удалить: Иван Петров' }).click();
      const confirmBox = tab.getByRole('dialog');
      await confirmBox.getByText('Удалить Иван Петров?').waitFor();
      await confirmBox.getByRole('button', { name: 'Отмена' }).click();
      await confirmBox.waitFor({ state: 'hidden' });
      await tab.screenshot({ path: 'output/playwright/sidebar-users.png' });
      // Поиск на странице не прячет человека, выбранного в быстром переходе.
      await search.fill('орлов');
      await tab.keyboard.press('Control+k');
      await palette.getByRole('combobox', { name: 'Быстрый переход' }).waitFor();
      await tab.keyboard.type('ирина');
      await palette.getByRole('option', { name: /Ирина Белова/ }).waitFor();
      await tab.keyboard.press('Enter');
      await tab.waitForURL('**/admin/users?user=14');
      await tab.locator('[data-user-row="14"].is-highlighted').waitFor();
      check(await search.inputValue() === '', 'page search kept hiding the chosen person');
      // «Добавить сотрудника» — курсор сразу в телефоне.
      await tab.keyboard.press('Control+k');
      await palette.getByRole('combobox', { name: 'Быстрый переход' }).waitFor();
      await tab.keyboard.type('добавить сотр');
      await tab.keyboard.press('Enter');
      await tab.waitForURL('**/admin/users?add=1');
      await tab.waitForFunction(() => document.activeElement?.getAttribute('type') === 'tel');
      // Старый адрес создания ведёт туда же.
      await tab.goto(base + '/workers/new');
      await tab.waitForURL('**/admin/users?add=1');
      // На форме правки N не уводит с несохранённых изменений.
      await tab.goto(base + '/tasks/1/edit');
      await tab.getByRole('heading', { level: 1 }).first().waitFor();
      await tab.locator('body').click({ position: { x: 700, y: 10 } });
      await tab.keyboard.press('n');
      await tab.waitForTimeout(300);
      check(new URL(tab.url()).pathname === '/tasks/1/edit', `N left the edit form: ${tab.url()}`);
      check(await tab.title() === '(2) Задача · TasksFlow', `edit tab title ${await tab.title()}`);
      // Пусто — понятный текст; Esc закрывает.
      await tab.keyboard.press('Control+k');
      await palette.getByRole('combobox', { name: 'Быстрый переход' }).waitFor();
      await tab.keyboard.type('абракадабра');
      await palette.getByText('Ничего не нашли').waitFor();
      await tab.keyboard.press('Escape');
      await palette.waitFor({ state: 'hidden' });

      // N — новая задача (не в поле ввода).
      await tab.goto(base + '/dashboard');
      await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
      await tab.locator('body').click({ position: { x: 700, y: 10 } });
      await tab.keyboard.press('n');
      await tab.waitForURL('**/tasks/new');
      // Один шаг истории: «Назад» сразу на задачи (раньше N ловили два обработчика).
      await tab.goBack();
      await tab.waitForURL('**/dashboard');
      await tab.goForward();
      await tab.waitForURL('**/tasks/new');
      check(await sidebar.getByRole('link', { name: /Создать задачу/ }).getAttribute('aria-current') === 'page', 'create action not marked on /tasks/new');
      check(await sidebar.locator('[aria-current="page"]').count() === 1, 'only the create action is current on /tasks/new');
      // Расписание словами: дни меняют сводку, срок делает задачу разовой и выключает дни.
      const summary = tab.getByTestId('schedule-summary');
      check((await summary.innerText()).startsWith('Каждый день'), `default schedule ${await summary.innerText()}`);
      for (const day of ['Пн', 'Ср', 'Пт']) await tab.getByRole('button', { name: day, exact: true }).click();
      check((await summary.innerText()).startsWith('По понедельникам, средам и пятницам'), `weekday schedule ${await summary.innerText()}`);
      check(await tab.getByRole('button', { name: 'Пн', exact: true }).getAttribute('aria-pressed') === 'true', 'weekday chip not pressed');
      await tab.getByTestId('input-due-date').fill('2026-12-30');
      check((await summary.innerText()).startsWith('Разово, срок — 30 декабря'), `due schedule ${await summary.innerText()}`);
      check(await tab.getByRole('button', { name: 'Ср', exact: true }).isDisabled(), 'weekdays still active with a due date');
      await tab.getByRole('button', { name: 'Убрать', exact: true }).click();
      check((await summary.innerText()).startsWith('По понедельникам'), 'removing due date did not restore weekdays');

      // Страница упала (здесь — неподменённый API оплаты) — меню на месте, уйти можно.
      await tab.goto(base + '/admin/billing');
      await tab.getByText('Что-то пошло не так').waitFor();
      // Технический текст — под «Подробностями», не перед глазами.
      check(await tab.getByText('Подробности для поддержки').isVisible(), 'error details summary missing');
      check(!(await tab.locator('details:not([open]) p.font-mono').isVisible()), 'raw error message shown by default');
      await tab.evaluate(() => document.documentElement.classList.add('dark'));
      await tab.screenshot({ path: 'output/playwright/sidebar-page-error-dark.png' });
      await tab.evaluate(() => document.documentElement.classList.remove('dark'));
      await sidebar.getByRole('link', { name: 'Помощь', exact: true }).click();
      await tab.waitForURL('**/help');
      check(await tab.getByText('Что-то пошло не так').count() === 0, 'page error survived navigation');

      // Тема из панели; тёмная тема не ломает панель.
      await sidebar.getByRole('radio', { name: 'Тёмная', exact: true }).click();
      check(await tab.locator('html').evaluate((el) => el.classList.contains('dark')), 'dark theme from sidebar');
      // Переход внутри приложения: goto перезагрузил бы страницу, а init-скрипт ставит светлую тему.
      await sidebar.getByRole('link', { name: 'Задачи', exact: true }).click();
      await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
      await tab.evaluate(() => Promise.race([Promise.allSettled(document.getAnimations().map((a) => a.finished)), new Promise((r) => setTimeout(r, 1500))]));
      check(await tab.locator('html').evaluate((el) => el.classList.contains('dark')), 'dark theme kept after navigation');
      await tab.screenshot({ path: 'output/playwright/sidebar-dashboard-dark.png' });

      // 1024 — панель есть и страница не шире окна; 1023 — панели нет, бургер есть.
      await tab.setViewportSize({ width: 1024, height: 768 });
      await tab.waitForTimeout(150);
      check(await sidebar.isVisible(), 'sidebar hidden at 1024');
      check(await tab.evaluate(() => document.querySelector('#root').scrollWidth <= innerWidth), 'overflow at 1024');
      await tab.screenshot({ path: 'output/playwright/sidebar-1024.png' });
      await tab.setViewportSize({ width: 1023, height: 768 });
      await tab.waitForTimeout(150);
      check(await sidebar.isHidden(), 'sidebar visible at 1023');
      check(await tab.getByRole('button', { name: 'Меню', exact: true }).isVisible(), 'burger hidden at 1023');
      check(errors.length === 0, `admin errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 2. Сотрудник: только свои разделы, без «Создать задачу» и счётчика проверки; N не работает.
  {
    const { context, tab, errors, calls } = await open(worker);
    try {
      await tab.goto(base + '/dashboard');
      await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
      const sidebar = sidebarOf(tab);
      const labels = await sidebar.getByRole('navigation', { name: 'Разделы' }).getByRole('link').allInnerTexts();
      check(JSON.stringify(labels.map((t) => t.trim())) === JSON.stringify(['Задачи', 'История', 'Помощь']), `worker nav ${JSON.stringify(labels)}`);
      check(await sidebar.getByRole('link', { name: /Создать задачу/ }).count() === 0, 'worker sees create action');
      await sidebar.getByText('Сотрудник', { exact: true }).first().waitFor();
      await tab.locator('body').click({ position: { x: 700, y: 10 } });
      await tab.keyboard.press('n');
      await tab.waitForTimeout(200);
      check(new URL(tab.url()).pathname === '/dashboard', 'worker navigated by N');
      check(!calls.includes('/api/tasks/awaiting-verification'), 'worker requested verification queue for the sidebar');
      await tab.screenshot({ path: 'output/playwright/sidebar-worker.png' });
      // Старый адрес «новый сотрудник» — не на «Доступ запрещён», а к своим задачам.
      await tab.goto(base + '/workers/new');
      await tab.waitForURL('**/dashboard');
      check(errors.length === 0, `worker errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 3. Телефон: панели нет, меню — шторка из шапки с теми же разделами.
  {
    const { context, tab, errors } = await open(admin, { width: 390, height: 844, planUntil: now + 60 * DAY });
    try {
      await tab.goto(base + '/dashboard');
      await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
      check(await sidebarOf(tab).isHidden(), 'sidebar visible on phone');
      await tab.getByRole('button', { name: 'Меню', exact: true }).click();
      const sheet = tab.getByRole('dialog');
      await sheet.getByRole('button', { name: 'Тариф и оплата' }).waitFor();
      await sheet.getByRole('button', { name: 'Root: компании и тарифы' }).waitFor();
      check(await sheet.getByRole('switch', { name: 'Звук и вибрация' }).count() === 1, 'sound toggle missing in mobile menu');
      await sheet.getByRole('button', { name: 'Сотрудники' }).click();
      await tab.waitForURL('**/admin/users');
      check(await tab.evaluate(() => document.querySelector('#root').scrollWidth <= innerWidth), 'overflow at 390');
      check(errors.length === 0, `mobile errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'admin/root nav groups + active + count + plan warn, nav click + subpage active + home back hidden, sticky on scroll, Ctrl+K keyword/person/empty/Esc, N shortcut, theme from sidebar + dark, 1024/1023, worker nav + no N + no queue + legacy redirect, users page (search, highlight, confirm), tab titles, skip link, task schedule summary, phone sheet same sections', failures };
}
