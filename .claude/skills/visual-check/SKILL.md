---
name: visual-check
description: Скриншоты и визуальная проверка TasksFlow (дев-стенд или прод) на ПК и телефоне, в светлой и тёмной теме. Автоматически ищет ошибки консоли и JS, упавшие запросы, горизонтальную прокрутку и битые картинки, собирает общий лист «до | после». Использовать после любых правок интерфейса, перед PR с вёрсткой и когда человеку нужно показать, как выглядит страница.
---

# Визуальная проверка

Скрипт `shots.mjs` снимает страницы Playwright-ом, который в облаке предустановлен
(ставить его не нужно). На каждую страницу, ширину и тему он сохраняет PNG и проверки:

- код ответа страницы;
- ошибки консоли и необработанные JS-исключения;
- упавшие запросы и ответы 4xx/5xx своего домена;
- горизонтальную прокрутку с элементами, которые вылезают за экран;
- битые картинки.

```bash
# дев-стенд (сначала скилл dev-stand: он поднимает сервер)
node .claude/skills/visual-check/shots.mjs --preset public --sheet
node .claude/skills/visual-check/shots.mjs --preset app --login --themes light,dark --sheet
node .claude/skills/visual-check/shots.mjs /some/page /other --viewports desktop,mobile,small --full

# прод (внешние адреса идут через прокси сессии)
node .claude/skills/visual-check/shots.mjs --base https://tasksflow.ru --preset public --sheet

# до/после правки
node .claude/skills/visual-check/shots.mjs --preset app --login --out output/shots/before
#   … правка …
node .claude/skills/visual-check/shots.mjs --preset app --login --compare output/shots/before --sheet
```

Ширины: `desktop` 1440, `laptop` 1280, `tablet` 834, `mobile` 390, `small` 360.
`--full` снимает страницу целиком (до `--max-height`, по умолчанию 6000 px), `--video` пишет
видео, `--wait-for "css"` ждёт элемент. Пресеты и база заданы в `routes.json`, вход и
подготовка браузера (cookie-баннер, тема) в `hooks.mjs`. Итог лежит в
`output/shots/<время>/`: `report.md`, `report.json`, PNG, при `--sheet` ещё `contact-sheet.png`.

## Как работать

1. После правки интерфейса снять затронутые страницы на `desktop` и `mobile`.
   Тему `dark` добавлять, когда правка касается цветов. Перед PR с вёрсткой нужен `--sheet`.
2. Посмотреть снимки самому (инструмент Read открывает PNG) и сверить с правилами визуала
   в CLAUDE.md. Замечания из `report.md` разобрать: ошибка, шум или проблема окружения.
3. Показать человеку: `SendUserFile` с `contact-sheet.png` (`display: render`), это один кадр
   со всеми снимками. Отдельные PNG отправлять, когда речь о конкретной странице.
4. Для внешних адресов редкие `502` на случайном чанке и `ERR_CONNECTION_RESET` создаёт
   прокси сессии, а не сайт (`curl -sS "$HTTPS_PROXY/__agentproxy/status"`). Скрипт сам
   переснимает такую страницу один раз и пишет об этом в отчёте. Снимки localhost прокси не трогает.

## Этот проект

- База снимков — дев-стенд `http://localhost:5000` (скилл `dev-stand`). Прод: `--base https://tasksflow.ru --preset public`. Без сервера — `--preset demo` на любом из них.
- Пресеты: `public` (лендинг, блог, статья, оферта, вход, регистрация компании, 404), `app` (задачи, отчёты, новая задача, сотрудники, проверка, настройки, тариф, аккаунт), `worker` (кабинет сотрудника), `admin` (root: компании, баннеры), `demo`.
- `--login` входит админом дев-стенда (`+79990000001` / PIN `4826`); `"login": "worker"` в пресете — сотрудником. Сессия кэшируется в `output/shots/.auth/`: у входа лимит 10 попыток за 15 минут.
- `hooks.mjs` ставит тему (`theme-preference`), выключает движение (`tf_motion_enabled`) и прячет тур, совет дня и плашку приложения.
- В кабинете `networkidle` не наступает (живые обновления `/api/events`), поэтому `routes.json` ждёт `load`, исчезновения `.skeleton` и 1,5 с.
- Это дополнение к `npm run smoke` (UI smoke с подменённым API), а не замена: smoke проверяет сценарии и регрессии, снимки — как выглядит экран с настоящими данными. Артефакты smoke — `output/playwright/`, снимков — `output/shots/`.
