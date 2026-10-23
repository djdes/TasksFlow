// Приложение и PWA на UI-превью: манифест и иконки, страница /app на
// телефоне и компьютере, офлайн-страница service worker, «Приложение и
// уведомления» в аккаунте (Web Push, iPhone без установки, мост
// iOS-приложения), вход без сессии в приложении, подсказка на главной.
// API подменён фикстурами; push-сервис браузера и системное разрешение —
// тоже (в headless Chromium их нет), сервер и БД не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const shots = 'output/playwright';
  const now = Math.floor(Date.now() / 1000);
  const admin = { id: 1, name: 'Ирина', phone: '+79990000001', isAdmin: true, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: now - 86400 * 30, managedWorkerIds: null, hasPin: true, locationId: null };
  const worker = { ...admin, id: 10, name: 'Анна', phone: '+79990000010', isAdmin: false };
  const VAPID = 'BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo';
  const visible = (locator, timeout = 8000) => locator.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);

  // ---------- 1. Манифест и иконки ----------
  const manifest = await (await page.request.get(`${base}/manifest.json`)).json();
  check(manifest.start_url === '/dashboard' && manifest.display === 'standalone' && manifest.scope === '/', 'манифест: start_url, scope, standalone');
  check(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'), 'манифест: maskable 512');
  for (const icon of manifest.icons) {
    const r = await page.request.get(`${base}${icon.src}`);
    check(r.ok() && (r.headers()['content-type'] || '').startsWith('image/png'), `иконка ${icon.src}`);
  }
  for (const src of ['/apple-touch-icon.png', '/favicon.svg', '/offline.html', '/sw.js']) {
    check((await page.request.get(`${base}${src}`)).ok(), `файл ${src}`);
  }

  // ---------- 2. /app на iPhone и на компьютере ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1', serviceWorkers: 'block' });
  let tab = await phone.newPage();
  await tab.goto(`${base}/app`);
  check(await visible(tab.getByRole('heading', { name: 'TasksFlow на телефоне' })), '/app: заголовок');
  check(await visible(tab.getByText('На экран „Домой“')), '/app: шаги для iPhone');
  check(await visible(tab.getByRole('link', { name: /Скачать APK/ })), '/app: APK, когда он опубликован');
  check(!(await tab.locator('.app-qr').isVisible()), '/app: QR не нужен на телефоне');
  check((await tab.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '/app: без горизонтальной прокрутки на 390px');
  await tab.screenshot({ path: `${shots}/pwa-app-page-390.png`, fullPage: true });
  await phone.close();

  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', colorScheme: 'dark' });
  tab = await desk.newPage();
  await tab.goto(`${base}/app`);
  check(await visible(tab.locator('.app-qr svg')), '/app: QR на компьютере');
  await tab.screenshot({ path: `${shots}/pwa-app-page-desktop-dark.png`, fullPage: true });
  await desk.close();

  // ---------- 3. Офлайн-страница service worker ----------
  const sw = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await sw.addInitScript(() => localStorage.setItem('tf_onboarded_v1', 'true'));
  tab = await sw.newPage();
  await tab.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/auth/me') return route.fulfill({ json: admin });
    if (p === '/api/events') return route.abort();
    return route.fulfill({ json: [] });
  });
  await tab.goto(`${base}/dashboard`);
  const controlled = await tab.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 }).then(() => true, () => false);
  check(controlled, 'service worker управляет страницей');
  await sw.setOffline(true);
  await tab.reload().catch(() => {});
  check(await visible(tab.getByRole('heading', { name: 'Нет соединения' })), 'без сети — офлайн-страница');
  check(await visible(tab.getByRole('button', { name: 'Повторить' })), 'офлайн-страница: «Повторить»');
  await tab.screenshot({ path: `${shots}/pwa-offline-390.png` });
  await sw.setOffline(false);
  await sw.close();

  // ---------- 4. Аккаунт: Web Push на этом устройстве ----------
  async function accountContext({ ua, bridge, noPushManager, apns } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(ua ? { userAgent: ua } : {}) });
    await ctx.addInitScript(({ bridge, noPushManager }) => {
      localStorage.setItem('tf_onboarded_v1', 'true');
      // Системный диалог «Разрешить» и push-сервис браузера — подмена.
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => window.__perm || 'default' });
      Notification.requestPermission = async () => (window.__perm = 'granted');
      const b64 = (u) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      let current = null;
      const fakeRegistration = {
        pushManager: {
          getSubscription: async () => current,
          subscribe: async () => {
            const key = new Uint8Array(65); key[0] = 4;
            current = {
              endpoint: 'https://fcm.googleapis.com/fcm/send/smoke-device',
              options: {},
              toJSON() { return { endpoint: this.endpoint, keys: { p256dh: b64(key), auth: b64(new Uint8Array(16)) } }; },
              unsubscribe: async () => { current = null; return true; },
            };
            return current;
          },
        },
      };
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistration = async () => fakeRegistration;
        navigator.serviceWorker.register = async () => fakeRegistration;
        Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => Promise.resolve(fakeRegistration) });
      }
      if (noPushManager) delete window.PushManager;
      if (bridge) {
        window.__nativeCalls = [];
        window.TasksFlowNative = {
          platform: 'ios',
          version: '1.0.0',
          call: async (type) => {
            window.__nativeCalls.push(type);
            if (type === 'push.status') return { permission: window.__nativeGranted ? 'granted' : 'default', token: window.__nativeGranted ? 'ab'.repeat(32) : '', environment: 'production' };
            if (type === 'push.register') { window.__nativeGranted = true; return { token: 'ab'.repeat(32), environment: 'production' }; }
            return true;
          },
        };
      }
    }, { bridge: !!bridge, noPushManager: !!noPushManager });
    const t = await ctx.newPage();
    t.setDefaultTimeout(10000);
    const calls = [];
    await t.route('**/api/**', async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (p !== '/api/events') calls.push({ method: req.method(), p, body });
      if (p === '/api/auth/me') return route.fulfill({ json: admin });
      if (p === '/api/push/config') return route.fulfill({ json: { web: { enabled: true, publicKey: VAPID }, apns: { enabled: !!apns } } });
      if (p === '/api/push/subscriptions' && req.method() === 'POST') return route.fulfill({ status: 201, json: { ok: true, devices: 1 } });
      if (p === '/api/push/subscriptions' && req.method() === 'DELETE') return route.fulfill({ json: { ok: true, removed: 1 } });
      if (p === '/api/push/test') return route.fulfill({ json: { sent: 1, removed: 0 } });
      if (p === '/api/app/info') return route.fulfill({ json: { android: { apk: { url: '/downloads/tasksflow.apk', versionName: '1.0.0', size: 1650000, builtAt: null }, playUrl: null, rustoreUrl: null }, ios: { appStoreUrl: null, testflightUrl: null } } });
      if (p === '/api/events') return route.abort();
      return route.fulfill({ json: [] });
    });
    return { ctx, t, calls };
  }

  let { ctx, t, calls } = await accountContext();
  await t.goto(`${base}/account`);
  check(await visible(t.getByRole('heading', { name: 'Приложение и уведомления' })), 'аккаунт: блок «Приложение и уведомления»');
  check(await visible(t.getByRole('button', { name: 'Включить' })), 'аккаунт: «Включить» уведомления');
  await t.getByRole('button', { name: 'Включить' }).click();
  check(await visible(t.getByRole('button', { name: 'Проверить' })), 'после включения — «Проверить»');
  const sub = calls.find((c) => c.p === '/api/push/subscriptions' && c.method === 'POST');
  check(sub?.body?.kind === 'web' && sub.body.subscription.endpoint.startsWith('https://fcm.googleapis.com/'), 'подписка браузера ушла на сервер');
  await t.getByRole('button', { name: 'Проверить' }).click();
  check(await visible(t.getByText('Отправили — уведомление сейчас придёт')), 'проверочное уведомление');
  check(calls.some((c) => c.p === '/api/push/test'), 'POST /api/push/test');
  await t.locator('#app').screenshot({ path: `${shots}/pwa-account-push-on-390.png` });
  await t.getByRole('button', { name: 'Выключить' }).click();
  check(await visible(t.getByRole('button', { name: 'Включить' })), 'выключили — снова «Включить»');
  check(calls.some((c) => c.p === '/api/push/subscriptions' && c.method === 'DELETE' && c.body?.endpoint), 'отписка ушла на сервер');
  await ctx.close();

  // iPhone в Safari без установки: Web Push недоступен — объясняем, как поставить.
  ({ ctx, t } = await accountContext({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1', noPushManager: true }));
  await t.goto(`${base}/account`);
  check(await visible(t.getByText('после установки на экран «Домой»')), 'iPhone без установки: подсказка про экран «Домой»');
  check((await t.locator('#app').getByRole('link', { name: 'Как установить' }).count()) === 1, 'iPhone без установки: одна ссылка «Как установить»');
  await t.locator('#app').screenshot({ path: `${shots}/pwa-account-iphone-safari-390.png` });
  await ctx.close();

  // iOS-приложение: push через мост (APNs), токен — на сервер.
  ({ ctx, t, calls } = await accountContext({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TasksFlowApp/1.0.0', bridge: true, apns: true }));
  await t.goto(`${base}/account`);
  check(await visible(t.getByText('Вы в приложении TasksFlow.')), 'iOS-приложение: «Вы в приложении»');
  await t.getByRole('button', { name: 'Включить' }).click();
  check(await visible(t.getByRole('button', { name: 'Проверить' })), 'iOS-приложение: уведомления включены');
  const apnsSub = calls.find((c) => c.p === '/api/push/subscriptions' && c.method === 'POST');
  check(apnsSub?.body?.kind === 'apns' && apnsSub.body.token === 'ab'.repeat(32) && apnsSub.body.environment === 'production', 'iOS-приложение: токен APNs на сервер');
  check((await t.evaluate(() => window.__nativeCalls)).includes('push.register'), 'iOS-приложение: запрос разрешения через мост');
  await ctx.close();

  // ---------- 5. Без сессии в приложении — экран входа, а не лендинг ----------
  const app = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TasksFlowApp/1.0.0', serviceWorkers: 'block' });
  tab = await app.newPage();
  await tab.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/auth/me') return route.fulfill({ status: 401, json: { message: 'Не авторизован' } });
    if (p === '/api/events') return route.abort();
    return route.fulfill({ json: [] });
  });
  await tab.goto(`${base}/dashboard`);
  await tab.waitForURL(/\/login$/, { timeout: 10000 }).catch(() => {});
  check(new URL(tab.url()).pathname === '/login', `приложение без сессии — /login (сейчас ${new URL(tab.url()).pathname})`);
  check(await visible(tab.getByRole('link', { name: 'Демо' })), 'на входе есть «Демо»');
  await app.close();

  // ---------- 6. Подсказка на главной: Android в браузере, не в первый день ----------
  const android = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', serviceWorkers: 'block' });
  await android.addInitScript((seen) => {
    localStorage.setItem('tf_onboarded_v1', 'true');
    if (!localStorage.getItem('tf_first_seen')) localStorage.setItem('tf_first_seen', String(seen));
  }, Date.now() - 3 * 86400000);
  tab = await android.newPage();
  await tab.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/auth/me') return route.fulfill({ json: worker });
    if (p === '/api/events') return route.abort();
    return route.fulfill({ json: [] });
  });
  await tab.goto(`${base}/dashboard`);
  const nudge = tab.locator('.app-nudge');
  check(await visible(nudge), 'главная: подсказка «Установите приложение»');
  check(await visible(nudge.getByRole('link', { name: 'Как?' })), 'подсказка: «Как?» ведёт на /app');
  check((await tab.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'главная с подсказкой — без горизонтальной прокрутки');
  await tab.waitForTimeout(400); // появление страницы — 240 мс
  await tab.screenshot({ path: `${shots}/pwa-nudge-android-390.png` });
  await nudge.getByRole('button', { name: 'Скрыть подсказку' }).click();
  check(!(await nudge.isVisible()), 'подсказка скрывается');
  await tab.reload();
  await tab.waitForTimeout(600);
  check(!(await tab.locator('.app-nudge').isVisible()), 'скрытая подсказка не возвращается после перезагрузки');
  await android.close();

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'manifest + icons, /app 390/desktop dark, SW offline page, account web push on/test/off, iPhone Safari hint, iOS bridge APNs, app logged-out → /login, demo link, android nudge + dismiss', failures };
}
