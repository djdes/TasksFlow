# CLAUDE.md

This file provides working memory for future coding sessions in this repository.

## Project

HACCP-Online is a Next.js 16 monolith for electronic HACCP / SanPiN journals at food production facilities.

Stack:
- Next.js 16 App Router
- TypeScript
- Prisma 7 with PostgreSQL
- NextAuth.js 4
- shadcn/ui
- Tailwind CSS 4
- PM2 on Linux VPS

## Repo

- GitHub repo: `https://github.com/djdes/HACCP-Online`
- Main branch: `master`
- Production deploys from pushes to `master`
- Current real workflow: direct push to `master` is allowed and expected for deploys

Common git flow:

```bash
git checkout master
git pull origin master

# make changes
git add path/to/file1 path/to/file2
git commit -m "feat: short description"
git push origin master
```

If you only need to trigger autodeploy:

```bash
git commit --allow-empty -m "chore: trigger test deploy"
git push origin master
```

Important git notes:
- Stage specific files whenever possible.
- Do not sweep local scratch files into commits unless explicitly requested.
- Local scratch files seen before: `test.txt`, `_seed_remote.py`, `docs/plans/*`.
- If git reports dubious ownership in this workspace, fix it with:

```bash
git config --global --add safe.directory C:/www/Wesetup.ru
```

- Git Credential Manager is available on this machine.

## Local Setup

```bash
git clone https://github.com/djdes/HACCP-Online.git
cd HACCP-Online
cp .env.shared .env
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Useful commands:

```bash
npm run dev
npm run build
npm run lint
npm start
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

## Secrets and Credentials

Local / repo:
- `.env.shared` is used as the shared template
- production database secrets live on the server `.env`

Production SSH:
- Host: `wesetup.ru`
- User: `wesetupru`
- Password: `bCQMn~Jy9C-n&9+(`
- External port: `50222`
- Local / internal reachable port from current environment: `22`

Production app:
- PM2 process: `haccp-online`
- Internal app port: `3002`
- Workflow target path: `www/wesetup.ru/app`
- Resolved server path: `/var/www/wesetupru/data/www/wesetup.ru/app`

## Deployment

Deployment is handled by GitHub Actions.

Workflow:
- file: `.github/workflows/deploy.yml`
- trigger: push to `master`

What the deploy workflow does:
1. Checks out the repo
2. Writes `.build-sha` and `.build-time`
3. Creates `deploy.tar`
4. Uploads it over SSH / SCP using GitHub Secrets
5. Restores `.env`
6. Runs `npm install`
7. Runs `npx prisma generate`
8. Runs `npx prisma db push`
9. Runs `npm run build`
10. Restarts PM2 process `haccp-online`

Deploy exclusions already configured in workflow:
- `node_modules`
- `.next`
- `.git`
- `.github`
- `.claude`
- `.vscode`
- `_run.py`
- `_deploy.py`
- `_seed_remote.py`
- tarballs
- `test.txt`

Important deploy facts:
- The deployed app directory is not a git checkout.
- Do not verify prod with `git status` on the server.
- Verify prod using `.build-sha`, `.build-time`, PM2, and HTTP checks.
- Current deploy path on server is under `/var/www/wesetupru/data/...`, not bare `/www/...`.
- From the current environment, port `50222` returned connection refused, while port `22` worked.

Useful production checks:

```bash
# PM2
plink -batch -hostkey "ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E" -P 22 -l wesetupru -pw 'bCQMn~Jy9C-n&9+(' wesetup.ru "pm2 status haccp-online --no-color"

# Build markers
plink -batch -hostkey "ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E" -P 22 -l wesetupru -pw 'bCQMn~Jy9C-n&9+(' wesetup.ru "cd /var/www/wesetupru/data/www/wesetup.ru/app && cat .build-sha && cat .build-time"

# Local HTTP probe on server
plink -batch -hostkey "ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E" -P 22 -l wesetupru -pw 'bCQMn~Jy9C-n&9+(' wesetup.ru "curl -I -s http://127.0.0.1:3002 | sed -n '1,10p'"
```

Known current production signals:
- `haccp-online` is managed by PM2 and has been observed online after deploy
- app answered `HTTP/1.1 200 OK` on `127.0.0.1:3002`
- Next.js logs warn about multiple `package-lock.json`
- this warning is non-fatal, but worth cleaning later

## Architecture

Route groups:
- `(auth)` for public login / register pages
- `(dashboard)` for protected pages

Core multi-tenancy rule:
- all business data is scoped by `organizationId` from the session

Roles:
- `owner`
- `technologist`
- `operator`

Common API pattern:
1. `getServerSession(authOptions)`
2. role check
3. Zod validation
4. Prisma query
5. `NextResponse.json()`

## Key Modules

Important files in `src/lib/`:
- `db.ts`: Prisma singleton
- `auth.ts`: NextAuth config
- `auth-helpers.ts`: `requireAuth()` / `requireRole()`
- `validators.ts`: Zod schemas
- `email.ts`: mail sending
- `telegram.ts`: Telegram notifications
- `tuya.ts`: Tuya integration
- `pdf.ts`: PDF generation

## Journal System

Journal templates are stored in `JournalTemplate.fields` as JSON arrays.

The dynamic journal form supports:
- text
- number
- date
- boolean
- select
- equipment
- employee

There is now a separate document-based journal layer for grid journals:
- `JournalDocument`
- `JournalDocumentEntry`

This is used for employee-by-day printable journals such as hygiene logs.

Relevant files:
- `src/app/api/journal-documents/route.ts`
- `src/app/api/journal-documents/[id]/route.ts`
- `src/app/api/journal-documents/[id]/entries/route.ts`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/components/journals/hygiene-document-client.tsx`
- `src/lib/hygiene-document.ts`

## Conventions

- UI text is Russian.
- Code and comments are usually English.
- Next.js 16 page `params` are Promises, so always `await params`.
- Use `sonner` for toasts.
- Path alias: `@/*` -> `./src/*`
- Prisma changes should be deployed with `npx prisma db push`
- The deploy workflow already runs `prisma db push` on the server
