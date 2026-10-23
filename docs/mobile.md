# Приложения для Android и iPhone

Кабинет TasksFlow — одно веб-приложение. Приложения для телефонов — тонкие
оболочки над tasksflow.ru: всё, что выкатывается на сайт, сразу оказывается
и в приложениях. Пересобирать их нужно, только когда меняется `mobile/`.

| | Android | iPhone и iPad |
|---|---|---|
| Что это | Trusted Web Activity (`mobile/android`): кабинет в Chrome без адресной строки | Swift + WKWebView (`mobile/ios`) |
| Уведомления | Web Push сайта, Chrome показывает их от имени приложения | APNs (нужен ключ Apple, см. ниже) |
| Камера, фото без сети | как в Chrome | как в Safari |
| Сборка | `mobile-android.yml`, ubuntu | `mobile-ios.yml`, macOS |
| Раздача | APK с сайта, Google Play, RuStore | App Store / TestFlight; без них — «На экран Домой» |

Без магазинов тоже есть приложение: сайт — полноценное PWA (манифест, офлайн-
страница, push). На Android Chrome предлагает «Установить приложение», на
iPhone — «Поделиться → На экран „Домой“». Инструкции для людей — на
**tasksflow.ru/app**, в кабинете — «Аккаунт → Приложение и уведомления».

## Что где

```
shared/brand.ts                   знак и цвета бренда — источник всех иконок
script/generate-app-icons.ts      npm run app-icons: иконки PWA, Android, iOS
script/store-assets.mjs           npm run store-assets: скриншоты для магазинов, баннер Play
client/public/manifest.json       манифест PWA
client/public/sw.js               офлайн-страница, кэш ассетов, push
client/src/lib/pwa.ts             установка, определение оболочки, мост iOS
client/src/lib/push.ts            push на устройстве (Web Push / APNs)
server/push/                      отправка: web.ts (VAPID), apns.ts, store.ts
server/push/events.ts             когда что уходит
server/push-routes.ts             /api/push/*
server/app-links.ts               assetlinks.json, apple-app-site-association, APK
mobile/android/                   Gradle-проект TWA (android-browser-helper 2.7.4)
mobile/ios/                       XcodeGen-проект (project.yml) и Swift
mobile/store/                     тексты, иконки и скриншоты для магазинов
```

## Push-уведомления

Сотруднику: новая задача (события за 15 с склеиваются: «Новых задач: 5»),
задачу вернули на доработку, задачу с премией приняли, утреннее и вечернее
напоминание по расписанию компании. Проверяющему: «Ждёт проверки». Руководи-
телю и админу: итоги дня. Расписание — «Настройки компании → Расписание дня»,
то же, что у Telegram-напоминаний; push получают и те, кто бота не привязывал.

