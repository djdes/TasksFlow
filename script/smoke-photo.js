// Фото-отчёт на UI-превью: большое фото уходит сжатым до 1600 px JPEG,
// «только камера» открывает камеру, без сети фото встаёт в очередь
// (IndexedDB) и уходит само по событию online. API подменён фикстурами.
async (page) => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  // Большое «фото с телефона»: 4000×3000 JPEG с шумом.
  const gen = await browser.newPage();
  const b64 = await gen.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 4000, 3000); g.addColorStop(0, '#3a6'); g.addColorStop(1, '#36c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4000, 3000);
    const img = ctx.getImageData(0, 0, 4000, 3000);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() * 60) | 0; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await gen.close();
  const bigBuffer = Buffer.from(b64, 'base64');
  const bigSize = bigBuffer.length;

  function jpegSize(buf) {
    for (let i = 2; i < buf.length - 9; ) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  function multipartFile(body) {
    const start = body.indexOf(Buffer.from('\r\n\r\n')) + 4;
    const end = body.lastIndexOf(Buffer.from('\r\n--'));
    return body.subarray(start, end);
  }

  const worker = { id: 7, name: 'Анна', phone: '+79990000007', isAdmin: false, isRoot: false, companyId: 1, bonusBalance: 0, createdAt: 1, managedWorkerIds: null, hasPin: true };
  const task = { id: 1, title: 'Протереть витрину', workerId: 7, requiresPhoto: true, photoUrl: null, photoUrls: [], examplePhotoUrls: [], isCompleted: false, weekDays: null, monthDay: null, isRecurring: true, price: 100, category: 'Уборка', description: null, companyId: 1, journalLink: null, createdAt: Math.floor(Date.now() / 1000) - 3600, completedAt: null, claimedByWorkerId: null, verificationStatus: null, verifierWorkerId: null, checklist: [], dueDate: null };

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(() => localStorage.setItem('tf_onboarded_v1', 'true'));
  const tab = await context.newPage();
  tab.setDefaultTimeout(15000);
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  let online = false;
  const uploads = [];
  await tab.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/auth/me') return route.fulfill({ json: worker });
    if (p === '/api/users') return route.fulfill({ json: [worker] });
    if (p === '/api/companies/me') return route.fulfill({ json: { id: 1, name: 'Кафе «Ромашка»', wesetupConfigured: false, photo: { stamp: true, cameraOnly: true } } });
    if (p === '/api/tasks') return route.fulfill({ json: [task] });
    if (p === '/api/tasks/1/photo' && req.method() === 'POST') {
      if (!online) return route.abort('internetdisconnected');
      const body = req.postDataBuffer();
      uploads.push(body);
      return route.fulfill({ json: { photoUrl: '/uploads/x.jpg', photoUrls: ['/uploads/x.jpg'] } });
    }
    if (p === '/api/events') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ json: [] });
  });

  await tab.goto(base + '/dashboard');
  await tab.getByRole('button', { name: 'Протереть витрину', exact: true }).first().click();
  const dialog = tab.getByRole('dialog');
  await dialog.waitFor();
  const input = dialog.locator('#photo-upload');
  check(await input.getAttribute('capture') === 'environment', 'camera-only did not set capture');
  await input.setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: bigBuffer });
  await tab.getByText('Фото сохранено и отправится само', { exact: false }).first().waitFor();
  await dialog.getByText('1 фото ждёт сети — отправится само').waitFor();
  await tab.screenshot({ path: 'output/playwright/photo-queued.png' });

  online = true;
  await tab.evaluate(() => window.dispatchEvent(new Event('online')));
  await tab.getByText('Фото отправлено', { exact: true }).first().waitFor();
  await dialog.getByText('1 фото ждёт сети — отправится само').waitFor({ state: 'detached' });
  check(uploads.length === 1, `uploads: ${uploads.length}`);
  const file = multipartFile(uploads[0]);
  const dim = jpegSize(file);
  const stats = { original: bigSize, sent: file.length, dim, ratio: +(bigSize / file.length).toFixed(1) };
  check(file[0] === 0xff && file[1] === 0xd8, 'sent file is not a JPEG');
  check(dim && dim.width === 1600 && dim.height === 1200, `sent dimensions ${JSON.stringify(dim)}`);
  check(file.length < bigSize / 4, `compression too weak: ${file.length} of ${bigSize}`);
  check(errors.length === 0, `errors: ${errors.join('; ')}`);
  await context.close();
  if (failures.length) throw new Error(failures.join('\n'));
  return { checks: 'compression to 1600px JPEG, time stamp, camera-only capture, offline queue and resend on online', stats, failures };
}
