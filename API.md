# API Documentation

Все запросы используют JSON. Авторизация через сессионные cookies.

Base URL: `http://localhost:5000`

## Авторизация

### POST /api/auth/login
Вход по номеру телефона.

**Request:**
```json
{
  "phone": "+79991234567"
}
```

**Response 200:**
```json
{
  "id": 1,
  "phone": "+79991234567",
  "name": "Иван Иванов",
  "isAdmin": false,
  "bonusBalance": 500,
  "createdAt": 1705000000
}
```

**Response 401:**
```json
{
  "message": "Пользователь с таким номером не найден",
  "field": "phone"
}
```

### GET /api/auth/me
Получить текущего пользователя.

**Response 200:** (авторизован)
```json
{
  "id": 1,
  "phone": "+79991234567",
  "name": "Иван Иванов",
  "isAdmin": false,
  "bonusBalance": 500,
  "createdAt": 1705000000
}
```

**Response 200:** (не авторизован)
```json
null
```

### POST /api/auth/logout
Выход из системы.

**Response 200:**
```json
{
  "success": true
}
```

---

## Задачи

### GET /api/tasks
Получить все задачи. Требует авторизации.

**Response 200:**
```json
[
  {
    "id": 1,
    "title": "Помыть полы",
    "workerId": 2,
    "requiresPhoto": true,
    "photoUrl": "/uploads/task-1-123456.jpg",
    "photoUrls": ["/uploads/task-1-123456.jpg", "/uploads/task-1-789012.jpg"],
    "examplePhotoUrl": "/uploads/example-1.jpg",
    "isCompleted": false,
    "isRecurring": true,
    "weekDays": [1, 2, 3, 4, 5],
    "monthDay": null,
    "price": 100,
    "category": "Уборка",
    "description": "Помыть полы во всех комнатах"
  }
]
```

### GET /api/tasks/:id
Получить одну задачу.

**Response 200:** (аналогично элементу массива выше)

**Response 404:**
```json
{
  "message": "Задача не найдена"
}
```

### POST /api/tasks
Создать задачу. Требует права админа.

**Request:**
```json
{
  "title": "Помыть полы",
  "workerId": 2,
  "requiresPhoto": true,
  "isRecurring": true,
  "weekDays": [1, 2, 3, 4, 5],
  "price": 100,
  "category": "Уборка",
  "description": "Помыть полы во всех комнатах"
}
```

**Response 201:** (созданная задача)

**Свой вопрос с вариантами ответа.** Пункт `checklist` с полем `options`
(от 2 до 20 вариантов) — вопрос, на который исполнитель выбирает ответ:

```json
{
  "title": "Журнал температуры",
  "workerId": 2,
  "isRecurring": true,
  "checklist": [
    { "id": "who", "title": "Кто заполняет?", "options": ["Лариса", "Галина"] }
  ]
}
```

Без ответа задачу не завершить (`400 Ответьте на вопрос «Кто заполняет?»`).
Ответ — `POST /api/tasks/:id/checklist/:itemId/answer` с `{ "answer": "Лариса" }`
(`null` — убрать ответ); засчитывается только один из вариантов, пункт
становится `done: true`, ответ лежит в `answer`. В полночь у регулярной
задачи ответ сбрасывается, а вчерашний остаётся в истории дня и в CSV
(колонка «Ответы»).

### PUT /api/tasks/:id
Обновить задачу. Требует права админа.

**Request:** (частичное обновление)
```json
{
  "title": "Помыть полы и протереть пыль",
  "price": 150
}
```

**Response 200:** (обновлённая задача)

### DELETE /api/tasks/:id
Удалить задачу. Требует права админа.

**Response 204:** (пустой ответ)

### POST /api/tasks/:id/complete
Отметить задачу выполненной.

- Если `requiresPhoto: true`, должно быть загружено хотя бы одно фото
- При успехе: `price` добавляется к `bonusBalance` исполнителя
- Отправляется email админу

**Response 200:** (обновлённая задача с `isCompleted: true`)

**Response 400:**
```json
{
  "message": "Необходимо загрузить фото перед завершением"
}
```

### POST /api/tasks/:id/uncomplete
Отменить выполнение задачи.

- `price` вычитается из `bonusBalance` исполнителя

**Response 200:** (обновлённая задача с `isCompleted: false`)

### POST /api/tasks/:id/photo
Загрузить фото к задаче. Максимум 10 фото на задачу.

