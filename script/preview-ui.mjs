// Local preview of the built SPA and SSR landing. No API, credentials or database.
// Build first: npm run build. Start: node script/preview-ui.mjs (PORT env, default 5301).
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { render } from '../dist/server/entry-server.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(project, 'dist/public');
const port = Number(process.env.PORT) || 5301;
const origin = `http://127.0.0.1:${port}`;
const app = express();
async function ssr(res, pathname, data) {
  const result = render(pathname, data, origin);
  const template = await fs.readFile(path.join(assets, 'public.html'), 'utf8');
  res.type('html').send(template.replace('<!--app-head-->', result.head)
    .replace('<!--app-html-->', result.appHtml)
    .replace('<!--app-data-->', `<script>window.__SSR_DATA__=${JSON.stringify(data)}</script>`));
}
app.get('/', (_req, res, next) => {
  ssr(res, '/', { featuredPosts: [], totalPosts: 0, banners: [] }).catch(next);
});
// «Приложение»: фикстура опубликованного APK, магазинов нет — как сразу после выкладки.
app.get('/app', async (_req, res, next) => {
  try {
    const url = `${origin}/app`;
    const info = {
      android: { apk: { url: '/downloads/tasksflow.apk', versionName: '1.0.0', size: 1650000, builtAt: null }, playUrl: null, rustoreUrl: null },
      ios: { appStoreUrl: null, testflightUrl: null },
    };
    await ssr(res, '/app', { info, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 0 }), url });
  } catch (error) { next(error); }
});
app.use('/api', (_req, res) => res.status(503).json({ message: 'UI preview: use browser API fixtures.' }));
app.use(express.static(assets, { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(assets, 'index.html')));
app.listen(port, '127.0.0.1', () => console.log(`UI preview: ${origin}`));