- **Web Push** включается сам: при первом деплое `deploy.yml` создаёт ключи
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` в `.env` сервера. Не меняйте их:
  все подписанные устройства отвяжутся (переподпишутся при следующем входе в
  «Аккаунт»).
- **APNs** (iOS-приложение): Apple Developer → Certificates, IDs & Profiles →
  Keys → «+» → Apple Push Notifications service → скачать `.p8`. В `.env`
  сервера: `APNS_KEY_ID`, `APPLE_TEAM_ID`, `APNS_KEY` (содержимое файла).
- Подписки — таблица `push_subscriptions` (`npm run add-push-subscriptions`,
  шаг деплоя). Сервер шлёт только на адреса push-сервисов Google, Mozilla,
  Apple и Microsoft; при выходе из аккаунта устройство отвязывается.
- Проверить: «Аккаунт → Уведомления → Проверить».

## Android

### Как собирается

`mobile-android.yml` на каждый push, который меняет `mobile/android/**`, или
вручную (Actions → Android → Run workflow):

- **рабочие ветки и PR** — debug-APK и запуск в эмуляторе (Android 14):
  ставим, открываем, проверяем, что Chrome открыл tasksflow.ru и приложение
  не упало; снимок экрана — в артефактах;
- **main** — подписанные `app-release.apk` и `app-release.aab`. APK
  выкладывается на сайт: `tasksflow.ru/downloads/tasksflow.apk` (+
  `android.json` с версией и отпечатком сертификата), AAB — в артефактах
  запуска. После выкладки job проверяет `assetlinks.json` на сайте.

Номер версии — номер запуска workflow (`versionCode = 100 + run`). Не
переименовывайте workflow: счётчик начнётся заново, и Play не примет AAB.

### Ключ подписи

Ключа нет ни в git, ни в секретах GitHub. Он лежит на сервере, рядом с
прошлой сборкой деплоя: `~/.tasksflow-deploy/android/upload.jks` и
`keystore.env` (пароль), права 600. CI берёт его по SSH-секретам деплоя, а
при первом запуске в main создаёт сам.

> **Сохраните копию этих двух файлов** (менеджер паролей, сейф). Без ключа
> APK с сайта не обновится поверх установленного — людям придётся удалить
> приложение и поставить заново. Для Google Play ключ восстанавливаем через
> Play App Signing (это ключ загрузки, не ключ подписи Google).

### Почему без адресной строки

Chrome сверяет приложение с сайтом: в приложении — `assetStatements`
(`res/values/strings.xml`), на сайте — `/.well-known/assetlinks.json` с
SHA-256 сертификата. Отпечаток ключа с сервера CI кладёт в
`downloads/android.json`, сервер подхватывает его без перезапуска. Если
приложение ставят из Google Play с Play App Signing, добавьте отпечаток
ключа Google (Play Console → Test and release → App integrity) в
`ANDROID_CERT_SHA256` и перезапустите сервер. Нет совпадения — приложение
работает, но с адресной строкой.

Без Chrome (часть Huawei) кабинет откроется в Custom Tab другого браузера:
камера и выбор фото там работают, адресная строка видна.

### Публикация

- **APK с сайта** — уже работает после первого запуска в main. Ссылка — на
  tasksflow.ru/app и в «Аккаунте».
- **RuStore** (console.rustore.ru): аккаунт разработчика → новое приложение
  `ru.tasksflow.app` → загрузить APK из артефакта `tasksflow-android-*` (тот
  же, что на сайте — подпись совпадает), тексты и скриншоты из `mobile/store`.
  Ссылку — в `ANDROID_RUSTORE_URL`.
- **Google Play** (play.google.com/console, разовый взнос $25): создать
  приложение → загрузить `app-release.aab` в «Внутреннее тестирование» →
  Play App Signing (включён по умолчанию) → отпечаток ключа Google в
  `ANDROID_CERT_SHA256` → тексты, скриншоты, «Безопасность данных» из
  `mobile/store/README.md` → выпуск. Ссылку — в `ANDROID_PLAY_URL`.

## iPhone и iPad

### Как собирается

`mobile-ios.yml` на macOS, на каждый push, который меняет `mobile/ios/**`:
XcodeGen генерирует проект, сборка для симулятора, запуск в iOS Simulator
(проверка строки `tf-loaded https://tasksflow.ru/…` из приложения и снимок
экрана), неподписанный `TasksFlow-unsigned.ipa` в артефактах — его можно
поставить через AltStore или Sideloadly со своим Apple ID.

Локально (на Mac): `brew install xcodegen && cd mobile/ios && xcodegen generate
&& open TasksFlow.xcodeproj`.

### TestFlight и App Store

Нужен Apple Developer Program ($99 в год). Один раз:

1. App Store Connect → Apps → «+» → New App: bundle ID `ru.tasksflow.app`,
   название, язык — русский.
2. Users and Access → Integrations → App Store Connect API → ключ с ролью
   **Admin** (нужна облачная подпись) → скачать `.p8`.
3. GitHub → Settings → Secrets and variables → Actions:
   `APPLE_TEAM_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
   `APP_STORE_CONNECT_KEY_P8` (содержимое файла).
4. На сервере `.env`: `APPLE_TEAM_ID` — включает
   `/.well-known/apple-app-site-association` (ссылки tasksflow.ru открываются
   в приложении), и ключ APNs для push (раздел выше).

Сразу после этого запустите Actions → iOS → Run workflow (ветка main): сборка
подпишется и уйдёт в TestFlight. Дальше так же — каждый push в main с
изменениями `mobile/ios/**`. Выпуск в App Store — в App Store Connect:
скриншоты, тексты и ответы для ревью — `mobile/store/README.md`. Для сотрудни-
ков одной компании подойдёт и **Unlisted App** (не видна в поиске, ставится
по ссылке).

## Проверки

- `npm run smoke` — восьмая сессия `smoke-pwa.js`: манифест и иконки, /app,
  офлайн-страница, push на устройстве (Web Push, iPhone без установки, мост
  iOS-приложения), вход без сессии в приложении → `/login`.
- `tests/push.test.ts`, `tests/app-links.test.ts` — шифрование Web Push,
  APNs (HTTP/2 + JWT), SSRF-фильтр, assetlinks/AASA, APK.
- Эмулятор Android и симулятор iOS — в CI (выше).

Иконки поменялись → `npm run app-icons`; экраны поменялись →
`npm run build && npm run store-assets`.
