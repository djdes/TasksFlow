# CLAUDE.md

This file mirrors `AGENTS.md` for Claude-style agents. Keep both files aligned.

## Communication
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
- Приложения для телефонов — оболочки над tasksflow.ru: `mobile/android` (Trusted Web Activity) и `mobile/ios` (Swift + WKWebView). Веб-изменения доходят до них сразу; пересборка нужна только при правках `mobile/`. Собираются в CI (`mobile-android.yml`, `mobile-ios.yml`), Android-эмулятор и iOS-симулятор проверяют запуск. Подробности, ключи и публикация — `docs/mobile.md`.
- Репозиторий публичный: ключи подписи (`*.jks`, `.p8`), пароли и токены не коммитить и не печатать в логах CI. Ключ подписи Android живёт на сервере в `~/.tasksflow-deploy/android`.
- Оплата тарифов — Робокасса: `shared/billing.ts`, `server/billing/*`, `server/billing-routes.ts`, страница `/admin/billing`, оферта `content/legal/offer.md`. Сумму считает только сервер, оплата засчитывается только по ResultURL с подписью Пароля #2 или по сверке с кассой (наш запрос OpStateExt с Паролем #2); возвраты — через API кассы с Паролем #3. Внутри приложений оплаты нет (правила App Store и Google Play). Акции, промокоды и постоянные скидки, баланс в баллах (журнал `balance_transactions` в той же транзакции, в минус не уходит; проводки — `server/billing/ledger.ts`), счёт для юрлиц, УПД и реквизиты по ИНН (DaData, `DADATA_API_KEY`) — там же; сумму страница и сервер считают одной функцией `priceBreakdown`. PDF рисует свой генератор `server/billing/pdf` (без npm-зависимостей, шрифт DejaVu в `server/billing/fonts`). Подключение магазина, секреты `ROBOKASSA_*`, `LEGAL_*` и `DADATA_API_KEY`, автопродление, сверка и возвраты — `docs/billing.md`.

## Облачные сессии Claude (claude.ai/code, приложение на телефоне)
- Контейнер облака — Ubuntu 24.04 с Node 22 и Playwright. Наружу он пускает только 80/443, SSH на сервер оттуда не открыть. Для работы есть три скилла в `.claude/skills/`. `.claude/` лежит в `.gitignore`, кроме `skills/`, `agents/` и `settings.json`.
- `dev-stand` — дев-версия с настоящей базой. `bash .claude/skills/dev-stand/stand.sh` поднимает MariaDB 10.11 (МСК) и базу `tasksflow_dev`. Таблицы `users/companies/workers/tasks` берутся из `drizzle-kit export`, он только печатает SQL. Остальную схему накатывают скрипты `script/` в порядке `deploy.yml`. Демо создаётся через API, сервер — `npm run dev` на `localhost:5000`. Вход: `+79990000001`, PIN `4826`. `setup-db`/`db:push`/`drizzle-kit push` не используются и на стенде.
- `visual-check` — снимки Playwright на ПК и телефоне, в светлой и тёмной теме. Ловит ошибки консоли, упавшие запросы и горизонтальную прокрутку, собирает общий лист `contact-sheet*.png`. Снимает стенд, `/demo` и прод. Это дополнение к `npm run smoke`, а не замена.
- `prod` — сервер (`tasks@`) и боевая база через мостик `claude-ops`: `.github/workflows/claude-ops.yml` на секретах деплоя. Запрос и ответ зашифрованы: репозиторий публичный, в журнале Actions только шифротекст. Команды: `node .claude/skills/prod/ops.mjs status|logs|run|sql`, SQL по умолчанию только на чтение. Любое изменение на проде — только после явного «да» владельца.

## Quality Bar
- Исправляй корневую причину, а не симптом.
- Добавляй тесты на баги интеграций, особенно на нормализацию телефонов, JSON/API ошибки и авторизацию.
- Для frontend проверяй desktop/mobile состояния и понятность ошибок.
- Для API не возвращай HTML/redirect там, где клиент ждёт JSON.

