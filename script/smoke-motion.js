// Run against an isolated Vite server using playwright-cli run-code --filename.
// API fixtures never reach the real database. Artifacts: output/playwright/.
async (page) => {
  const base = new URL(page.url()).origin;
  const failures = [];
  const errors = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.unrouteAll({ behavior: 'wait' });
  const admin = { id: 1, name: 'Анна Смирнова', phone: '+79990000001', email: 'smoke@example.test', isAdmin: true, isRoot: true, createdAt: 1, bonusBalance: 400, companyId: 1, managedWorkerIds: null, position: 'Управляющая' };
  let failTasks = false;
  let failSession = false;
  let delay = 350;
  const tasks = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1, title: ['Открыть смену', 'Проверить чистоту витрины', 'Проверить ценники', 'Принять поставку', 'Проверить остатки', 'Подготовить отчёт'][i],
    workerId: 1, requiresPhoto: false, photoUrl: null, photoUrls: [], examplePhotoUrl: null, examplePhotoUrls: [], isCompleted: false,
    weekDays: [0,1,2,3,4,5,6], monthDay: null, isRecurring: true, price: 100, category: 'Открытие смены',
    description: 'Проверьте рабочее место перед началом смены. '.repeat(30), companyId: 1, journalLink: null,
    createdAt: Math.floor(Date.now()/1000), completedAt: null, checklist: [], verificationStatus: null, dueDate: null,
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await new Promise(resolve => setTimeout(resolve, delay));
    if ((failTasks && path === '/api/tasks') || (failSession && path === '/api/auth/me')) return route.fulfill({ status: 503, json: { message: 'Smoke network failure' } });
    let data = [];
    if (path === '/api/auth/me') data = admin;
    else if (path === '/api/tasks') data = tasks;
    else if (/^\/api\/tasks\/\d+$/.test(path)) data = tasks[0];
    else if (path === '/api/users') data = [admin];
    else if (path === '/api/workers') data = [{id:1,name:admin.name,companyId:1}];
    else if (path === '/api/workers/1') data = {id:1,name:admin.name,companyId:1};
    else if (path === '/api/companies/me') data = {id:1,name:'Тестовая компания',email:'smoke@example.test',wesetupBaseUrl:null,wesetupApiKey:null};
    else if (path === '/api/me/telegram') data = {connected:false,botConfigured:false};
    else if (path.includes('/wesetup/')) data = {enabled:false,ok:false,configured:false,message:'Интеграция не подключена'};
    else if (path.includes('webhook-queue')) data = {stats:{pending:0,delivered:0,failed:0,cancelled:0},recentFailed:[]};
    else if (path.includes('/invitations/by-token/')) data = {valid:true,companyName:'Тестовая компания',position:'Кассир'};
    await route.fulfill({ json:data });
  });
  await page.addInitScript(() => {
    localStorage.setItem('tf_onboarded_v1','true');
    localStorage.setItem('theme-preference','light');
  });
  await page.evaluate(() => localStorage.removeItem('tf_motion_enabled'));
  await page.setViewportSize({width:1440,height:1000});
  delay = 1600;
  await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('[data-page-skeleton]').waitFor({state:'visible'});
  await page.screenshot({path:'output/playwright/desktop-skeleton.png'});
  await page.getByRole('heading',{name:'Задачи',exact:true}).waitFor();
  check(await page.locator('[data-page-skeleton]').count() === 0,'Skeleton stayed after data loaded');
  await page.screenshot({path:'output/playwright/desktop-dashboard.png'});
  delay = 100;
  await page.getByRole('button',{name:'Меню',exact:true}).click();
  await page.getByRole('switch',{name:'Анимации интерфейса'}).waitFor();
  check(await page.getByRole('switch',{name:'Анимации интерфейса'}).getAttribute('aria-checked')==='true','Motion is not enabled by default');
  await page.getByRole('switch',{name:'Анимации интерфейса'}).click();
  check(await page.locator('html').getAttribute('data-motion')==='reduced','Toggle did not disable CSS motion');
  await page.reload();
  await page.getByRole('heading',{name:'Задачи',exact:true}).waitFor();
  check(await page.locator('html').getAttribute('data-motion')==='reduced','Motion preference did not survive reload');
  await page.getByRole('button',{name:'Меню',exact:true}).click();
  await page.getByRole('switch',{name:'Анимации интерфейса'}).click();
  await page.getByRole('button',{name:'Приглашения',exact:true}).click();
  await page.getByRole('heading',{name:'Приглашения',exact:true}).waitFor();
  await page.getByRole('button',{name:'Сгенерировать QR'}).click();
  let dialog = page.getByRole('dialog');
  await dialog.waitFor();
  check(await dialog.getAttribute('data-mobile-sheet') === null,'Desktop unexpectedly uses a sheet');
  await page.screenshot({path:'output/playwright/desktop-dialog.png'});
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  check(await page.getByRole('button',{name:'Сгенерировать QR'}).evaluate(el => el === document.activeElement),'Dialog did not restore keyboard focus');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Сгенерировать QR'}).click();
  await dialog.waitFor();
  check(await dialog.getAttribute('data-mobile-sheet') === 'true','Mobile dialog is not a sheet');
  await dialog.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.screenshot({path:'output/playwright/mobile-invitation.png'});
  await dialog.getByRole('combobox').click();
  await page.getByRole('option',{name:'Менеджер',exact:true}).click();
  check(await dialog.getByRole('combobox').innerText() === 'Менеджер','Select inside sheet is not clickable');
  await dialog.getByLabel('Должность (необязательно)').fill('Кассир');
  const handle = dialog.locator('[data-vaul-handle]').first();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+180,{steps:12});
  await page.mouse.up();
  await dialog.waitFor({state:'hidden'});
  await page.goto(base+'/dashboard');
  await page.getByRole('heading',{name:'Задачи',exact:true}).waitFor();
  await page.getByRole('button',{name:'Меню',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.screenshot({path:'output/playwright/mobile-menu.png'});
  await page.getByRole('dialog').getByRole('button',{name:'Мой аккаунт'}).click();
  await page.getByRole('heading',{name:'Аккаунт',exact:true}).waitFor();
  check(await page.locator('input[type=email]').inputValue()==='smoke@example.test','Account email lost after auth loading');
  await page.getByRole('radio',{name:'Тёмная',exact:true}).click();
  check(await page.locator('html').evaluate(el => el.classList.contains('dark')),'Dark theme did not apply');
  await page.screenshot({path:'output/playwright/mobile-dark-account.png'});
  const routes = ['/admin/users','/admin/settings','/admin/api-keys','/admin/integrations','/admin/verification','/admin/invitations','/admin/banners','/tasks/new','/tasks/1/edit','/workers/new','/workers/1/edit','/account','/help','/instructions','/join/smoke'];
  for (const path of routes) {
    await page.goto(base+path);
    await page.locator('[data-page-skeleton]:visible').first().waitFor({state:'hidden'});
    await page.locator('h1,h2').first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth>innerWidth+1 || document.querySelector('#root').scrollWidth>innerWidth+1);
    check(!overflow,'Horizontal overflow on mobile: '+path);
    check(!(await page.getByText('Что-то пошло не так',{exact:true}).count()),'Error boundary: '+path);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(base+'/dashboard');
  await page.getByRole('heading',{name:'Задачи',exact:true}).waitFor();
  check(await page.locator('html').getAttribute('data-motion')==='reduced','OS reduced motion ignored');
  await page.emulateMedia({reducedMotion:'no-preference'});
  failTasks=true;
  await page.reload();
  await page.getByRole('alert').waitFor();
  failTasks=false;
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.getByRole('alert').waitFor({state:'hidden'});
  failSession=true;
  await page.reload();
  await page.getByRole('alert').waitFor();
  check((await page.getByRole('alert').innerText()).includes('сервером'),'Session error is not actionable');
  failSession=false;
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.getByRole('heading',{name:'Задачи',exact:true}).waitFor();
  check(errors.length===0,'Browser errors: '+errors.join('; '));
  console.log(JSON.stringify({routes:routes.length,failures,errors}));
  if(failures.length) throw new Error(failures.join('\n'));
  return { routes: routes.length, failures, errors };
}
