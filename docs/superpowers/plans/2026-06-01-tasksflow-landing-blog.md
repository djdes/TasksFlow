# TasksFlow Landing + SEO Blog + Email Auth + PHP Mail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a long public SSR landing + SEO blog (~150 RU articles) on TasksFlow, with ordersflow-style email auto-registration/auto-login, PHP-only email delivery, breadcrumbs, and generated SVG article covers.

**Architecture:** Keep the existing React+wouter cabinet as CSR SPA. Add an isolated public React app (landing + blog) rendered server-side in Express (Vite SSR) and hydrated for interactivity (auth form, theme, TOC). Email auth grafts onto the existing express-session model (set `req.session.userId`); new nullable columns on `users`. Email sent only via a `send.php` relay in the web-root.

**Tech Stack:** React 18, Vite SSR (`react-dom/server`), Express, Drizzle/MySQL, Tailwind 3 + shadcn, wouter, markdown-it + gray-matter, Node `crypto` (scrypt), Node `dns`, lucide-react, framer-motion.

---

## File Structure

### Phase A — Auth + Mail backend
- Create `server/crypto-password.ts` — scrypt hash/verify, password & token generators.
- Create `server/email-validate.ts` — format regex, typo-domain map, MX DNS check (cached).
- Create `server/mailer.ts` — transport chain (dev outbox → php-relay), `sendMail()`.
- Create `server/email-templates.ts` — `welcome` / `login-link` / `recovery` HTML (indigo).
- Create `php-relay/send.php` — token-guarded `mail()` relay.
- Modify `shared/schema.ts` — add `email/passwordHash/magicToken/magicTokenExpiresAt` + zod schemas.
- Modify `server/storage.ts` — `getUserByEmail`, `setUserAuthFields`, `setMagicToken`, `clearMagicToken`, `findUserByMagicToken`, `updateUserEmail`, `updateUserPassword`.
- Modify `server/routes.ts` — `/api/auth/start`, `/api/auth/login-email`, `/api/auth/recover`, `/api/auth/magic/:token`, `/api/account/email`, `/api/account/password`.
- Modify `server/auto-register.ts` (new) — create company+admin from email.
- Modify `ENV.md` — document `PHP_RELAY_URL`, `PHP_RELAY_TOKEN`, `MAIL_FROM`, `YM_ID`, `GA_ID`.
- Tests: `tests/crypto-password.test.ts`, `tests/email-validate.test.ts`, `tests/mailer.test.ts`, `tests/auth-email.test.ts`.

### Phase B — SSR infrastructure
- Create `client/src/public/` — isolated public app:
  - `entry-client.tsx` (hydrate), `entry-server.tsx` (renderToString), `PublicApp.tsx` (router), `Head.tsx` (collect meta), `routes.ts`.
- Create `server/ssr.ts` — dev (`ssrLoadModule`) + prod (built bundle) render; HTML template; state serialization.
- Modify `server/index.ts` — mount public SSR routes before SPA fallback.
- Modify `vite.config.ts` / `script/build.ts` — add SSR build (client manifest + server bundle).
- Create `client/public-index.html` — SSR template with `<!--app-head-->` / `<!--app-html-->` / `<!--app-state-->`.
- Tests: `tests/ssr-smoke.test.ts`.

### Phase C — Landing
- Create `client/src/public/landing/` components: `LandingNav`, `Hero`, `PainSolution`, `Features`, `HowItWorks`, `DemoDashboard`, `IndustryCases`, `Comparison`, `Pricing`, `BlogTeaser`, `Faq`, `CtaSection`, `Footer`, `StickyCta`, `ThemeToggle`.
- Create `client/src/public/auth/AuthModal.tsx` + `EmailField.tsx` — ordersflow structure, indigo.
- Create `client/src/public/landing/LandingPage.tsx` — compose + SEO head + JSON-LD.