## UI и motion
- Визуальный слой кабинета — `client/src/workspace.css` (подключается только в SPA); `motion.css` отвечает за движение.
- Каркас кабинета — `components/CabinetFrame.tsx`: на ПК от 1024px меню слева (`AppSidebar`, как в WeSetup), на телефоне — шторка из шапки задач; у страницы своя `ErrorBoundary`, меню переживает её падение. Разделы, права по ролям, подсветка подстраниц и ключевые слова — одна модель `lib/cabinet-nav.ts` (тесты `tests/cabinet-nav.test.ts`): новый раздел добавляй туда, а не в три меню по отдельности. Горячие клавиши: Ctrl+K / ⌘K — быстрый переход (`CommandPalette`: разделы, действия, тема, сотрудники по имени), N — новая задача. Кнопки «назад на главную» с `data-home-back` на ПК скрыты: эту роль играет меню. Заголовок вкладки — `pageTitle` из той же модели (с числом ждущих проверки). Сотрудники — только `/admin/users` (вход по телефону и PIN; `?add=1` — к форме, `?user=ID` — подсветить человека); старые `/workers/*` лишь переадресуют туда, таблица `workers` для людей не используется. Расписание задачи в создании, правке и «Дублировать» — один компонент `TaskScheduleFields` со сводкой словами (`lib/task-schedule.ts`, считает как `isTaskVisibleOn`). В строке-кнопке выбора (сотрудник, строка журнала) — рисунок `ui/check-mark.tsx`, не radix `Checkbox`: `<button>` в `<button>` даёт «Maximum update depth» (страж — `tests/no-checkbox-in-button.test.ts`). Регрессию сводки, фильтров и карточек проверяет `script/smoke-workspace.js` после основного `smoke-motion.js` в той же браузерной сессии.
- Демо-кабинет (`/demo`) отвечает из `client/src/demo/demo-api.ts`, неизвестный GET получает пустой список. Новый эндпоинт, который отдаёт объект, добавляй туда явно — иначе страница в демо упадёт.
- Загрузка кода, сессии и данных должна показывать `PageSkeleton` / `ListSkeleton`; не заменяй весь экран спиннером. При фоновом обновлении сохраняй уже загруженный контент.
- Ошибка загрузки — понятное сообщение с повтором, а не пустой список или бесконечный skeleton.
- Используй общий `components/ui/dialog.tsx`: desktop — диалог, mobile до 768px — bottom sheet со свайпом вниз. Не создавай самодельные оверлеи без focus trap и Escape.
- Анимации включены по умолчанию; `tf_motion_enabled=false` и системный `prefers-reduced-motion` должны учитываться и CSS, и Framer Motion. Общие настройки — `MotionContext`, `lib/motion.ts`, `motion.css`.
- Не добавляй произвольную минимальную задержку загрузки, `transition: all`, постоянный `will-change` или приблизительный `contain-intrinsic-size` интерактивным блокам переменной высоты.
- Проверяй светлую/тёмную тему, 360–390px и desktop, длинные формы, прокрутку, фокус, закрытие шторки, уменьшение движения и медленный/ошибающийся API.
- Артефакты браузерных проверок складывай в `output/playwright/`. Указывай, где API был подменён: такой smoke не доказывает доступность реальной БД или внешней интеграции.
- Повторяемый UI smoke: `npm run build && npm run smoke`. Скрипт поднимает `script/preview-ui.mjs` (порт из `PORT`, по умолчанию 5301, без БД) и в десяти браузерных сессиях прогоняет `smoke-motion.js` → `smoke-workspace.js`, `smoke-motion.js` → `smoke-motion-details.js` → `smoke-motion-extra.js`, `smoke-pin.js`, `smoke-reports.js`, `smoke-photo.js`, `smoke-company.js`, `smoke-demo.js`, `smoke-pwa.js`, `smoke-billing.js` и `smoke-sidebar.js`. Details и extra проверяют прокрутку и touch-свайп, SSR-вход, холодный старт и обучение сотрудника; `smoke-pin.js` — вход по PIN, блокировку, PIN от руководителя и регистрацию с согласием; `smoke-reports.js` — журнал дня, сводку с графиком, CSV и расписание дня; `smoke-photo.js` — сжатие фото, «только камера» и очередь без сети; `smoke-company.js` — точки, тарифы и root «Компании»; `smoke-demo.js` — демо-кабинет без сервера, очередь проверки и «Дублировать»; `smoke-pwa.js` — манифест, /app, офлайн-страницу и push на устройстве; `smoke-billing.js` — форму тарифов, оплату через Робокассу (подменена), возврат с оплаты, автопродление, промокоды, счёт для юрлиц с реквизитами, ссылки на счёт и УПД и root «Касса», «Цены», «Промокоды», отметку оплаты по счёту. `smoke-sidebar.js` — меню слева на ПК (разделы по ролям, счётчик проверки, подсветка, sticky, 1024/1023px), Ctrl+K, клавишу N, падение страницы при живом меню и шторку на телефоне. Те же сценарии можно запускать по одному через `playwright-cli run-code --filename`. CI выполняет то же самое на каждый PR и push в рабочие ветки.