**Request:** `multipart/form-data`
- `photo`: файл изображения (макс 10MB)

**Response 200:**
```json
{
  "photoUrl": "/uploads/task-1-123456.jpg",
  "photoUrls": ["/uploads/task-1-123456.jpg"]
}
```

**Response 400:**
```json
{
  "message": "Достигнут лимит фотографий (максимум 10)"
}
```

### DELETE /api/tasks/:id/photo
Удалить фото задачи.

**Query params:**
- `url` (optional): URL конкретного фото для удаления. Если не указан - удаляются все фото.

**Response 200:**
```json
{
  "success": true,
  "photoUrls": []
}
```

### POST /api/tasks/:id/example-photo
Загрузить пример фото (только админ).

**Request:** `multipart/form-data`
- `photo`: файл изображения

**Response 200:**
```json
{
  "examplePhotoUrl": "/uploads/example-1.jpg"
}
```

### DELETE /api/tasks/:id/example-photo
Удалить пример фото (только админ).

**Response 200:**
```json
{
  "success": true
}
```

---

## Пользователи

### GET /api/users
Получить всех пользователей. Требует авторизации.

**Response 200:**
```json
[
  {
    "id": 1,
    "phone": "+79991234567",
    "name": "Админ",
    "isAdmin": true,
    "bonusBalance": 0,
    "createdAt": 1705000000
  },
  {
    "id": 2,
    "phone": "+79997654321",
    "name": "Иван Иванов",
    "isAdmin": false,
    "bonusBalance": 500,
    "createdAt": 1705100000
  }
]
```

### POST /api/users
Создать пользователя. Требует права админа.

**Request:**
```json
{
  "phone": "+79997654321",
  "name": "Иван Иванов"
}
```

**Response 201:** (созданный пользователь)

**Response 400:**
```json
{
  "message": "Пользователь с таким номером уже существует",
  "field": "phone"
}
```

### PUT /api/users/:id
Обновить пользователя. Требует права админа.

**Request:**
```json
{
  "phone": "+79997654321",
  "name": "Иван Петрович"
}
```

**Response 200:** (обновлённый пользователь)

### POST /api/users/:id/reset-balance
Сбросить баланс пользователя до 0. Требует права админа.

**Response 200:** (пользователь с `bonusBalance: 0`)

---

## Workers (Legacy)

> **Note:** Таблица workers устарела. Используется таблица users с полем workerId.

### GET /api/workers
### GET /api/workers/:id
### POST /api/workers
### PUT /api/workers/:id
### DELETE /api/workers/:id

---

## Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | Успех |
| 201 | Создано |
| 204 | Удалено (пустой ответ) |
| 400 | Ошибка валидации |
| 401 | Требуется авторизация |
| 403 | Нет прав (не админ / не исполнитель) |
| 404 | Не найдено |
| 500 | Внутренняя ошибка сервера |

---

## Примеры cURL

### Авторизация
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567"}' \
  -c cookies.txt
```

### Получить задачи
```bash
curl http://localhost:5000/api/tasks \
  -b cookies.txt
```

### Создать задачу
```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Помыть полы",
    "workerId": 2,
    "requiresPhoto": true,
    "weekDays": [1,2,3,4,5],
    "price": 100
  }'
```

### Загрузить фото
```bash
curl -X POST http://localhost:5000/api/tasks/1/photo \
  -F "photo=@/path/to/image.jpg" \
  -b cookies.txt
```

### Выполнить задачу
```bash
curl -X POST http://localhost:5000/api/tasks/1/complete \
  -b cookies.txt
```

---

## JavaScript/TypeScript примеры

### Авторизация
```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ phone: '+79991234567' }),
});
const user = await response.json();
```

### Загрузка фото
```typescript
const formData = new FormData();
formData.append('photo', file);

const response = await fetch(`/api/tasks/${taskId}/photo`, {
  method: 'POST',
  credentials: 'include',
  body: formData,
});
const { photoUrl, photoUrls } = await response.json();
```

### Использование с TanStack Query (как в проекте)
```typescript
import { useTasks, useCompleteTask } from '@/hooks/use-tasks';

function TaskList() {
  const { data: tasks, isLoading } = useTasks();
  const completeTask = useCompleteTask();

  const handleComplete = (taskId: number) => {
    completeTask.mutate(taskId);
  };

  // ...
}
```
