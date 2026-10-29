#!/usr/bin/env node
// Демо-данные дев-стенда TasksFlow через настоящий API, как это сделал бы человек:
// регистрация компании, сотрудники, задачи. Данные вымышленные (пекарня «Тёплый хлеб»).
// Запускает stand.sh после старта сервера, только на пустой базе.

const base = process.env.TF_URL || 'http://localhost:5000';
const admin = { phone: process.env.TF_ADMIN_PHONE || '+79990000001', pin: process.env.TF_ADMIN_PIN || '4826' };
let cookie = '';

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(';')[0];
    if (kv.startsWith('connect.sid=')) cookie = kv;
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const staff = [
  { phone: '+79990000002', name: 'Ольга Пекарева', position: 'Пекарь', pin: '5937' },
  { phone: '+79990000003', name: 'Игорь Тестов', position: 'Пекарь', pin: '6048' },
  { phone: '+79990000004', name: 'Мария Кассирова', position: 'Кассир', pin: '7159' },
  { phone: '+79990000005', name: 'Сергей Чистов', position: 'Уборка', pin: '8260' },
];

const everyDay = [0, 1, 2, 3, 4, 5, 6];
const weekdays = [1, 2, 3, 4, 5];

async function main() {
  await api('POST', '/api/companies/register', {
    phone: admin.phone,
    companyName: 'Тёплый хлеб (демо)',
    email: 'demo@example.com',
    adminName: 'Анна Управляющая',
    pin: admin.pin,
    consent: true,
  });
  const ids = {};
  for (const s of staff) {
    const u = await api('POST', '/api/users', s);
    ids[s.position + s.name] = u.id ?? u.user?.id;
  }
  const [olga, igor, maria, sergey] = Object.values(ids);
  const tasks = [
    { title: 'Проверить температуру в холодильниках', workerId: olga, price: 50, category: 'Санитария', weekDays: everyDay, requiresPhoto: true },
    { title: 'Замесить тесто на утреннюю выпечку', workerId: igor, price: 150, category: 'Производство', weekDays: everyDay },
    { title: 'Снять кассу и сверить выручку', workerId: maria, price: 100, category: 'Касса', weekDays: everyDay, verifierWorkerId: olga },
    {
      title: 'Генеральная уборка зала',
      workerId: sergey,
      price: 300,
      category: 'Уборка',
      weekDays: [6],
      requiresPhoto: true,
      checklist: [
        { id: 'c1', title: 'Протереть витрины' },
        { id: 'c2', title: 'Вымыть пол' },
        { id: 'c3', title: 'Вынести мусор' },
      ],
    },
    { title: 'Принять поставку муки', workerId: olga, price: 80, category: 'Склад', weekDays: weekdays },
    { title: 'Заказать упаковку на неделю', workerId: maria, price: 0, category: 'Закупки', isRecurring: false, dueDate: Math.floor(Date.now() / 1000) + 3 * 86400 },
  ];
  let made = 0;
  for (const t of tasks) {
    try {
      await api('POST', '/api/tasks', t);
      made++;
    } catch (e) {
      console.error(`задача «${t.title}»: ${e.message}`);
    }
  }
  console.log(`seed: компания, ${staff.length} сотрудника, ${made} задач; вход ${admin.phone} / PIN ${admin.pin}`);
}

main().catch((e) => {
  console.error(`seed: ${e.message}`);
  process.exit(1);
});
