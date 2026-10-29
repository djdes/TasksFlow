// Подготовка браузера и вход для снимков TasksFlow (см. SKILL.md рядом).

// Тема, движение и разовые подсказки — из localStorage: без этого на снимке тур
// онбординга, совет дня и плашка приложения, а блоки публичных страниц ждут прокрутки.
export async function prepareContext(context, { theme }) {
  await context.addInitScript((mode) => {
    try {
      const d = new Date();
      localStorage.setItem('theme-preference', mode);
      localStorage.setItem('tf_motion_enabled', 'false');
      localStorage.setItem('tf_onboarded_v1', 'true');
      localStorage.setItem('tf_app_nudge_dismissed', String(Date.now()));
      localStorage.setItem('tf_tip_dismiss_date', `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
    } catch {}
  }, theme === 'dark' ? 'dark' : 'light');
}

// Вход по телефону и PIN (лимит — 10 попыток за 15 минут с IP; shots.mjs входит один раз
// на прогон и кэширует сессию). Дев-стенд: админ и root из dev-stand/seed.mjs.
export async function login(context, { base, role }) {
  const users = {
    admin: { phone: '+79990000001', pin: '4826' },
    worker: { phone: '+79990000002', pin: '5937' },
  };
  const who = users[role || 'admin'] || users.admin;
  const phone = process.env.SHOTS_PHONE || who.phone;
  const pin = process.env.SHOTS_PIN || who.pin;
  const res = await context.request.post(new URL('/api/auth/login', base).href, { data: { phone, pin } });
  if (!res.ok()) throw new Error(`вход ${phone}: HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`);
}
