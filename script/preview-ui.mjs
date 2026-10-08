// Local preview of the built SPA and SSR landing. No API, credentials or database.
// Build first: npm run build. Start: node script/preview-ui.mjs
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../dist/server/entry-server.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(project, 'dist/public');
const app = express();
app.get('/', async (_req, res, next) => {
  try {
    const data = { featuredPosts: [], totalPosts: 0, banners: [] };
    const result = render('/', data, 'http://127.0.0.1:5301');
    const template = await fs.readFile(path.join(assets, 'public.html'), 'utf8');
    res.type('html').send(template.replace('<!--app-head-->', result.head)
      .replace('<!--app-html-->', result.appHtml)
      .replace('<!--app-data-->', `<script>window.__SSR_DATA__=${JSON.stringify(data)}</script>`));
  } catch (error) { next(error); }
});
app.use('/api', (_req, res) => res.status(503).json({ message: 'UI preview: use browser API fixtures.' }));
app.use(express.static(assets, { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(assets, 'index.html')));
app.listen(5301, '127.0.0.1', () => console.log('UI preview: http://127.0.0.1:5301'));
