// Run after smoke-motion.js, in the same browser session (reuses isolated API fixtures).
async (page) => {
  const base = new URL(page.url()).origin;
  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/dashboard');
  await page.getByRole('heading',{name:'Задачи',exact:true}).waitFor();
  await page.locator('.worker-section-header').first().click();
  await page.getByRole('heading',{name:'Открыть смену',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.evaluate(el => Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  check(await dialog.evaluate(el=>el.contains(document.activeElement)),'Focus escaped the mobile dialog');
  const rect=await dialog.boundingBox();
  check(rect.y>=0 && rect.y+rect.height<=845,'Long dialog is outside the viewport');
  await page.screenshot({path:'output/playwright/mobile-task.png'});
  const before=await page.locator('#root').evaluate(el=>el.scrollTop);
  await dialog.hover();
  await page.mouse.wheel(0,550);
  await dialog.getByRole('button',{name:'Завершить задачу',exact:true}).scrollIntoViewIfNeeded();
  check(await page.locator('#root').evaluate(el=>el.scrollTop)===before,'Background scrolled under sheet');
  check(await dialog.evaluate(el=>el.scrollTop)>0,'Long sheet content does not scroll');
  check(await dialog.getByRole('button',{name:'Завершить задачу',exact:true}).evaluate(el=>{
    const r=el.getBoundingClientRect();
    const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return top===el || el.contains(top);
  }),'Sheet action is covered after scrolling');
  await dialog.evaluate(el=>{ el.scrollTop=el.scrollHeight; });
  const actionBox=await dialog.getByRole('button',{name:'Завершить задачу',exact:true}).boundingBox();
  check(actionBox.y>=0 && actionBox.y+actionBox.height<=844,'Empty overscroll area hides the sheet action');
  await page.screenshot({path:'output/playwright/mobile-task-scrolled.png'});
  await page.setViewportSize({width:390,height:460});
  const input=dialog.getByPlaceholder('Напишите комментарий к задаче...');
  if(await input.count()) {
    await input.fill('Проверка доступности при открытой клавиатуре');
    await input.scrollIntoViewIfNeeded();
    const inputBox=await input.boundingBox();
    check(inputBox.y>=0 && inputBox.y+inputBox.height<=461,'Input hidden in a short viewport');
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  await page.setViewportSize({width:360,height:780});
  await page.goto(base+'/admin/invitations');
  await page.getByRole('button',{name:'Сгенерировать QR'}).click();
  await dialog.waitFor();
  await dialog.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const grip=await dialog.locator('[data-vaul-handle]').first().boundingBox();
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:grip.x+grip.width/2,y:grip.y+2}]});
  for(let i=1;i<=10;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:grip.x+grip.width/2,y:grip.y+2+i*16}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await dialog.waitFor({state:'hidden'});
  await cdp.detach();
  // Public SSR login must share the same sheet, focus trap and Escape behavior.
  await page.route('**/api/auth/me', route=>route.fulfill({status:401,json:{message:'Not authenticated'}}));
  await page.goto(base+'/');
  await page.getByRole('button',{name:'Войти',exact:true}).first().click();
  await dialog.waitFor();
  check(await dialog.getAttribute('data-mobile-sheet')==='true','Public login does not use a sheet');
  check((await dialog.innerText()).includes('Вход в TasksFlow'),'Public login title is corrupted');
  await dialog.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await page.screenshot({path:'output/playwright/mobile-public-login.png'});
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  console.log(JSON.stringify({checks:'long sheet, scroll, focus, 360px, short viewport, native touch swipe, public SSR login',failures}));
  if(failures.length) throw new Error(failures.join('\n'));
  return { checks: 'long sheet, scroll, focus, 360px, short viewport, native touch swipe, public SSR login', failures };
}