### Phase D — Blog + content
- Create `content/blog/*.md` — ~150 articles (workflow-generated).
- Create `server/blog.ts` — load/parse/sort/related/tags from `content/blog`.
- Create `server/markdown.ts` — markdown-it render + heading slugs + reading-time.
- Create `server/og-cover.ts` — deterministic SVG cover by slug+cluster.
- Create `client/src/public/blog/` — `BlogIndex`, `BlogArticle`, `BlogCategory`, `Breadcrumbs`, `Toc`, `ArticleCard`, `CoverImage`.
- Create `server/sitemap.ts`, `server/robots.ts`.
- Create `client/src/public/seo.ts` — JSON-LD builders (Organization/SoftwareApplication/FAQ/Breadcrumb/BlogPosting).

---

## Phase A — Auth + Mail backend

### Task A1: Password crypto module
**Files:** Create `server/crypto-password.ts`; Test `tests/crypto-password.test.ts`

- [ ] Write failing tests: `hashPassword` returns `scrypt$14$...` format; `verifyPassword(pw, hash)` true for correct, false for wrong; `generatePassword(12)` length 12 and excludes `0O1lI`; `generateMagicToken()` matches `/^[a-f0-9]{32}$/`.
- [ ] Implement:
```ts
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
const N = 14, KEYLEN = 64, SALTLEN = 16;
export function hashPassword(pw: string): string {
  const salt = randomBytes(SALTLEN);
  const hash = scryptSync(pw, salt, KEYLEN, { N: 2 ** N });
  return `scrypt$${N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, nStr, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const hash = scryptSync(pw, Buffer.from(saltHex, "hex"), KEYLEN, { N: 2 ** Number(nStr) });
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generatePassword(len = 12): string {
  const bytes = randomBytes(len);
  let out = ""; for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
export function generateMagicToken(): string { return randomBytes(16).toString("hex"); }
```
- [ ] Run tests → PASS. Commit.

### Task A2: Email validation module
**Files:** Create `server/email-validate.ts`; Test `tests/email-validate.test.ts`

- [ ] Failing tests: `normalizeEmail(" A@B.com ")` → `a@b.com`; `isEmailFormat` rejects `a@b`, accepts `a@b.cc`; `suggestDomainFix("x@gmail.ru")` → `x@gmail.com`; `checkMx` resolves true for mocked MX, false for empty.
- [ ] Implement: regex `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`; `normalizeEmail = trim().toLowerCase()`; typo map (`gmail.ru→gmail.com`, `gmal.com→gmail.com`, `yandex.com→yandex.ru`, `mai.ru→mail.ru`, `yndex.ru→yandex.ru`, `gmail.con→gmail.com`, …) + Levenshtein-1 against a popular-domain list (gmail.com, yandex.ru, mail.ru, bk.ru, list.ru, inbox.ru, rambler.ru, ya.ru, outlook.com, hotmail.com, icloud.com); `checkMx(domain)` via `dns.promises.resolveMx` with 3s timeout + in-memory Map cache (inject resolver for tests).
- [ ] Run tests → PASS. Commit.

### Task A3: Mailer + templates + send.php
**Files:** Create `server/mailer.ts`, `server/email-templates.ts`, `php-relay/send.php`; Test `tests/mailer.test.ts`

- [ ] Failing tests: transport resolves to `dev` when no `PHP_RELAY_URL`; `php-relay` when set + production; `renderEmail("welcome", {...})` contains password + magic URL; dev outbox writes to `.dev-outbox/`.
- [ ] Implement `email-templates.ts`: `renderEmail(kind, { email, password?, magicUrl })` returning `{ subject, html }` for `welcome|login-link|recovery`, table-based, indigo `#5566f6`.
- [ ] Implement `mailer.ts`: `sendMail({ to, kind, data })` → render → transport. Dev: write `.dev-outbox/<ts>.html`. php-relay: `fetch(PHP_RELAY_URL, { method:POST, headers:{ "X-Relay-Token": TOKEN, "Content-Type":"application/json" }, body: JSON.stringify({to,subject,html}) })`, throw on non-2xx.
- [ ] Copy `send.php` from ordersflow pattern (token guard, RFC2047 subject, `mail()` with `-f`), `FROM_EMAIL=noreply@tasksflow.ru`, `FROM_NAME=TasksFlow`.
- [ ] Run tests → PASS. Commit.

### Task A4: Schema + storage for email auth
**Files:** Modify `shared/schema.ts`, `server/storage.ts`; migration via `drizzle-kit push`

- [ ] Add columns to `users` (nullable): `email`, `passwordHash`, `magicToken`, `magicTokenExpiresAt`; unique index on `email`. Add zod `startSchema` (email), `loginEmailSchema` (email+password), `updateEmailSchema`, `updatePasswordSchema`.
- [ ] Storage methods: `getUserByEmail`, `setUserAuthFields(id,{email,passwordHash})`, `setMagicToken(id,token,exp)`, `clearMagicToken(id)`, `findUserByMagicToken(token)` (checks `magicTokenExpiresAt >= now`), `updateUserEmail(id,email)`, `updateUserPassword(id,hash)`.
- [ ] Run `npm run check` + drizzle push to apply. Commit.

### Task A5: Auto-register + auth endpoints
**Files:** Create `server/auto-register.ts`; Modify `server/routes.ts`; Test `tests/auth-email.test.ts`

- [ ] `auto-register.ts`: `autoRegisterByEmail(email)` → derive placeholder company name from local-part → `createCompany` → `createUser({ email, passwordHash, isAdmin:true, companyId })` with generated password → return `{ user, password, magicToken }`.
- [ ] `POST /api/auth/start`: normalize+format+MX. If `getUserByEmail` exists → setMagicToken + `sendMail(login-link)` → `{exists:true}`. Else → autoRegister → setMagicToken → `req.session.userId=user.id` → `sendMail(welcome)` → `{exists:false}`.
- [ ] `POST /api/auth/login-email`: verifyPassword → session → user.
- [ ] `POST /api/auth/recover`: if user → new password+magicToken+`sendMail(recovery)`; always 200.
- [ ] `GET /api/auth/magic/:token`: validate `^[a-f0-9]{32}$` → findUserByMagicToken → clear → session → 302 `/dashboard`.
- [ ] Add `/api/auth/start`, `/api/auth/login-email`, `/api/auth/recover` to the auth rate-limiter.
- [ ] Tests (supertest): new email auto-registers+session+welcome queued; existing email → exists:true+login-link; bad MX → 400; magic link logs in; recover always 200. Run → PASS. Commit.

### Task A6: Account settings endpoints + page
**Files:** Modify `server/routes.ts`; Create `client/src/pages/Account.tsx`; Modify `client/src/App.tsx`

- [ ] `PUT /api/account/email` (requireAuth): normalize+MX+uniqueness → `updateUserEmail`.
- [ ] `PUT /api/account/password` (requireAuth): if user has passwordHash require `currentPassword` match → hash newPassword → `updateUserPassword`.
- [ ] `/account` page: forms for email + password using existing shadcn Form/Input/Button. Add lazy route in App.tsx.
- [ ] `npm run check`. Commit.

## Phase B — SSR infrastructure

### Task B1: Public app skeleton
- [ ] Create `client/src/public/PublicApp.tsx` (path-based router for `/`, `/blog`, `/blog/:slug`, `/blog/category/:cluster`), `Head.tsx` (context collecting title/meta/jsonld), `entry-server.tsx` (`renderToString` + collected head + dehydrated data), `entry-client.tsx` (`hydrateRoot`). SSR-safe (guard `window`).

### Task B2: Express SSR + build
- [ ] `server/ssr.ts`: dev path uses `vite.ssrLoadModule("/src/public/entry-server.tsx")`; prod loads built `dist/server/entry-server.js`. `renderPublic(url, data)` → `{ html, head, state }`. HTML template `client/public-index.html` with placeholders; inject `<script>window.__DATA__=...</script>`.
- [ ] `server/index.ts`: register public routes (`/`, `/blog*`, `/og/:slug.svg`, `/sitemap.xml`, `/robots.txt`) → SSR; keep SPA fallback for the rest; `/login` continues to serve SPA.
- [ ] `script/build.ts`: add `vite build --ssr src/public/entry-server.tsx --outDir dist/server` + client build with manifest.
- [ ] `tests/ssr-smoke.test.ts`: GET `/` returns 200 + `<h1>` text in HTML + `<title>`. Run → PASS. Commit.

## Phase C — Landing

### Task C1: Theme + shell
- [ ] `ThemeToggle` (class on `<html>`, persisted in cookie for SSR no-flash), `LandingNav`, `Footer`, `StickyCta`.

### Task C2: AuthModal (ordersflow structure, indigo)
- [ ] Port `AuthModal.tsx` + `EmailField.tsx` from ordersflow structure; replace yellow with indigo; wire to `/api/auth/start` → on `{exists:false}` `window.location.href="/dashboard"`; on `{exists:true}` show "sent" + password step → `/api/auth/login-email`; "Напомнить пароль" → `/api/auth/recover`. Client typo-suggestion before submit.

### Task C3: Landing sections
- [ ] Build `Hero` (with inline email form), `PainSolution`, `Features`, `HowItWorks`, `DemoDashboard`, `IndustryCases`, `Comparison`, `Pricing` (placeholder tiers), `BlogTeaser` (top featured), `Faq`. Compose in `LandingPage.tsx` with SEO head + Organization/SoftwareApplication/FAQ JSON-LD. Analytics snippet via env (`YM_ID`/`GA_ID`).
- [ ] `npm run check` + SSR smoke. Commit.

## Phase D — Blog + content

### Task D1: Markdown + blog libs
- [ ] `server/markdown.ts` (markdown-it + heading anchors + reading-time), `server/blog.ts` (`getAllPosts`, `getPost`, `getByCluster`, `getRelated`, `getAllClusters`), parse `content/blog/*.md` with gray-matter.

### Task D2: SVG covers
- [ ] `server/og-cover.ts`: `coverSvg(slug, cluster)` → deterministic gradient (hash slug → hue pair) + subtle pattern + cluster lucide glyph + label. Serve `/og/:slug.svg`.

### Task D3: Blog UI + breadcrumbs + SEO
- [ ] `Breadcrumbs` (+ BreadcrumbList JSON-LD), `BlogIndex` (cluster filter, featured, grid of `ArticleCard` with `CoverImage`), `BlogArticle` (Toc, reading progress, article HTML, related, CTA, BlogPosting+FAQ JSON-LD), `BlogCategory`.
- [ ] `server/sitemap.ts` + `server/robots.ts` (include all posts). 
- [ ] SSR smoke for `/blog` and a sample `/blog/:slug`. Commit.

### Task D4: Generate ~150 articles (Workflow)
- [ ] Author a topic plan: 4 clusters → ~8–12 pillars → supporting articles, with unique slugs/titles (dedup pass). Workflow fans out writer agents; each returns frontmatter + Markdown body (RU, practical, 700–1400 words, internal links, FAQ). Write to `content/blog/<slug>.md`. Dedup titles/H1 across the corpus.
- [ ] Rebuild, SSR smoke a random sample, verify sitemap count. Commit in batches.

---

## Self-Review
- **Spec coverage:** A↔auth/mail/account+schema; B↔SSR; C↔landing+analytics+pricing; D↔blog+covers+breadcrumbs+sitemap+150 articles. All spec sections mapped.
- **Type consistency:** `sendMail({to,kind,data})`, `renderEmail(kind,data)`, `verifyPassword(pw,stored)`, `findUserByMagicToken(token)`, `coverSvg(slug,cluster)`, `renderPublic(url,data)` used consistently across tasks.
- **Placeholders:** Pricing tiers are intentional placeholder content (per decision), not plan gaps; article bodies generated in D4. No unresolved TBDs in code tasks.
