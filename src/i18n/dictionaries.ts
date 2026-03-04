export type Locale = "ru" | "kk" | "uz";

export const LOCALE_NAMES: Record<Locale, string> = {
  ru: "Русский",
  kk: "Қазақша",
  uz: "O'zbekcha",
};

type Dictionary = Record<string, string>;

const ru: Dictionary = {
  // Navigation
  "nav.dashboard": "Дашборд",
  "nav.journals": "Журналы",
  "nav.reports": "Отчёты",
  "nav.settings": "Настройки",
  // Dashboard
  "dashboard.title": "Дашборд",
  "dashboard.entries_today": "Записей сегодня",
  "dashboard.total_entries": "Всего записей",
  "dashboard.employees": "Сотрудников",
  "dashboard.journals": "Журналов",
  "dashboard.compliance": "Соответствие за сегодня",
  "dashboard.filled_of": "Заполнено {filled} из {total} обязательных журналов",
  "dashboard.activity_48h": "Активность за 48 часов",
  "dashboard.no_activity": "За последние 48 часов записей не было",
  // Common
  "common.save": "Сохранить",
  "common.cancel": "Отмена",
  "common.delete": "Удалить",
  "common.edit": "Редактировать",
  "common.create": "Создать",
  "common.add": "Добавить",
  "common.search": "Поиск",
  "common.loading": "Загрузка...",
  "common.yes": "Да",
  "common.no": "Нет",
  "common.back": "Назад",
  "common.export": "Экспорт",
  "common.import": "Импорт",
  // Auth
  "auth.login": "Войти",
  "auth.register": "Регистрация",
  "auth.logout": "Выход",
  "auth.email": "Email",
  "auth.password": "Пароль",
  // Settings
  "settings.areas": "Цеха и участки",
  "settings.equipment": "Оборудование",
  "settings.users": "Сотрудники",
  "settings.products": "Справочник продуктов",
  "settings.notifications": "Уведомления",
  "settings.subscription": "Подписка",
  "settings.audit": "Журнал действий",
  // Subscription
  "subscription.title": "Управление подпиской",
  "subscription.current_plan": "Текущий тариф",
  "subscription.trial": "Пробный период",
  "subscription.starter": "Стартовый",
  "subscription.standard": "Стандарт",
  "subscription.pro": "Про",
  "subscription.expires": "Действует до",
  "subscription.choose_plan": "Выбрать тариф",
  "subscription.pay": "Оплатить",
};

const kk: Dictionary = {
  // Navigation
  "nav.dashboard": "Басқару тақтасы",
  "nav.journals": "Журналдар",
  "nav.reports": "Есептер",
  "nav.settings": "Баптаулар",
  // Dashboard
  "dashboard.title": "Басқару тақтасы",
  "dashboard.entries_today": "Бүгінгі жазбалар",
  "dashboard.total_entries": "Барлық жазбалар",
  "dashboard.employees": "Қызметкерлер",
  "dashboard.journals": "Журналдар",
  "dashboard.compliance": "Бүгінгі сәйкестік",
  "dashboard.filled_of": "{total} міндетті журналдың {filled} толтырылды",
  "dashboard.activity_48h": "Соңғы 48 сағаттағы белсенділік",
  "dashboard.no_activity": "Соңғы 48 сағатта жазбалар жоқ",
  // Common
  "common.save": "Сақтау",
  "common.cancel": "Болдырмау",
  "common.delete": "Жою",
  "common.edit": "Өзгерту",
  "common.create": "Жасау",
  "common.add": "Қосу",
  "common.search": "Іздеу",
  "common.loading": "Жүктелуде...",
  "common.yes": "Иә",
  "common.no": "Жоқ",
  "common.back": "Артқа",
  "common.export": "Экспорт",
  "common.import": "Импорт",
  // Auth
  "auth.login": "Кіру",
  "auth.register": "Тіркелу",
  "auth.logout": "Шығу",
  "auth.email": "Email",
  "auth.password": "Құпия сөз",
  // Settings
  "settings.areas": "Цехтар мен учаскелер",
  "settings.equipment": "Жабдықтар",
  "settings.users": "Қызметкерлер",
  "settings.products": "Өнім анықтамалығы",
  "settings.notifications": "Хабарламалар",
  "settings.subscription": "Жазылым",
  "settings.audit": "Әрекеттер журналы",
  // Subscription
  "subscription.title": "Жазылымды басқару",
  "subscription.current_plan": "Ағымдағы тариф",
  "subscription.trial": "Сынақ мерзімі",
  "subscription.starter": "Бастапқы",
  "subscription.standard": "Стандарт",
  "subscription.pro": "Про",
  "subscription.expires": "Мерзімі",
  "subscription.choose_plan": "Тарифті таңдау",
  "subscription.pay": "Төлеу",
};

const uz: Dictionary = {
  // Navigation
  "nav.dashboard": "Boshqaruv paneli",
  "nav.journals": "Jurnallar",
  "nav.reports": "Hisobotlar",
  "nav.settings": "Sozlamalar",
  // Dashboard
  "dashboard.title": "Boshqaruv paneli",
  "dashboard.entries_today": "Bugungi yozuvlar",
  "dashboard.total_entries": "Jami yozuvlar",
  "dashboard.employees": "Xodimlar",
  "dashboard.journals": "Jurnallar",
  "dashboard.compliance": "Bugungi muvofiqlik",
  "dashboard.filled_of": "{total} ta majburiy jurnaldan {filled} tasi to'ldirildi",
  "dashboard.activity_48h": "So'nggi 48 soatdagi faoliyat",
  "dashboard.no_activity": "So'nggi 48 soatda yozuvlar yo'q",
  // Common
  "common.save": "Saqlash",
  "common.cancel": "Bekor qilish",
  "common.delete": "O'chirish",
  "common.edit": "Tahrirlash",
  "common.create": "Yaratish",
  "common.add": "Qo'shish",
  "common.search": "Qidirish",
  "common.loading": "Yuklanmoqda...",
  "common.yes": "Ha",
  "common.no": "Yo'q",
  "common.back": "Orqaga",
  "common.export": "Eksport",
  "common.import": "Import",
  // Auth
  "auth.login": "Kirish",
  "auth.register": "Ro'yxatdan o'tish",
  "auth.logout": "Chiqish",
  "auth.email": "Email",
  "auth.password": "Parol",
  // Settings
  "settings.areas": "Sexlar va uchastkalar",
  "settings.equipment": "Jihozlar",
  "settings.users": "Xodimlar",
  "settings.products": "Mahsulotlar ma'lumotnomasi",
  "settings.notifications": "Bildirishnomalar",
  "settings.subscription": "Obuna",
  "settings.audit": "Harakatlar jurnali",
  // Subscription
  "subscription.title": "Obunani boshqarish",
  "subscription.current_plan": "Joriy tarif",
  "subscription.trial": "Sinov davri",
  "subscription.starter": "Boshlang'ich",
  "subscription.standard": "Standart",
  "subscription.pro": "Pro",
  "subscription.expires": "Amal qilish muddati",
  "subscription.choose_plan": "Tarifni tanlash",
  "subscription.pay": "To'lash",
};

const dictionaries: Record<Locale, Dictionary> = { ru, kk, uz };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] || dictionaries.ru;
}

export function t(dictionary: Dictionary, key: string, params?: Record<string, string | number>): string {
  let text = dictionary[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
