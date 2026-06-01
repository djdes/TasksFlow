# TasksFlow: публичный лендинг + SEO-блог + email-авторегистрация + PHP-почта

**Дата:** 2026-06-01
**Статус:** утверждён (пользователь делегировал все решения, режим автономной реализации)

## Цель

Привлечь органический трафик и дать новым пользователям точку входа в продукт:
длинный публичный лендинг, SEO-блог (~150 статей), форма авторизации/регистрации
как в ordersflow (yesbeat-style: одно поле email + одна кнопка, авторегистрация/автологин),
письма строго через PHP, хлебные крошки везде, генерируемые SVG-обложки для статей.

## Решения (зафиксированы)

| Вопрос | Решение |
|---|---|
| Идентификатор на лендинге | Email (как ordersflow), рядом с существующим телефонным входом |
| Что создаёт авторегистрация | Только email → компания с заглушкой-названием + админ |
| SEO-рендер публичных страниц | SSR в Express (Подход A: React SSR + гидрация), кабинет остаётся CSR SPA |
| PHP-почта | `send.php`-реле в веб-корне (паттерн ordersflow/FastPanel), native `mail()` |
| Объём блога | ~150 статей, кластерами (pillar + поддерживающие) |
| Кластеры | управление/контроль задач, отраслевые кейсы, мотивация и KPI, сравнения/альтернативы |
| Обложки статей | Генерируемые детерминированные SVG (градиент+паттерн по slug) + lucide-иконка кластера |
| Сессия после автологина | httpOnly session-cookie (как в TasksFlow), не localStorage |
| Роутинг | `/` = лендинг; телефонный вход → `/login`; залогиненный на `/` видит «Открыть кабинет» |
| Цвет/бренд | Структура формы ordersflow, цвет TasksFlow indigo #5566f6 |
| Тема | Светлая + тёмная (тоггл) |
| Авторегистрация UX | Мгновенный автологин по сабмиту; пароль приходит письмом как бэкап, идти в почту не нужно |
| Валидация email | Клиент: подсказка опечаток (gmail.ru→gmail.com); сервер: DNS MX-проверка домена |
| Настройки аккаунта | Новая страница `/account`: смена email и пароля |
| Аналитика | Опциональные Yandex.Metrika + GA4 через env (off, пока нет ID) |
| Тарифы на лендинге | Заглушка-тарифы (правятся потом) |
| Фазирование | Всё сразу; внутри плана фазы A→B→C→D с чекпоинтами |

## Архитектура

### Разделение публичной части и кабинета
- **Публичная часть (SSR + гидрация):** отдельный React-вход (лендинг + блог), SSR-safe,
  без AuthProvider-гейта. Express рендерит React в HTML-строку с мета-тегами и JSON-LD,
  клиент гидрирует только интерактив (форма авторизации, тоггл темы, TOC).
- **Кабинет (CSR SPA, без изменений):** `/dashboard`, `/admin/*`, новый `/account`.

### Роуты
- Публичные (SSR): `/`, `/blog`, `/blog/:slug`, `/blog/category/:cluster`, `/sitemap.xml`, `/robots.txt`, `/og/:slug.svg`
- Вход сотрудников: `/login` (телефонный, переезд с `/`), `/register/*` (как есть)
- Кабинет (SPA): `/dashboard`, `/admin/*`, `/account`
- Express: публичный роут → SSR-рендер; остальное → SPA `index.html`

### SSR-инфраструктура
- Vite SSR: client-бандл + server-бандл (ssr entry). Dev — Vite middleware (`ssrLoadModule`); прод — собранный server-бандл.
- Render-функция отдаёт `{ html, head, state }`; Express вставляет в шаблон, сериализует state для гидрации.
- Компоненты публичной части — SSR-safe (никакого `window` на верхнем уровне модуля).

## Email-авторизация (на сессиях TasksFlow)

### Изменения схемы (`shared/schema.ts`, Drizzle/MySQL)
В таблицу `users` добавить (всё nullable, существующие телефонные юзеры не ломаются):
- `email VARCHAR(255) NULL UNIQUE`
- `passwordHash VARCHAR(255) NULL` (формат scrypt: `scrypt$14$saltHex$hashHex`)
- `magicToken VARCHAR(64) NULL`
- `magicTokenExpiresAt INT NULL` (unix seconds)

### Эндпоинты
- `POST /api/auth/start { email }`
  - нормализация (`trim().toLowerCase()`), формат-regex, MX-проверка домена
  - **новый email** → создать компанию (заглушка-название из local-part) + админа (scrypt-пароль),
    `req.session.userId`, отправить welcome-письмо (пароль + magic-кнопка), вернуть `{ exists:false }`
    → клиент мгновенно редиректит в `/dashboard`
  - **существующий email** → выставить magicToken, отправить login-link письмо, вернуть `{ exists:true }`
    → клиент показывает шаг «Письмо отправлено» + inline-поле пароля
