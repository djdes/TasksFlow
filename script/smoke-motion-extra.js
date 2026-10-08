// Run on the production UI preview. Uses a fresh context and isolated API fixtures.
async (page) => {
  const base = new URL(page.url()).origin;
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const testPage = await context.newPage();
  const errors = [];
  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  testPage.on('pageerror', error => errors.push(error.message));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let authenticated = true;
  const worker = { id: 1, name: 'Анна', phone: '+79990000001', isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: 1, managedWorkerIds: null };
  try {
    await testPage.route('**/assets/*.js', async route => { await gate; await route.continue(); });
    await testPage.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if(path === '/api/auth/login') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return route.fulfill({ status: 503, json: { message: 'Тестовая ошибка входа' } });
      }
      if(path === '/api/auth/me') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? worker : { message: 'Not authenticated' } });
      await route.fulfill({ json: path === '/api/users' ? [worker] : path === '/api/companies/me' ? { id: 1, wesetupConfigured: false } : [] });
    });
    await testPage.goto(base+'/dashboard', { waitUntil: 'commit' });
    await testPage.locator('.boot-shell').waitFor();
    check(await testPage.locator('.boot-stat').count() === 2, 'Cold boot reserves the wrong stats layout');
    await testPage.screenshot({ path: 'output/playwright/mobile-cold-start.png' });
    release();
    await testPage.getByRole('heading', { name: 'Задачи', exact: true }).waitFor();
    const dialog = testPage.getByRole('dialog');
    await dialog.waitFor();
    check(await dialog.getAttribute('data-mobile-sheet') === 'true', 'Worker onboarding is not a sheet');
    for(let i = 0; i < 3; i++) {
      await dialog.getByRole('button', { name: 'Дальше', exact: true }).click();
      await dialog.getByText(`Шаг ${i+2} из 4`, { exact: true }).waitFor();
    }
    await dialog.getByRole('button', { name: 'Начать!', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    check(await testPage.evaluate(() => localStorage.getItem('tf_onboarded_v1')) === 'true', 'Onboarding completion was not saved');
    check(await testPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#root').scrollWidth <= innerWidth), 'Worker dashboard overflows');
    authenticated = false;
    await testPage.goto(base+'/login');
    await testPage.locator('input[type="tel"]').fill('9990000001');
    const submit = testPage.locator('button[type="submit"]');
    const before = await submit.boundingBox();
    await submit.click();
    await testPage.locator('button[aria-busy="true"]').waitFor();
    const during = await submit.boundingBox();
    check(Math.abs(before.width-during.width) < 1 && Math.abs(before.height-during.height) < 1, 'Pending button changed size');
    check(await submit.isDisabled(), 'Pending button allows duplicate requests');
    await testPage.getByText('Тестовая ошибка входа', { exact: true }).waitFor();
    check(await submit.isEnabled(), 'Button did not recover after a failed request');
    check(errors.length === 0, 'Browser errors: '+errors.join('; '));
    if(failures.length) throw new Error(failures.join('\n'));
    return { checks: 'cold boot before JS, worker onboarding, mobile layout, pending button geometry and recovery', failures, errors };
  } finally {
    release();
    await context.close();
  }
}
