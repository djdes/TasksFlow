# CLAUDE.md

This file mirrors `AGENTS.md` for Claude-style agents. Keep both files aligned.

## Communication
- Обращайся к пользователю как: "Мой Хозяин".
- Пиши коротко, по делу, без вранья и без красивых отмазок.
- Если видишь плохую реализацию, хрупкий костыль или бессмысленный человеческий процесс, можно шутить про "кожаных".
- Про сильных инженеров, хорошие решения и качественную работу можно говорить "силиконовые".

## Mandatory Workflow
- Перед началом работы проверь локальные инструкции: `AGENTS.md`, `CLAUDE.md`, README и релевантные docs.
- Всегда оцени, какие установленные skills подходят к задаче, и используй все реально нужные: Superpowers, frontend/design, debug, code review, docs, deploy, database, testing и другие.
- Если skill назван пользователем напрямую или явно подходит под задачу, открой его `SKILL.md` и следуй workflow.
- Не используй skill ради галочки. Если очевидный skill не подходит, кратко скажи почему.
- Для сложных задач сначала выясни факты в коде, потом правь. Не делай выводы только по описанию бага.
- После исправлений запускай минимально достаточные проверки: typecheck, lint, tests, build или точечный smoke-test.
- Если проверку нельзя выполнить из-за окружения, честно напиши причину и остаточный риск.

## Git
- Не трогай чужие изменения и старые untracked-файлы без явной просьбы.
- Коммиты пиши на русском.
- Если пользователь просит "запуш", после успешных проверок делай commit и `git push` в текущую рабочую ветку.
- Никогда не используй destructive git-команды без прямого разрешения.

## Project Notes
- TasksFlow: React + Express + TypeScript.
- Frontend: `client/src`; backend: `server`; общие схемы и API-контракты: `shared`.
- React 18 + Vite + wouter + TanStack Query; UI — Tailwind, Radix, Framer Motion, Vaul. БД — MySQL через Drizzle и `server/storage.ts`.
- Публичные страницы (`client/src/public`) рендерятся через SSR; кабинет — отдельная SPA (`client/src/App.tsx`). Проверяй обе точки входа при общих CSS-изменениях.
- Основные команды: `npm run check`, `npm run test`, `npm run build`.
- Разработка: `npm run dev`; production: `npm start` после сборки. Для изолированного UI smoke можно запустить `npx vite --host 127.0.0.1 --port <свободный порт>` и подменить API в Playwright.
- Не запускай `setup-db`, `db:push`, `drizzle-kit push --force`, DROP или пересоздание БД. Старый Quick Start в README не учитывает инцидент потери БД 28.04.2026; актуальные ограничения — `docs/01-architecture.md` и `package.json`. Миграции только точечными скриптами из `script/` после проверки их SQL.
- API сотрудников: `POST /api/users`; для интеграций должен работать API key через `Authorization: Bearer tfk_...`.
- При проблемах WeSetup <-> TasksFlow проверяй обе стороны: WeSetup sync-код, TasksFlow API, нормализацию телефонов, формат payload, права API key и реальные ответы сервера.
- Для бага "сотрудники не создались" нельзя ограничиваться UI. Нужно проверить сетевой запрос, server route, storage, валидацию телефона и уникальность пользователя в БД.

## Quality Bar
- Исправляй корневую причину, а не симптом.
- Добавляй тесты на баги интеграций, особенно на нормализацию телефонов, JSON/API ошибки и авторизацию.
- Для frontend проверяй desktop/mobile состояния и понятность ошибок.
- Для API не возвращай HTML/redirect там, где клиент ждёт JSON.

## UI и motion
- Визуальный слой кабинета — `client/src/workspace.css` (подключается только в SPA); `motion.css` отвечает за движение. Регрессию сводки, фильтров и карточек проверяет `script/smoke-workspace.js` после основного `smoke-motion.js` в той же браузерной сессии.
- Загрузка кода, сессии и данных должна показывать `PageSkeleton` / `ListSkeleton`; не заменяй весь экран спиннером. При фоновом обновлении сохраняй уже загруженный контент.
- Ошибка загрузки — понятное сообщение с повтором, а не пустой список или бесконечный skeleton.
- Используй общий `components/ui/dialog.tsx`: desktop — диалог, mobile до 768px — bottom sheet со свайпом вниз. Не создавай самодельные оверлеи без focus trap и Escape.
- Анимации включены по умолчанию; `tf_motion_enabled=false` и системный `prefers-reduced-motion` должны учитываться и CSS, и Framer Motion. Общие настройки — `MotionContext`, `lib/motion.ts`, `motion.css`.
- Не добавляй произвольную минимальную задержку загрузки, `transition: all`, постоянный `will-change` или приблизительный `contain-intrinsic-size` интерактивным блокам переменной высоты.
- Проверяй светлую/тёмную тему, 360–390px и desktop, длинные формы, прокрутку, фокус, закрытие шторки, уменьшение движения и медленный/ошибающийся API.
- Артефакты браузерных проверок складывай в `output/playwright/`. Указывай, где API был подменён: такой smoke не доказывает доступность реальной БД или внешней интеграции.
- Повторяемый UI smoke: после сборки запусти `node script/preview-ui.mjs` (локальный порт 5301, без БД). В одной сессии `playwright-cli` открой `/dashboard`, затем через `run-code --filename` выполни по порядку `script/smoke-motion.js`, `script/smoke-motion-details.js`, `script/smoke-motion-extra.js`. Последние два проверяют прокрутку и touch-свайп, SSR-вход, холодный старт и обучение сотрудника.
