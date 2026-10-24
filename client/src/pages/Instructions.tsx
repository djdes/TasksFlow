import { Link } from "wouter";
import { ArrowLeft, BookOpen, Building2, UserPlus, Smartphone, ListTodo, Camera, Coins } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const COMPANY_STEPS = [
  { title: "Регистрация компании", text: "Создайте аккаунт компании и станьте администратором. Укажите название, email и ваш номер телефона." },
  { title: "Создание задач", text: "Добавляйте повторяющиеся задачи: уборка, проверка оборудования, отчёты — или начните с готового шаблона для своей отрасли. Укажите дни недели и стоимость выполнения." },
  { title: "Назначение сотрудников", text: "Привяжите задачи к конкретным сотрудникам. Сотрудники регистрируются по номеру телефона вашей компании или по приглашению." },
  { title: "Контроль выполнения", text: "Отслеживайте выполнение задач, сравнивайте фотоотчёты с эталоном на экране «На проверке», получайте уведомления на email." },
];

const WORKER_STEPS = [
  { title: "Подключение к компании", text: "Зарегистрируйтесь самостоятельно, указав телефон администратора, или получите приглашение от компании — тогда задачи уже будут готовы для вас." },
  { title: "Просмотр задач", text: "Каждый день видите только свои задачи на сегодня. Никакой путаницы — только то, что нужно сделать." },
  { title: "Выполнение с фото", text: "Выполните задачу и прикрепите фото как подтверждение. Можно загрузить до 10 фотографий." },
  { title: "Получение бонусов", text: "За каждую выполненную задачу начисляются бонусы. Баланс отображается в личном кабинете." },
];

const FLOW = [
  { icon: Building2, label: "Админ" },
  { icon: ListTodo, label: "Задачи" },
  { icon: Smartphone, label: "Сотрудник" },
  { icon: Camera, label: "Фото" },
  { icon: Coins, label: "Бонусы" },
];

export default function Instructions() {
  const { user } = useAuth();

  return (
    <div className="page-screen">
      <div className="page-container page-container--narrow">
        <Link href={user ? "/dashboard" : "/"} data-home-back className="page-back group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Назад
        </Link>

        <div className="page-header">
          <div className="page-title-row">
            <div className="page-icon">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="page-title">Как это работает</h1>
              <p className="page-subtitle">Простая система управления ежедневными задачами</p>
            </div>
          </div>
        </div>

        <div className="page-sections">
          <section className="content-panel" aria-labelledby="instructions-company">
            <div className="section-title">
              <Building2 className="w-5 h-5 text-primary" />
              <h2 id="instructions-company">Для компании</h2>
            </div>
            <ol className="instructions-steps">
              {COMPANY_STEPS.map((step) => (
                <li key={step.title}>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="content-panel" aria-labelledby="instructions-worker">
            <div className="section-title">
              <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 id="instructions-worker">Для сотрудника</h2>
            </div>
            <ol className="instructions-steps instructions-steps--worker">
              {WORKER_STEPS.map((step) => (
                <li key={step.title}>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="content-panel" aria-labelledby="instructions-flow">
            <div className="section-title">
              <h2 id="instructions-flow">Схема работы</h2>
            </div>
            <div className="instructions-flow">
              {FLOW.map(({ icon: Icon, label }) => (
                <div key={label}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="text-center">
            <Link href={user ? "/dashboard" : "/register"} className="page-cta px-8">
              {user ? "Перейти к задачам" : "Начать работу"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