- `POST /api/auth/login-email { email, password }` → scrypt verify → сессия
- `POST /api/auth/recover { email }` → новый пароль + magicToken + письмо, всегда 200 (анти-энумерация)
- `GET /api/auth/magic/:token` → валидация токена + TTL (7 дней) → сессия → редирект `/dashboard`
- Существующий телефонный `POST /api/auth/login` остаётся параллельно

### Аккаунт (кабинет)
- `PUT /api/account/email { email }` (MX + уникальность)
- `PUT /api/account/password { currentPassword?, newPassword }`
- Страница `/account` в SPA

### Валидация email
- Клиент: подсказка опечаток по списку популярных RU/мировых доменов (gmail.com, yandex.ru, mail.ru, bk.ru, list.ru, inbox.ru, rambler.ru, outlook.com, icloud.com, …)
- Сервер: `dns.promises.resolveMx(domain)` с кэшем и таймаутом; дружелюбная ошибка, если MX нет

### Криптография
- `scryptSync` (N=2^14, salt 16 байт, key 64 байт), `timingSafeEqual` при проверке
- Генерация пароля: алфавит без 0/O/1/l/I; magicToken: 16 байт hex

## PHP-почта

- `php-relay/send.php` (как ordersflow): проверка `X-Relay-Token` через `hash_equals`, `mail()`,
  Subject в RFC2047 base64 для кириллицы, envelope-from `-f`, лог в `send.log`. Деплой в веб-корень домена.
- `server/mailer.ts`: транспорт-цепочка — **dev outbox** (NODE_ENV!=production или нет relay) → **php-relay** (прод).
  Env: `PHP_RELAY_URL`, `PHP_RELAY_TOKEN`, `MAIL_FROM`.
- `server/email-templates.ts`: `welcome` (пароль + magic-кнопка), `login-link` (только кнопка),
  `recovery` (новый пароль + кнопка). Брендовый indigo, table-based layout.

## SEO-блог + ~150 статей

- **Хранение:** Markdown `content/blog/*.md` + frontmatter (`title, description, date, cluster, tags, cover?, faq?, featured?`).
- **Рендер:** на сервере Markdown→HTML (remark/markdown-it) + reading-time. Не MDX (JSX внутри статей не нужен).
- **Кластеры (4):** управление/контроль задач, отраслевые кейсы, мотивация и KPI, сравнения/альтернативы. Pillar + поддерживающие, сквозная перелинковка.
- **Генерация:** Workflow с фан-аутом агентов-авторов по согласованному плану тем, строгая дедупликация заголовков/тем, уникальный практический русский текст.
- **Обложки:** функция-генератор SVG (детерминированный градиент+паттерн по slug + lucide-иконка кластера), отдаётся как `/og/:slug.svg` или inline.
- **SEO-обвязка:** на каждой странице `<title>`, description, canonical, OpenGraph; JSON-LD
  `Organization`/`SoftwareApplication`/`FAQPage`/`BreadcrumbList`/`BlogPosting`; `sitemap.xml` + `robots.txt`.
- **Хлебные крошки:** компонент Breadcrumbs на блоге/статье/категории/фиче + `BreadcrumbList` JSON-LD.

## Лендинг (длинный, ориентир — DocsFlow)

Секции: Nav → Hero (email-форма) → Боль/решение → Возможности → Как работает → Демо-дашборд →
Отраслевые кейсы → Сравнение → Тарифы (заглушка) → Блог-тизер → FAQ → CTA → Footer + StickyCTA.
Светлая/тёмная тема. Хлебные крошки на внутренних публичных страницах.

## Аналитика
Опциональные Yandex.Metrika + GA4 через env (`YM_ID`/`GA_ID`), грузятся только если заданы.

## Тестирование
- Юнит: email/phone-нормализация, MX-валидация (мок DNS), scrypt hash/verify, выбор транспорта mailer, идемпотентность авторегистрации.
- Интеграция: `/api/auth/start` (новый/существующий), magic-link, recover, смена email/пароля.
- SSR smoke: публичные роуты → 200 + контент в HTML + мета/JSON-LD.
- Билд: `npm run check && npm run build`.

## Реализация по фазам
- **A** — схема + scrypt + MX-валидация + mailer + send.php + email-шаблоны + auth-эндпоинты + /account
- **B** — SSR-инфраструктура (Vite SSR, render-функция, гидрация, шаблон)
- **C** — лендинг (секции, тема, email-форма)
- **D** — блог (Markdown-пайплайн, SVG-обложки, крошки, sitemap/robots) + генерация ~150 статей

## Риски
- SSR в существующем Vite SPA — самая сложная часть; держать публичный вход изолированным от кабинета.
- Тонкий контент при 150 статьях — строгая дедупликация тем и уникальность текста.
- Доставляемость PHP-почты зависит от SPF/PTR домена на хостинге (вне кода).
