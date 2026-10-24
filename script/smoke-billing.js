// Оплата тарифа на UI-превью: форма тарифов, срок и сумма, галочка
// автосписаний (не стоит по умолчанию), оплата обычной страницей кассы и в
// окне поверх страницы, возврат на SuccessURL/FailURL, автопродление,
// касса не настроена, iOS-приложение без оплаты, root «Касса» (секреты,
// адреса, проверка подключения), «Цены», сверка и возврат платежа, 390px и
// тёмная тема. API и Робокасса подменены — сервер, БД и касса не участвуют.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  const admin = { id: 1, name: 'Ирина', phone: '+79990000001', email: 'boss@cafe.ru', isAdmin: true, isRoot: true, companyId: 1, bonusBalance: 0, createdAt: now - DAY * 30, managedWorkerIds: null, hasPin: true, locationId: null };
  const prices = [
    { plan: 'team', months: 1, priceRub: 990 },
    { plan: 'team', months: 12, priceRub: 9900 },
    { plan: 'business', months: 1, priceRub: 1980 },
  ];
  const baseInfo = () => ({
    configured: true,
    testMode: false,
    recurringAvailable: true,
    plan: { id: 'start', until: null, perpetual: false, usersCount: 4 },
    prices,
    recurring: { active: false, plan: null, months: null, amountRub: null, nextChargeAt: null },
    orders: [],
    email: 'boss@cafe.ru',
    now,
  });

  async function open({ ua, info, rkScript, orders = {} } = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', ...(ua ? { userAgent: ua } : {}) });
    await context.addInitScript(() => localStorage.setItem('tf_onboarded_v1', 'true'));
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const errors = [];
    const calls = [];
    const state = {
      info: info ?? baseInfo(),
      orderPolls: {},
      rootOrders: [
        { id: 70, plan: 'team', months: 1, amountRub: 990, description: 'x', status: 'paid', isTest: false, automatic: true, createdAt: now - DAY, paidAt: now - DAY, planUntil: now + 29 * DAY, refundStatus: null, companyId: 2, companyName: 'Пекарня', email: 'b@b.ru' },
        { id: 71, plan: 'team', months: 1, amountRub: 990, description: 'x', status: 'pending', isTest: false, automatic: false, createdAt: now - 3600, paidAt: null, planUntil: null, refundStatus: null, companyId: 3, companyName: 'Бар', email: null },
      ],
    };
    tab.on('pageerror', (e) => errors.push(e.message));
    // Скрипт окна оплаты: заглушка Robokassa.StartPayment или «не загрузился».
    await tab.route('https://auth.robokassa.ru/**', (route) =>
      rkScript
        ? route.fulfill({ contentType: 'application/javascript', body: 'window.Robokassa={StartPayment:function(p){window.__rk=p;}};' })
        : route.abort(),
    );
    await tab.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (p !== '/api/events') calls.push({ method: req.method(), p, body });
      if (p === '/api/auth/me') return route.fulfill({ json: admin });
      if (p === '/api/billing' && req.method() === 'GET') return route.fulfill({ json: state.info });
      if (p === '/api/billing/checkout') {
        const price = prices.find((x) => x.plan === body.plan && x.months === body.months).priceRub;
        const params = { MerchantLogin: 'shop', OutSum: `${price}.00`, InvId: '77', Description: 'TasksFlow', SignatureValue: 'abc', Culture: 'ru' };
        return route.fulfill({ json: { invId: 77, amountRub: price, params, paymentUrl: `${base}/billing/success?InvId=77&OutSum=${price}.00` } });
      }
      const order = p.match(/^\/api\/billing\/orders\/(\d+)$/);
      if (order) {
        const id = Number(order[1]);
        state.orderPolls[id] = (state.orderPolls[id] ?? 0) + 1;
        const spec = orders[id];
        if (!spec) return route.fulfill({ status: 404, json: { message: 'Заказ не найден' } });
        const paid = spec.paidAfter !== undefined && state.orderPolls[id] > spec.paidAfter;
        return route.fulfill({ json: { id, plan: 'team', months: spec.months ?? 1, amountRub: spec.amount ?? 990, description: 'TasksFlow, тариф «Команда» на 1 месяц', status: paid ? 'paid' : 'pending', isTest: false, automatic: false, createdAt: now, paidAt: paid ? now : null, planUntil: paid ? now + 30 * DAY : null } });
      }
      if (p === '/api/billing/recurring' && req.method() === 'DELETE') {
        state.info = { ...state.info, recurring: { active: false, plan: null, months: null, amountRub: null, nextChargeAt: null } };
        return route.fulfill({ json: { ok: true, active: false } });
      }
      if (p === '/api/root/billing') return route.fulfill({ json: { prices, orders: state.rootOrders } });
      if (p === '/api/root/billing/diagnostics') {
        return route.fulfill({
          json: {
            secrets: { login: true, password1: true, password2: true, testPassword1: false, testPassword2: false, password3: false },
            testMode: false, configured: true, hash: 'md5', recurring: true, receipt: false, sno: null, tax: 'none',
            urls: { result: `${base}/api/billing/robokassa/result`, success: `${base}/billing/success`, fail: `${base}/billing/fail` },
            stats: { tables: true, byStatus: { paid: 1, pending: 1 }, lastPaidAt: now - DAY, activeSeries: 1 },
          },
        });
      }
      if (p === '/api/root/billing/check') return route.fulfill({ json: { ok: true, message: 'Касса отвечает: логин и Пароль #2 верны. Пароль #1 проверит тестовый платёж.' } });
      const rootAction = p.match(/^\/api\/root\/billing\/orders\/(\d+)\/(reconcile|refund)$/);
      if (rootAction) {
        const id = Number(rootAction[1]);
        if (rootAction[2] === 'reconcile') {
          state.rootOrders = state.rootOrders.map((o) => (o.id === id ? { ...o, status: 'paid', paidAt: now } : o));
          return route.fulfill({ json: { status: 'paid', message: 'Оплата найдена в кассе и засчитана', order: state.rootOrders.find((o) => o.id === id) } });
        }
        state.rootOrders = state.rootOrders.map((o) => (o.id === id ? { ...o, refundStatus: 'pending' } : o));
        return route.fulfill({ json: { message: 'Возврат отправлен в кассу.', order: state.rootOrders.find((o) => o.id === id) } });
      }
      if (p === '/api/root/billing/prices') return route.fulfill({ json: { ok: true, prices: body.prices } });
      if (p === '/api/root/companies') return route.fulfill({ json: { enforced: false, companies: [] } });
      return route.fulfill({ json: [] });
    });
    return { context, tab, errors, calls, state };
  }

  // 1. Форма: тарифы, срок, сумма, галочка не стоит; оплата обычной страницей кассы.
  {
    const { context, tab, errors, calls } = await open({ orders: { 77: { paidAfter: 1, amount: 9900, months: 12 } } });
    try {
      await tab.goto(base + '/admin/billing');
      await tab.getByRole('heading', { name: 'Тариф и оплата' }).waitFor();
      await tab.getByRole('heading', { name: '«Старт»' }).waitFor();
      check(await tab.getByRole('radio', { name: /Команда/ }).getAttribute('aria-checked') === 'true', 'team not preselected');
      check(await tab.getByRole('radio', { name: /1 месяц/ }).getAttribute('aria-checked') === 'true', '1 month not preselected');
      await tab.locator('.billing-summary').getByText('990 ₽', { exact: true }).waitFor();
      const consent = tab.getByRole('checkbox', { name: /Я согласен на автоматические списания/ });
      check(!(await consent.isChecked()), 'recurring consent checked by default');
      check(await tab.locator('.billing-consent a').getAttribute('href') === '/offer#avtoprodlenie', 'consent link');
      check(await tab.locator('.billing-legal a[href="/offer"]').count() === 1, 'offer link');
      await tab.screenshot({ path: 'output/playwright/billing-form.png', fullPage: true });

      await tab.getByRole('radio', { name: /12 месяцев/ }).click();
      await tab.locator('.billing-summary').getByText('9 900 ₽', { exact: true }).waitFor();
      await consent.check();
      await tab.locator('.billing-consent').getByText(/Спишем 9\s900\s₽ раз в год/).waitFor();
      await tab.getByRole('textbox', { name: /Почта для чека/ }).fill('pay@cafe.ru');
      await tab.getByRole('button', { name: /Перейти к оплате · 9\s900\s₽/ }).click();
      // Окно Робокассы не загрузилось — уходим на обычную страницу оплаты (здесь — сразу SuccessURL).
      await tab.waitForURL('**/billing/success?InvId=77**');
      const sent = calls.find((c) => c.p === '/api/billing/checkout');
      check(sent && sent.body.plan === 'team' && sent.body.months === 12 && sent.body.recurringConsent === true && sent.body.email === 'pay@cafe.ru' && sent.body.expectedRub === 9900, `checkout body ${JSON.stringify(sent?.body)}`);
      await tab.locator('.billing-return.is-success').getByRole('heading', { name: 'Оплата получена' }).waitFor();
      await tab.screenshot({ path: 'output/playwright/billing-success.png' });

      // FailURL: не оплачен — «Оплата не прошла» и повтор.
      await tab.goto(base + '/billing/fail?InvId=78');
      await tab.getByRole('heading', { name: 'Оплата не прошла' }).waitFor();
      await tab.getByRole('button', { name: 'Попробовать ещё раз' }).click();
      await tab.waitForURL('**/admin/billing');
      check(errors.length === 0, `form errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 2. Окно оплаты поверх страницы: параметры уходят в Robokassa.StartPayment, ждём подтверждение здесь же.
  {
    const { context, tab, errors } = await open({ rkScript: true, orders: { 77: { paidAfter: 1 } } });
    try {
      await tab.goto(base + '/admin/billing');
      await tab.getByRole('button', { name: /Перейти к оплате · 990\s₽/ }).click();
      await tab.getByText('Ждём подтверждение оплаты — страница обновится сама.').waitFor();
      check(await tab.evaluate(() => window.__rk?.InvId) === '77', 'StartPayment params');
      check(new URL(tab.url()).pathname === '/admin/billing', 'iframe flow navigated away');
      await tab.locator('.billing-paid').waitFor({ timeout: 15000 });
      check(errors.length === 0, `iframe errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 3. Автопродление включено: дата и сумма списания, отключение через подтверждение.
  {
    const info = { ...baseInfo(), plan: { id: 'team', until: now + 20 * DAY, perpetual: false, usersCount: 12 }, recurring: { active: true, plan: 'team', months: 1, amountRub: 990, nextChargeAt: now + 20 * DAY } };
    const { context, tab, errors, calls } = await open({ info });
    try {
      await tab.goto(base + '/admin/billing');
      await tab.getByRole('heading', { name: '«Команда»' }).waitFor();
      await tab.locator('.billing-recurring').getByText('включено').waitFor();
      await tab.getByRole('button', { name: 'Отключить автопродление' }).click();
      await tab.getByRole('dialog').getByRole('button', { name: 'Отключить' }).click();
      await tab.locator('.billing-recurring').getByText('выключено').waitFor();
      check(calls.some((c) => c.method === 'DELETE' && c.p === '/api/billing/recurring'), 'disable not sent');
      // Тот же тариф — «прибавится к оставшемуся», другой — пересчёт остатка.
      await tab.getByText('Срок прибавится к оставшемуся.').waitFor();
      await tab.getByRole('radio', { name: /Бизнес/ }).click();
      await tab.getByText(/пересчитаем по цене/).waitFor();
      check(errors.length === 0, `recurring errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 4. Касса не настроена — понятный текст вместо кнопки; телефон 390px и тёмная тема.
  {
    const { context, tab, errors } = await open({ info: { ...baseInfo(), configured: false } });
    try {
      await tab.setViewportSize({ width: 390, height: 844 });
      await tab.goto(base + '/admin/billing');
      await tab.getByText(/Онлайн-оплата скоро появится/).waitFor();
      check(await tab.getByRole('button', { name: /Перейти к оплате/ }).count() === 0, 'pay button without config');
      check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'billing overflows at 390');
      await tab.screenshot({ path: 'output/playwright/billing-390.png', fullPage: true });
      await tab.evaluate(() => localStorage.setItem('theme-preference', 'dark'));
      await tab.reload();
      await tab.getByRole('heading', { name: 'Тариф и оплата' }).waitFor();
      check(await tab.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme not applied');
      await tab.screenshot({ path: 'output/playwright/billing-390-dark.png', fullPage: true });
      check(errors.length === 0, `mobile errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 5. iOS-приложение: только состояние тарифа, без кнопок и цен.
  {
    const { context, tab, errors } = await open({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 TasksFlowApp/1.0.0' });
    try {
      await tab.goto(base + '/admin/billing');
      await tab.getByRole('heading', { name: '«Старт»' }).waitFor();
      check(await tab.getByRole('radio').count() === 0, 'plans shown in app');
      check(await tab.getByRole('button', { name: /Перейти к оплате/ }).count() === 0, 'pay button in app');
      check(await tab.getByText(/Робокасс/).count() === 0, 'payment text in app');
      check(errors.length === 0, `app errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 6. Root: касса, цены и платежи (сверка и возврат).
  {
    const { context, tab, errors, calls } = await open();
    try {
      await tab.goto(base + '/admin/companies');
      await tab.getByRole('heading', { name: 'Касса' }).waitFor();
      const cashbox = tab.locator('section', { has: tab.getByRole('heading', { name: 'Касса' }) });
      await cashbox.getByText('принимает оплату').waitFor();
      check(await cashbox.locator('.root-cashbox-list .is-ok').count() === 4, 'cashbox: 4 settings set (login, #1, #2, recurring)');
      check(await cashbox.getByText(/Пароль #3/).count() === 1, 'cashbox: no password #3 row');
      check(await cashbox.getByText(/Тестовый пароль/).count() === 0, 'cashbox: test passwords shown in live mode');
      await cashbox.getByText(`${base}/api/billing/robokassa/result`).waitFor();
      await cashbox.getByRole('button', { name: 'Проверить подключение' }).click();
      await cashbox.getByText(/логин и Пароль #2 верны/).waitFor();
      check(calls.some((c) => c.p === '/api/root/billing/check' && c.method === 'POST'), 'check not called');

      await tab.getByRole('heading', { name: 'Цены тарифов' }).waitFor();
      await tab.getByText('Пекарня · Команда на 1 месяц').waitFor();
      await tab.getByRole('spinbutton', { name: 'Цена, ₽' }).first().fill('1190');
      await tab.getByRole('button', { name: 'Сохранить цены' }).click();
      await tab.waitForTimeout(300);
      const put = calls.find((c) => c.p === '/api/root/billing/prices');
      check(put?.body?.prices?.[0]?.priceRub === 1190 && put.body.prices.length === 3, `prices ${JSON.stringify(put?.body)}`);

      // Зависший заказ — «Проверить в кассе» засчитывает оплату.
      const bar = tab.locator('.billing-order', { hasText: 'Бар' });
      check(await bar.getByRole('button', { name: 'Вернуть деньги' }).count() === 0, 'refund offered for pending order');
      await bar.getByRole('button', { name: 'Проверить в кассе' }).click();
      await tab.getByText('Оплата найдена в кассе и засчитана').first().waitFor();
      await bar.getByText('Оплачен').waitFor();

      // Возврат — только через подтверждение; после — «возврат в обработке», кнопки нет.
      const bakery = tab.locator('.billing-order', { hasText: 'Пекарня' });
      await bakery.getByRole('button', { name: 'Вернуть деньги' }).click();
      const dialog = tab.getByRole('dialog');
      await dialog.getByText(/отменить возврат нельзя/).waitFor();
      check(!calls.some((c) => /\/refund$/.test(c.p)), 'refund sent before confirm');
      await dialog.getByRole('button', { name: 'Вернуть деньги' }).click();
      await bakery.getByText('возврат в обработке').waitFor();
      check(await bakery.getByRole('button', { name: 'Вернуть деньги' }).count() === 0, 'refund button still shown');
      check(calls.filter((c) => c.p === '/api/root/billing/orders/70/refund').length === 1, 'refund calls');
      await tab.screenshot({ path: 'output/playwright/billing-root-cashbox.png', fullPage: true });

      // 390px: адреса переносятся, страница не шире экрана.
      await tab.setViewportSize({ width: 390, height: 844 });
      await tab.waitForTimeout(200);
      const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 1, `root 390 overflow ${overflow}px`);
      await tab.screenshot({ path: 'output/playwright/billing-root-cashbox-390.png', fullPage: true });
      await tab.evaluate(() => document.documentElement.classList.add('dark'));
      await tab.getByRole('heading', { name: 'Касса' }).scrollIntoViewIfNeeded();
      await tab.screenshot({ path: 'output/playwright/billing-root-cashbox-dark.png' });
      check(errors.length === 0, `root errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'form + defaults, consent unchecked, 12m + consent + email body, fallback redirect + success, fail page, iframe StartPayment + inline paid, recurring disable, carry-over text, not configured, 390 + dark, iOS app without payment, root cashbox + check + prices + reconcile + refund confirm + 390', failures };
}
