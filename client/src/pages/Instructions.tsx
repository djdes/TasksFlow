import { Link } from "wouter";
import { ArrowLeft, Building2, UserPlus, ArrowRight, Smartphone, ListTodo, Camera, Coins } from "lucide-react";

export default function Instructions() {
  return (
    <div className="auth-screen">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
      </div>

      {/* Header */}
      <div className="auth-hero">
        <div className="max-w-2xl mx-auto">
          <Link href="/" className="auth-back">
            <ArrowLeft className="w-5 h-5" />
            <span>Назад</span>
          </Link>

          <h1 className="auth-title font-bold">
            Как это работает
          </h1>
          <p className="auth-subtitle">
            Простая система управления ежедневными задачами
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="auth-card !max-w-2xl">
        <div className="space-y-10">

          {/* Section: For Company */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Для компании</h2>
            </div>

            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</div>
                  <div className="w-0.5 flex-1 bg-border mt-2" />
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="font-semibold text-foreground mb-1">Регистрация компании</h3>
                  <p className="text-sm text-muted-foreground">Создайте аккаунт компании и станьте администратором. Укажите название, email и ваш номер телефона.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</div>
                  <div className="w-0.5 flex-1 bg-border mt-2" />
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="font-semibold text-foreground mb-1">Создание задач</h3>
                  <p className="text-sm text-muted-foreground">Добавляйте повторяющиеся задачи: уборка, проверка оборудования, отчёты. Укажите дни недели и стоимость выполнения.</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">3</div>
                  <div className="w-0.5 flex-1 bg-border mt-2" />
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="font-semibold text-foreground mb-1">Назначение сотрудников</h3>
                  <p className="text-sm text-muted-foreground">Привяжите задачи к конкретным сотрудникам. Сотрудники регистрируются по номеру телефона вашей компании.</p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">4</div>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">Контроль выполнения</h3>
                  <p className="text-sm text-muted-foreground">Отслеживайте выполнение задач, просматривайте фотоотчёты, получайте уведомления на email.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Section: For Employee */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                <UserPlus className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Для сотрудника</h2>
            </div>

            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">1</div>
                  <div className="w-0.5 flex-1 bg-border mt-2" />
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="font-semibold text-foreground mb-1">Подключение к компании</h3>
                  <p className="text-sm text-muted-foreground">Зарегистрируйтесь самостоятельно, указав телефон администратора, или получите приглашение от компании — тогда задачи уже будут готовы для вас.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                  <div className="w-0.5 flex-1 bg-border mt-2" />
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="font-semibold text-foreground mb-1">Просмотр задач</h3>
                  <p className="text-sm text-muted-foreground">Каждый день видите только свои задачи на сегодня. Никакой путаницы — только то, что нужно сделать.</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">3</div>
                  <div className="w-0.5 flex-1 bg-border mt-2" />
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="font-semibold text-foreground mb-1">Выполнение с фото</h3>
                  <p className="text-sm text-muted-foreground">Выполните задачу и прикрепите фото как подтверждение. Можно загрузить до 10 фотографий.</p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">4</div>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">Получение бонусов</h3>
                  <p className="text-sm text-muted-foreground">За каждую выполненную задачу начисляются бонусы. Баланс отображается в личном кабинете.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Visual Schema */}
          <section className="pt-4">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border">
              <h3 className="font-bold text-foreground mb-6 text-center">Схема работы</h3>

              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
                {/* Admin */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Building2 className="w-7 h-7 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Админ</span>
                </div>

                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0" />

                {/* Tasks */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <ListTodo className="w-7 h-7 text-orange-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Задачи</span>
                </div>

                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0" />

                {/* Employee */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Smartphone className="w-7 h-7 text-emerald-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Сотрудник</span>
                </div>

                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0" />

                {/* Photo */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Camera className="w-7 h-7 text-blue-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Фото</span>
                </div>

                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0" />

                {/* Bonus */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                    <Coins className="w-7 h-7 text-yellow-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Бонусы</span>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="text-center pt-4">
            <Link href="/register">
              <button className="ozon-btn ozon-btn-primary px-8 py-4 text-lg font-bold rounded-2xl">
                Начать работу
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
