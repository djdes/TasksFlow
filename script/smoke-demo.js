// Демо-кабинет на UI-превью: /demo открывает кабинет без регистрации,
// API отвечает из памяти браузера (ни одного запроса к серверу), отчёты
// считаются тем же кодом, что на сервере, CSV скачивается, роль
// переключается на сотрудника. Полоса демо помещается в 360/390 px.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }], ['w360', { width: 360, height: 740 }]]) {
    const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('tf_onboarded_v1', 'true'));
    const tab = await context.newPage();
    tab.setDefaultTimeout(12000);
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    const apiHits = [];
    tab.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) apiHits.push(u.pathname); });
    try {
      await tab.goto(base + '/demo');
      await tab.locator('.demo-bar').waitFor();
      await tab.waitForURL('**/dashboard');
      await tab.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
      const bar = await tab.locator('.demo-bar').boundingBox();
      check(bar && bar.height <= (label === 'desktop' ? 56 : 52), `${label}: demo bar too tall ${bar?.height}`);
      check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.demo-bar > *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 0.5)), `${label}: demo bar overflows`);
      await tab.screenshot({ path: `output/playwright/demo-${label}.png` });
      if (label !== 'desktop') { await context.close(); continue; }
      // В очереди «На проверке» всегда есть что показать — в любое время суток.
      await tab.locator('.app-sidebar-count').waitFor();
      // «Дублировать»: окно открывается (раньше падало — флажок внутри кнопки), срок виден и меняется.
      await tab.getByText(/Илья Кузнецов/).first().click();
      await tab.getByRole('button', { name: /^Дублировать:/ }).first().click({ force: true });
      const dup = tab.getByRole('dialog');
      await dup.getByText('Когда задача видна').waitFor();
      await dup.getByTestId('input-due-date').fill('2026-12-30');
      check((await dup.getByTestId('schedule-summary').innerText()).startsWith('Разово, срок — 30 декабря'), 'duplicate due date summary');
      await dup.getByRole('checkbox', { name: /Анна Петрова/ }).click();
      check(await dup.getByRole('checkbox', { name: /Анна Петрова/ }).getAttribute('aria-checked') === 'true', 'duplicate worker toggle');
      await tab.keyboard.press('Escape');
      await dup.waitFor({ state: 'hidden' });
      check(await tab.getByText('Что-то пошло не так').count() === 0, 'duplicate dialog crashed the page');
      await tab.goto(base + '/reports');
      await tab.getByRole('heading', { name: 'Сегодня' }).waitFor();
      await tab.getByRole('button', { name: 'Предыдущий день' }).click();
      await tab.getByRole('heading', { name: 'Вчера' }).waitFor();
      check(await tab.locator('.reports-item').count() > 5, 'demo history is empty');
      await tab.getByRole('tab', { name: 'Сводка' }).click();
      await tab.getByText('По дням', { exact: true }).waitFor();
      check(await tab.locator('.report-column').count() === 7, 'demo chart has no 7 days');
      const download = tab.waitForEvent('download');
      await tab.getByRole('link', { name: /Excel/ }).click();
      check(/tasksflow-demo-/.test((await download).suggestedFilename()), 'demo CSV not downloaded');
      await tab.getByRole('radio', { name: 'Сотрудник' }).click();
      await tab.goto(base + '/dashboard');
      await tab.getByText('Анна Петрова').first().waitFor();
      check(await tab.getByRole('radio', { name: 'Сотрудник' }).getAttribute('aria-checked') === 'true', 'demo role lost on reload');
      check(await tab.locator('.group-year-header').count() === 0, 'recurring tasks grouped by creation month');
      await tab.screenshot({ path: 'output/playwright/demo-worker.png' });
      check(apiHits.length === 0, `demo hit the real API: ${apiHits.slice(0, 5).join(', ')}`);
      check(errors.length === 0, `errors: ${errors.join('; ')}`);
    } finally {
      await context.close().catch(() => {});
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'demo entry, verification queue not empty, duplicate dialog (schedule, workers), no real API calls, history and summary from shared code, CSV, worker role persists, bar fits 360/390', failures };
}
