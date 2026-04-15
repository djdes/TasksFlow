# Инструкция по развертыванию на хостинге

## Проблема: 404 ошибки для API запросов

Если вы получаете ошибки типа `GET https://tasksflow.ru/api/users 404 (Not Found)`, это означает, что веб-сервер (nginx/apache) не настроен для проксирования запросов к Node.js серверу.

## Решение

### Вариант 1: Nginx

1. Подключитесь по SSH к серверу
2. Найдите конфигурационный файл nginx для вашего домена (обычно в `/etc/nginx/sites-available/tasksflow.ru` или `/etc/nginx/conf.d/tasksflow.ru.conf`)
3. Добавьте или обновите конфигурацию (см. `nginx.conf.example`)
4. Перезагрузите nginx: `sudo nginx -t && sudo systemctl reload nginx`

### Вариант 2: Apache

1. Подключитесь по SSH к серверу
2. Убедитесь, что включены модули: `sudo a2enmod proxy proxy_http rewrite`
3. Создайте или обновите `.htaccess` файл в корне проекта (см. `.htaccess.example`)
4. Перезагрузите apache: `sudo systemctl reload apache2`

### Вариант 3: PM2 (рекомендуется для Node.js)

1. Установите PM2: `npm install -g pm2`
2. Соберите проект: `npm run build`
3. Запустите сервер через PM2: `pm2 start dist/index.cjs --name tasksflow`
4. Сохраните конфигурацию: `pm2 save`
5. Настройте автозапуск: `pm2 startup`

### Проверка

1. Убедитесь, что Node.js сервер запущен на порту 5000 (или PORT из .env)
2. Проверьте, что переменные окружения в `.env` настроены правильно
3. Проверьте логи: `pm2 logs tasksflow` или `journalctl -u your-service`

## Cron для сброса задач

Задачи с `isRecurring: true` должны сбрасываться (`isCompleted: false`) каждый день в полночь.

### Настройка cron

```bash
# Создайте папку для логов
mkdir -p /var/www/tasksflow/data/www/tasksflow.ru/logs

# Добавьте задачу в crontab
crontab -e
```

Добавьте строку (замените пути на свои):
```
0 0 * * * cd /var/www/tasksflow/data/www/tasksflow.ru && /var/www/tasksflow/data/.nvm/versions/node/v24.12.0/bin/npm run reset-tasks >> ./logs/reset-tasks.log 2>&1
```

### Проверка

```bash
# Запустить вручную
cd /var/www/tasksflow/data/www/tasksflow.ru && npm run reset-tasks

# Проверить логи
cat ./logs/reset-tasks.log
```

## Важные моменты

- Убедитесь, что `NODE_ENV=production` в `.env`
- Проверьте, что порт в `.env` совпадает с портом в конфигурации веб-сервера
- Убедитесь, что база данных доступна с хостинга
- Проверьте права доступа к папке `uploads/`
- Проверьте права доступа к папке `logs/` для cron
