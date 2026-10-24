// Оплата тарифа на UI-превью: форма тарифов, срок и сумма, галочка
// автосписаний (не стоит по умолчанию), оплата обычной страницей кассы и в
// окне поверх страницы, возврат на SuccessURL/FailURL, автопродление,
// касса не настроена, iOS-приложение без оплаты, промокод (и ссылкой
// ?promo=, и на всю сумму), счёт для юрлица с реквизитами, ссылки на счёт
// и УПД, root «Касса» (секреты, адреса, проверка подключения, счета и
// УПД), «Цены», «Промокоды», сверка и возврат платежа, отметка оплаты по
// счёту, акция, постоянная скидка и баллы в сумме, пополнение баланса,
// «Заполнить по ИНН», root «Акции», «Постоянные скидки» и «Балансы компаний»,
// 390px и тёмная тема. API и Робокасса подменены — сервер, БД и касса не участвуют.
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
    requisites: null,
    invoiceAvailable: false,
    promotion: null,
    lifetimeDiscounts: [],
    balance: { amountRub: 0, heldRub: 0, history: [] },
    innLookup: false,
  });
  // Поля заказа, которых нет в старых подменах: тариф, без акции и баллов.
  const ord = (o) => ({ kind: 'plan', discountSource: null, promotionDiscountRub: 0, pointsRub: 0, ...o });

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
        ord({ id: 70, plan: 'team', months: 1, amountRub: 990, description: 'x', status: 'paid', isTest: false, automatic: true, createdAt: now - DAY, paidAt: now - DAY, planUntil: now + 29 * DAY, refundStatus: null, method: 'card', promoCode: null, discountRub: 0, invoiceDueAt: null, hasInvoice: false, hasUpd: true, companyId: 2, companyName: 'Пекарня', email: 'b@b.ru' }),
        ord({ id: 71, plan: 'team', months: 1, amountRub: 990, description: 'x', status: 'pending', isTest: false, automatic: false, createdAt: now - 3600, paidAt: null, planUntil: null, refundStatus: null, method: 'card', promoCode: null, discountRub: 0, invoiceDueAt: null, hasInvoice: false, hasUpd: false, companyId: 3, companyName: 'Бар', email: null }),
        ord({ id: 72, plan: 'team', months: 12, amountRub: 7920, description: 'x', status: 'pending', isTest: false, automatic: false, createdAt: now - 7200, paidAt: null, planUntil: null, refundStatus: null, method: 'invoice', promoCode: 'START', discountRub: 1980, invoiceDueAt: now + 6 * DAY, hasInvoice: true, hasUpd: false, companyId: 4, companyName: 'ООО Столовая', email: 'buh@st.ru' }),
        ord({ id: 73, kind: 'topup', plan: 'team', months: 0, amountRub: 3000, description: 'x', status: 'paid', isTest: false, automatic: false, createdAt: now - 3 * DAY, paidAt: now - 3 * DAY, planUntil: null, refundStatus: null, method: 'card', promoCode: null, discountRub: 0, invoiceDueAt: null, hasInvoice: false, hasUpd: true, companyId: 2, companyName: 'Пекарня', email: 'b@b.ru' }),
      ],
      promotions: [
        { id: 1, title: 'Весна', percent: 15, startsAt: now - 40 * DAY, endsAt: now - 30 * DAY, active: true, note: null, createdAt: now - 41 * DAY, paidOrders: 12 },
      ],
      discounts: [
        { id: 5, companyId: 2, companyName: 'Пекарня', code: 'VIP', kind: 'percent', value: 10, label: '−10 %', boundAt: now - 5 * DAY, expiresAt: null, orderId: 70, revokedAt: null },
      ],
      balances: [{ companyId: 2, companyName: 'Пекарня', balanceRub: 1200, updatedAt: now - DAY }],
      ledger: [{ id: 1, amountRub: 1200, balanceAfter: 1200, kind: 'topup', description: 'Пополнение баланса, заказ №73', orderId: 73, createdAt: now - 3 * DAY }],
      promos: [
        { id: 1, code: 'START', kind: 'percent', value: 20, active: true, startsAt: null, endsAt: now + 30 * DAY, maxUses: 100, newClientsOnly: true, companyId: null, companyName: null, note: 'рассылка', paidUses: 3, createdAt: now - DAY },
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
      if (p === '/api/billing/promo') {
        const price = prices.find((x) => x.plan === body.plan && x.months === body.months).priceRub;
        const code = String(body.promoCode || '').toUpperCase();
        if (code === 'START') return route.fulfill({ json: { ok: true, code, kind: 'percent', value: 20, label: '−20 %', lifetime: false, durationMonths: null } });
        if (code === 'FREE') return route.fulfill({ json: { ok: true, code, kind: 'percent', value: 100, label: '−100 %', lifetime: false, durationMonths: null } });
        if (code === 'FIVE') return route.fulfill({ json: { ok: true, code, kind: 'percent', value: 5, label: '−5 %', lifetime: false, durationMonths: null } });
        return route.fulfill({ json: { ok: false, message: 'Такого промокода нет' } });
      }
      if (p === '/api/billing/requisites' && req.method() === 'PUT') {
        state.info = { ...state.info, requisites: { ...body, kpp: body.kind === 'org' ? body.kpp : null } };
        return route.fulfill({ json: { requisites: state.info.requisites } });
      }
      if (p === '/api/billing/requisites/lookup') {
        if (body.inn !== '7707083893') return route.fulfill({ json: { ok: false, message: 'По этому ИНН ничего не нашли — проверьте его или заполните вручную' } });
        return route.fulfill({
          json: {
            ok: true,
            requisites: { kind: 'org', name: 'ПАО «СБЕРБАНК»', inn: '7707083893', kpp: '773601001', ogrn: '1027700132195', address: '117312, г Москва, ул Вавилова, д 19', headPost: 'Президент', headName: 'Греф Герман Оскарович' },
            warning: null,
          },
        });
      }
      if (p === '/api/billing/topup' && body.method === 'invoice') {
        const order = ord({ id: 91, kind: 'topup', plan: 'team', months: 0, amountRub: body.amountRub, description: 'x', status: 'pending', isTest: false, automatic: false, createdAt: now, paidAt: null, planUntil: null, refundStatus: null, method: 'invoice', promoCode: null, discountRub: 0, invoiceDueAt: now + 7 * DAY, hasInvoice: true, hasUpd: false });
        return route.fulfill({ json: { method: 'invoice', order, existing: false, pdfUrl: '/api/billing/orders/91/invoice.pdf' } });
      }
      if (p === '/api/billing/topup') {
        const params = { MerchantLogin: 'shop', OutSum: `${body.amountRub}.00`, InvId: '88', Description: 'TasksFlow, пополнение баланса', SignatureValue: 'abc', Culture: 'ru' };
        return route.fulfill({ json: { method: 'card', invId: 88, amountRub: body.amountRub, params, paymentUrl: `${base}/billing/success?InvId=88` } });
      }
      if (p === '/api/billing/invoice') {
        const order = { id: 90, plan: body.plan, months: body.months, amountRub: body.expectedRub, description: 'x', status: 'pending', isTest: false, automatic: false, createdAt: now, paidAt: null, planUntil: null, refundStatus: null, method: 'invoice', promoCode: body.promoCode ?? null, discountRub: 0, invoiceDueAt: now + 7 * DAY, hasInvoice: true, hasUpd: false };
        state.info = { ...state.info, orders: [order, ...state.info.orders] };
        return route.fulfill({ json: { order, existing: false, pdfUrl: '/api/billing/orders/90/invoice.pdf' } });
      }
      if (p === '/api/billing/checkout' && String(body.promoCode || '').toUpperCase() === 'FREE') {
        const order = { id: 79, plan: body.plan, months: body.months, amountRub: 0, description: 'x', status: 'paid', isTest: false, automatic: false, createdAt: now, paidAt: now, planUntil: now + 30 * DAY, refundStatus: null, method: 'promo', promoCode: 'FREE', discountRub: 990, invoiceDueAt: null, hasInvoice: false, hasUpd: false };
        return route.fulfill({ json: { invId: 79, amountRub: 0, params: {}, paymentUrl: '', free: true, order } });
      }
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
            documents: { ready: false, missing: ['LEGAL_BANK_BIK — БИК, 9 цифр'] },
            dadata: true,
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
      if (p === '/api/root/billing/promo-codes' && req.method() === 'GET') return route.fulfill({ json: { promos: state.promos } });
      if (p === '/api/root/billing/promo-codes' && req.method() === 'POST') {
        const promo = { id: state.promos.length + 1, code: String(body.code).toUpperCase(), kind: body.kind, value: body.value, active: true, startsAt: null, endsAt: body.endsAt, maxUses: body.maxUses, newClientsOnly: body.newClientsOnly, companyId: body.companyId, companyName: null, note: body.note ?? null, paidUses: 0, createdAt: now };
        state.promos = [promo, ...state.promos];
        return route.fulfill({ json: { promo } });
      }
      const promoPatch = p.match(/^\/api\/root\/billing\/promo-codes\/(\d+)$/);
      if (promoPatch) {
        state.promos = state.promos.map((x) => (x.id === Number(promoPatch[1]) ? { ...x, ...body } : x));
        return route.fulfill({ json: { promo: state.promos.find((x) => x.id === Number(promoPatch[1])) } });
      }
      const invoiceAction = p.match(/^\/api\/root\/billing\/orders\/(\d+)\/invoice-(paid|cancel)$/);
      if (invoiceAction) {
        const id = Number(invoiceAction[1]);
        state.rootOrders = state.rootOrders.map((o) => (o.id === id ? { ...o, status: invoiceAction[2] === 'paid' ? 'paid' : 'cancelled', paidAt: now, hasUpd: invoiceAction[2] === 'paid' } : o));
        return route.fulfill({ json: { message: invoiceAction[2] === 'paid' ? 'Оплата отмечена: тариф продлён, админы получили уведомление.' : 'Счёт отменён' } });
      }
      if (p === '/api/root/billing/promotions' && req.method() === 'GET') return route.fulfill({ json: { promotions: state.promotions } });
      if (p === '/api/root/billing/promotions' && req.method() === 'POST') {
        const promotion = { id: state.promotions.length + 1, title: body.title, percent: body.percent, startsAt: body.startsAt, endsAt: body.endsAt, active: true, note: body.note ?? null, createdAt: now, paidOrders: 0 };
        state.promotions = [promotion, ...state.promotions];
        return route.fulfill({ json: { promotion } });
      }
      const promotionPatch = p.match(/^\/api\/root\/billing\/promotions\/(\d+)$/);
      if (promotionPatch) {
        state.promotions = state.promotions.map((x) => (x.id === Number(promotionPatch[1]) ? { ...x, ...body } : x));
        return route.fulfill({ json: { promotion: state.promotions.find((x) => x.id === Number(promotionPatch[1])) } });
      }
      if (p === '/api/root/billing/discounts') return route.fulfill({ json: { discounts: state.discounts } });
      const revoke = p.match(/^\/api\/root\/billing\/discounts\/(\d+)\/revoke$/);
      if (revoke) {
        state.discounts = state.discounts.map((d) => (d.id === Number(revoke[1]) ? { ...d, revokedAt: now } : d));
        return route.fulfill({ json: { message: 'Скидка VIP снята' } });
      }
      if (p === '/api/root/billing/balances') return route.fulfill({ json: { balances: state.balances } });
      const balance = p.match(/^\/api\/root\/billing\/balances\/(\d+)(\/adjust)?$/);
      if (balance) {
        const id = Number(balance[1]);
        const row = state.balances.find((b) => b.companyId === id);
        if (!row) return route.fulfill({ status: 404, json: { message: 'Компании с таким номером нет' } });
        if (balance[2]) {
          if (row.balanceRub + body.amountRub < 0) return route.fulfill({ status: 409, json: { message: `Нельзя списать больше, чем на балансе (${row.balanceRub} ₽)` } });
          row.balanceRub += body.amountRub;
          state.ledger = [{ id: state.ledger.length + 1, amountRub: body.amountRub, balanceAfter: row.balanceRub, kind: 'adjust', description: `Корректировка: ${body.reason}`, orderId: null, createdAt: now }, ...state.ledger];
          return route.fulfill({ json: { balanceRub: row.balanceRub, message: `Готово: на балансе ${row.balanceRub} ₽` } });
        }
        return route.fulfill({ json: { companyId: id, companyName: row.companyName, balanceRub: row.balanceRub, history: state.ledger } });
      }
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
      check(await tab.locator('.cabinet-main').getByRole('radio').count() === 0, 'plans shown in app');
      check(await tab.getByRole('button', { name: /Перейти к оплате/ }).count() === 0, 'pay button in app');
      check(await tab.getByText(/Робокасс/).count() === 0, 'payment text in app');
      check(errors.length === 0, `app errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 5б. Промокод: скидка в сумме, код уходит в заказ; ссылка ?promo=FREE — тариф без оплаты.
  {
    const { context, tab, errors, calls } = await open();
    try {
      await tab.goto(base + '/admin/billing');
      await tab.getByRole('button', { name: 'Есть промокод?' }).click();
      const promoInput = tab.getByRole('textbox', { name: 'Промокод' });
      await promoInput.fill('nope');
      await tab.getByRole('button', { name: 'Применить' }).click();
      await tab.getByText('Такого промокода нет').waitFor();
      await promoInput.fill('start');
      await tab.getByRole('button', { name: 'Применить' }).click();
      await tab.getByText(/START: скидка −20 %/).waitFor();
      await tab.locator('.billing-summary').getByText('792 ₽', { exact: true }).waitFor();
      await tab.locator('.billing-summary').getByText('−198 ₽').waitFor();
      // Срок поменяли — скидка пересчитана.
      await tab.getByRole('radio', { name: /12 месяцев/ }).click();
      await tab.locator('.billing-summary').getByText('7 920 ₽', { exact: true }).waitFor();
      await tab.getByRole('checkbox', { name: /Я согласен на автоматические списания/ }).check();
      await tab.locator('.billing-consent').getByText(/Спишем 9\s900\s₽ раз в год.*только на этот платёж \(7\s920\s₽\)/).waitFor();
      await tab.getByRole('button', { name: /Перейти к оплате · 7\s920\s₽/ }).click();
      await tab.waitForURL('**/billing/success**');
      const sent = calls.find((c) => c.p === '/api/billing/checkout');
      check(sent?.body?.promoCode === 'START' && sent.body.expectedRub === 7920, `promo checkout ${JSON.stringify(sent?.body)}`);

      await tab.goto(base + '/admin/billing?promo=free');
      await tab.getByText(/FREE: скидка −100 %/).waitFor();
      check(await tab.getByRole('textbox', { name: /Почта для чека/ }).count() === 0, 'receipt email shown for free promo');
      check(await tab.getByRole('checkbox', { name: /автоматические списания/ }).count() === 0, 'recurring consent shown for free promo');
      await tab.getByRole('button', { name: 'Включить тариф по промокоду' }).click();
      await tab.locator('.billing-paid').getByText(/Тариф включён/).waitFor();
      check(errors.length === 0, `promo errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 5в. Счёт для юрлица: реквизиты с проверкой ИНН, счёт и ссылка на PDF, УПД в истории; 390px.
  {
    const paidOrder = { id: 60, plan: 'team', months: 1, amountRub: 990, description: 'x', status: 'paid', isTest: false, automatic: false, createdAt: now - 40 * DAY, paidAt: now - 40 * DAY, planUntil: now - 10 * DAY, refundStatus: null, method: 'card', promoCode: null, discountRub: 0, invoiceDueAt: null, hasInvoice: false, hasUpd: true };
    const { context, tab, errors, calls } = await open({ info: { ...baseInfo(), invoiceAvailable: true, orders: [paidOrder] } });
    try {
      await tab.setViewportSize({ width: 390, height: 844 });
      await tab.goto(base + '/admin/billing');
      await tab.getByRole('radio', { name: /Счёт для юрлица или ИП/ }).click();
      const form = tab.getByRole('form', { name: 'Реквизиты компании' }).first();
      check(await tab.getByRole('button', { name: /Выставить счёт/ }).isDisabled(), 'invoice button enabled without requisites');
      await form.getByRole('textbox', { name: 'Название организации' }).fill('ООО «Столовая»');
      await form.getByRole('textbox', { name: 'ИНН' }).fill('7707083894');
      await form.getByRole('textbox', { name: 'КПП' }).fill('773601001');
      await form.getByRole('textbox', { name: 'Юридический адрес' }).fill('117312, г. Москва, ул. Вавилова, д. 19');
      await form.getByRole('button', { name: 'Сохранить реквизиты' }).click();
      await form.getByText(/ИНН организации — 10 цифр, проверьте его/).waitFor();
      check(!calls.some((c) => c.p === '/api/billing/requisites'), 'invalid requisites sent');
      await form.getByRole('textbox', { name: 'ИНН' }).fill('7707083893');
      await form.getByRole('button', { name: 'Сохранить реквизиты' }).click();
      await tab.locator('.billing-requisites-summary').first().getByText('ООО «Столовая»').waitFor();
      check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'invoice form overflows at 390');
      await tab.getByRole('button', { name: /Выставить счёт · 990\s₽/ }).click();
      await tab.getByText(/Счёт №90 на 990/).waitFor();
      check(await tab.getByRole('link', { name: /Скачать счёт/ }).getAttribute('href') === '/api/billing/orders/90/invoice.pdf', 'invoice pdf link');
      const inv = calls.find((c) => c.p === '/api/billing/invoice');
      check(inv?.body?.plan === 'team' && inv.body.months === 1 && inv.body.expectedRub === 990, `invoice body ${JSON.stringify(inv?.body)}`);
      const history = tab.locator('.billing-order', { hasText: '№60' });
      check(await history.getByRole('link', { name: 'УПД' }).getAttribute('href') === '/api/billing/orders/60/upd.pdf', 'upd link');
      await tab.locator('.billing-order', { hasText: '№90' }).getByText('по счёту').waitFor();
      await tab.screenshot({ path: 'output/playwright/billing-invoice-390.png', fullPage: true });
      check(errors.length === 0, `invoice errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 5г. Акция, постоянная скидка и баллы в сумме; баланс с историей; пополнение картой в окне кассы.
  {
    const info = {
      ...baseInfo(),
      promotion: { id: 3, title: 'Осень', percent: 20, startsAt: now - DAY, endsAt: now + 5 * DAY },
      lifetimeDiscounts: [{ code: 'VIP', kind: 'percent', value: 10, label: '−10 %', boundAt: now - 9 * DAY, expiresAt: null }],
      balance: { amountRub: 300, heldRub: 0, history: [{ id: 1, amountRub: 300, balanceAfter: 300, kind: 'adjust', description: 'Корректировка: бонус за отзыв', orderId: null, createdAt: now - DAY }] },
    };
    const { context, tab, errors, calls } = await open({ info, rkScript: true, orders: { 88: { paidAfter: 1, amount: 3000 } } });
    try {
      await tab.goto(base + '/admin/billing');
      await tab.locator('.billing-promotion').getByText(/Осень: −20 % на все тарифы/).waitFor();
      await tab.locator('.billing-lifetime').getByText(/Постоянная скидка −10 %/).waitFor();
      const team = tab.getByRole('radio', { name: /Команда/ });
      await team.locator('s').getByText('990 ₽').waitFor();
      await team.getByText('792 ₽').waitFor();
      const summary = tab.locator('.billing-summary');
      await summary.getByText('Акция «Осень» −20 %').waitFor();
      await summary.getByText('−198 ₽').waitFor();
      await summary.getByText('Постоянная скидка −10 %').waitFor();
      await summary.getByText('−79 ₽').waitFor();
      check(await tab.getByRole('checkbox', { name: /Списать баллы/ }).isChecked(), 'points not checked by default');
      await summary.getByText('413 ₽', { exact: true }).waitFor();
      // Код хуже постоянной скидки — остаётся постоянная.
      await tab.getByRole('button', { name: 'Есть промокод?' }).click();
      await tab.getByRole('textbox', { name: 'Промокод' }).fill('five');
      await tab.getByRole('button', { name: 'Применить' }).click();
      await tab.getByText(/Ваша постоянная скидка −10 % не меньше/).waitFor();
      await tab.getByRole('checkbox', { name: /Списать баллы/ }).uncheck();
      await summary.getByText('713 ₽', { exact: true }).waitFor();
      await tab.getByRole('checkbox', { name: /Списать баллы/ }).check();
      await tab.getByRole('button', { name: /Перейти к оплате · 413\s₽/ }).click();
      const sent = calls.find((c) => c.p === '/api/billing/checkout');
      check(sent?.body?.usePoints === true && sent.body.expectedRub === 413 && sent.body.promoCode === undefined, `points checkout ${JSON.stringify(sent?.body)}`);

      const balance = tab.locator('section', { has: tab.getByRole('heading', { name: 'Баланс' }) });
      await balance.getByText('Корректировка: бонус за отзыв').waitFor();
      await balance.getByRole('button', { name: 'Пополнить баланс' }).click();
      await balance.getByRole('textbox', { name: 'Сумма, ₽' }).fill('100');
      await balance.getByRole('button', { name: /Пополнить ·/ }).click();
      await balance.getByText(/Сумма — от 500/).waitFor();
      await balance.getByRole('button', { name: '3 000 ₽' }).click();
      await balance.getByRole('button', { name: /Пополнить · 3\s000\s₽/ }).click();
      await balance.getByText(/Ждём подтверждение оплаты — баланс обновится сам/).waitFor();
      check(await tab.evaluate(() => window.__rk?.InvId) === '88', 'topup StartPayment params');
      const topup = calls.find((c) => c.p === '/api/billing/topup');
      check(topup?.body?.amountRub === 3000 && topup.body.method === 'card', `topup body ${JSON.stringify(topup?.body)}`);
      await tab.getByText('Баланс пополнен').first().waitFor({ timeout: 15000 });
      await tab.screenshot({ path: 'output/playwright/billing-balance.png', fullPage: true });
      await tab.setViewportSize({ width: 360, height: 800 });
      await tab.waitForTimeout(200);
      check(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'balance overflows at 360');
      await tab.screenshot({ path: 'output/playwright/billing-balance-360.png', fullPage: true });
      check(errors.length === 0, `balance errors: ${errors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  // 5д. «Заполнить по ИНН»: реквизиты подставляются, ошибка — у поля ИНН.
  //     Касса не подключена — пополнение только счётом.
  {
    const { context, tab, errors, calls } = await open({ info: { ...baseInfo(), configured: false, invoiceAvailable: true, innLookup: true } });
    try {
      await tab.goto(base + '/admin/billing');
      const panel = tab.locator('section', { has: tab.getByRole('heading', { name: 'Реквизиты для документов' }) });
      await panel.getByRole('button', { name: 'Заполнить' }).click();
      const form = panel.getByRole('form', { name: 'Реквизиты компании' });
      await form.getByRole('textbox', { name: 'ИНН' }).fill('7707083894');
      await form.getByRole('button', { name: 'Заполнить по ИНН' }).click();
      await form.getByText(/ничего не нашли/).waitFor();
      await form.getByRole('textbox', { name: 'ИНН' }).fill('7707083893');
      await form.getByRole('button', { name: 'Заполнить по ИНН' }).click();
      await form.getByText('Нашли по ИНН — проверьте и сохраните.').waitFor();
      check(await form.getByRole('textbox', { name: 'Название организации' }).inputValue() === 'ПАО «СБЕРБАНК»', 'name not filled');
      check(await form.getByRole('textbox', { name: 'КПП' }).inputValue() === '773601001', 'kpp not filled');
      await form.getByRole('button', { name: 'Сохранить реквизиты' }).click();
      await panel.locator('.billing-requisites-summary').getByText('ПАО «СБЕРБАНК»').waitFor();
      const saved = calls.find((c) => c.p === '/api/billing/requisites' && c.method === 'PUT');
      check(saved?.body?.inn === '7707083893' && saved.body.headName === 'Греф Герман Оскарович', `requisites body ${JSON.stringify(saved?.body)}`);
      const balance = tab.locator('section', { has: tab.getByRole('heading', { name: 'Баланс' }) });
      await balance.getByRole('button', { name: 'Пополнить баланс' }).click();
      check(await balance.getByRole('radio', { name: /Картой/ }).count() === 0, 'card topup offered without cashbox');
      await balance.getByRole('button', { name: /Выставить счёт · 1\s000\s₽/ }).click();
      await balance.getByText(/Счёт №91 на 1\s000/).waitFor();
      const topup = calls.find((c) => c.p === '/api/billing/topup');
      check(topup?.body?.method === 'invoice' && topup.body.amountRub === 1000, `invoice topup body ${JSON.stringify(topup?.body)}`);
      check(errors.length === 0, `inn errors: ${errors.join('; ')}`);
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
      check(await cashbox.locator('.root-cashbox-list .is-ok').count() === 5, 'cashbox: 5 settings set (login, #1, #2, recurring, DaData)');
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
      const bakery = tab.locator('.billing-order', { hasText: '№70' });
      await bakery.getByRole('button', { name: 'Вернуть деньги' }).click();
      const dialog = tab.getByRole('dialog');
      await dialog.getByText(/отменить возврат нельзя/).waitFor();
      check(!calls.some((c) => /\/refund$/.test(c.p)), 'refund sent before confirm');
      await dialog.getByRole('button', { name: 'Вернуть деньги' }).click();
      await bakery.getByText('возврат в обработке').waitFor();
      check(await bakery.getByRole('button', { name: 'Вернуть деньги' }).count() === 0, 'refund button still shown');
      check(calls.filter((c) => c.p === '/api/root/billing/orders/70/refund').length === 1, 'refund calls');

      // Счета и УПД: чего не хватает — видно в «Кассе».
      await cashbox.getByText(/не хватает реквизитов исполнителя/).waitFor();
      await cashbox.getByText('LEGAL_BANK_BIK — БИК, 9 цифр').waitFor();

      // Счёт: без «Проверить в кассе» и «Вернуть деньги»; оплату отмечает root.
      const canteen = tab.locator('.billing-order', { hasText: 'ООО Столовая' });
      check(await canteen.getByRole('button', { name: 'Проверить в кассе' }).count() === 0, 'reconcile on invoice');
      check(await canteen.getByRole('link', { name: 'Счёт' }).getAttribute('href') === '/api/billing/orders/72/invoice.pdf', 'root invoice link');
      await canteen.getByRole('button', { name: 'Отметить оплату' }).click();
      await tab.getByRole('dialog').getByText(/деньги по счёту №72 пришли/).waitFor();
      await tab.getByRole('dialog').getByRole('button', { name: 'Деньги пришли' }).click();
      await canteen.getByText('Оплачен').waitFor();
      check(calls.filter((c) => c.p === '/api/root/billing/orders/72/invoice-paid').length === 1, 'invoice-paid calls');

      // Промокоды: список, новый код, выключение.
      const promos = tab.locator('section', { has: tab.getByRole('heading', { name: 'Промокоды' }) });
      await promos.getByText('оплат: 3 из 100').waitFor();
      await promos.getByRole('button', { name: 'Новый промокод' }).click();
      await promos.getByRole('textbox', { name: 'Код' }).fill('autumn');
      await promos.getByRole('spinbutton', { name: 'Размер скидки' }).fill('500');
      await promos.getByRole('combobox', { name: 'Вид скидки' }).selectOption('fixed');
      await promos.getByRole('button', { name: 'Создать промокод' }).click();
      await promos.getByText('AUTUMN').waitFor();
      const createdPromo = calls.find((c) => c.p === '/api/root/billing/promo-codes' && c.method === 'POST');
      check(createdPromo?.body?.code === 'AUTUMN' && createdPromo.body.kind === 'fixed' && createdPromo.body.value === 500, `promo body ${JSON.stringify(createdPromo?.body)}`);
      await promos.locator('.billing-order', { hasText: 'START' }).getByRole('button', { name: 'Выключить' }).click();
      await promos.locator('.billing-order', { hasText: 'START' }).getByText('выключен').waitFor();
      // Акции: прошлая — «закончилась»; новая — с датами по Москве.
      const promotions = tab.locator('section', { has: tab.getByRole('heading', { name: 'Акции' }) });
      await promotions.getByText('закончилась').waitFor();
      await promotions.getByRole('button', { name: 'Новая акция' }).click();
      await promotions.getByRole('textbox', { name: /Название/ }).fill('Осень');
      await promotions.getByRole('spinbutton', { name: 'Скидка, %' }).fill('20');
      await promotions.getByLabel('По (включительно)').fill('2030-11-30');
      await promotions.getByRole('button', { name: 'Создать акцию' }).click();
      await promotions.locator('.billing-order', { hasText: 'Осень' }).getByText('идёт').waitFor();
      const createdPromotion = calls.find((c) => c.p === '/api/root/billing/promotions' && c.method === 'POST');
      check(
        createdPromotion?.body?.percent === 20 && createdPromotion.body.endsAt === Math.floor(Date.parse('2030-12-01T00:00:00+03:00') / 1000),
        `promotion body ${JSON.stringify(createdPromotion?.body)}`,
      );

      // Постоянные скидки: снять — через подтверждение.
      const discounts = tab.locator('section', { has: tab.getByRole('heading', { name: 'Постоянные скидки' }) });
      await discounts.getByText(/Пекарня · −10 %/).waitFor();
      await discounts.getByRole('button', { name: 'Снять' }).click();
      await tab.getByRole('dialog').getByRole('button', { name: 'Снять скидку' }).click();
      await discounts.getByText('снята').waitFor();
      check(calls.some((c) => c.p === '/api/root/billing/discounts/5/revoke'), 'revoke by discount id');

      // Балансы: история и корректировка; в минус — понятная ошибка.
      const balances = tab.locator('section', { has: tab.getByRole('heading', { name: 'Балансы компаний' }) });
      await balances.getByRole('button', { name: /Пекарня/ }).click();
      await balances.getByText('Пополнение баланса, заказ №73').waitFor();
      await balances.getByRole('spinbutton', { name: /Сумма/ }).fill('-5000');
      await balances.getByRole('textbox', { name: /Причина/ }).fill('ошибка');
      await balances.getByRole('button', { name: 'Изменить баланс' }).click();
      await balances.getByText(/Нельзя списать больше/).waitFor();
      await balances.getByRole('spinbutton', { name: /Сумма/ }).fill('300');
      await balances.getByRole('textbox', { name: /Причина/ }).fill('компенсация');
      await balances.getByRole('button', { name: 'Изменить баланс' }).click();
      await balances.getByText('Корректировка: компенсация').waitFor();
      await tab.locator('.billing-order', { hasText: 'Пекарня · пополнение баланса' }).getByRole('link', { name: 'УПД' }).waitFor();
      await promotions.screenshot({ path: 'output/playwright/billing-root-promotions.png' });
      await discounts.screenshot({ path: 'output/playwright/billing-root-discounts.png' });
      await balances.screenshot({ path: 'output/playwright/billing-root-balances.png' });
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
  return { checks: 'form + defaults, consent unchecked, 12m + consent + email body, fallback redirect + success, fail page, iframe StartPayment + inline paid, recurring disable, carry-over text, not configured, 390 + dark, iOS app without payment, promo + ?promo + free, invoice + requisites + docs 390, promotion + lifetime + points + topup 360, inn lookup, root cashbox + check + docs + prices + promotions + promo codes + lifetime revoke + balances adjust + reconcile + refund confirm + invoice paid + 390', failures };
}
