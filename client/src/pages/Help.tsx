import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ChevronDown,
  Camera,
  CheckCircle2,
  Clock,
  Coins,
  HelpCircle,
  Lightbulb,
  ListTodo,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * /help — страница «Как пользоваться» для всех (особенно для тех,
 * кому 60+). Текст крупный, иконки большие, без англицизмов.
 * Ответы на самые частые вопросы и пошаговые инструкции.
 *
 * Цель: чтобы любая повар, уборщица, бухгалтер открыла страницу и
 * за минуту поняла, что делать с TasksFlow. Без вопросов «куда нажать».
 */

type FaqItem = {
  q: string;
  a: string;
};

const FAQ: FaqItem[] = [
  {
    q: "Я открыл программу — что мне теперь делать?",
    a: "Внизу экрана список задач на сегодня. Сделай задачу — нажми на круг слева. Если требуется фото, программа сама откроет камеру. Когда закончишь — задача станет зелёной.",
  },
  {
    q: "Что значат цифры наверху?",
    a: "Сверху видно: «осталось», «сделано» и сколько премии накопилось. Стрелочка вниз — открывает подробности по премии.",
  },
  {
    q: "Я случайно нажал «Готово», что делать?",
    a: "Нажми на саму задачу — откроется её карточка. Там есть кнопка «Отменить выполнение». Если уже прошло много времени — попроси руководителя.",
  },
  {
    q: "Программа показывает не мои задачи",
    a: "Возможно, ты вошёл с чужого номера. Зайди в меню справа сверху → «Выход» → войди заново со своим телефоном.",
  },
  {
    q: "Не работает камера",
    a: "Разреши приложению доступ к камере в настройках телефона. На iPhone: Настройки → Safari → Камера. На Android: долгое нажатие на иконку браузера → Настройки сайта → Камера.",
  },
  {
    q: "У меня сломался телефон, потеряются ли мои бонусы?",
    a: "Нет. Бонусы хранятся на сервере и привязаны к твоему номеру телефона. Войдёшь с другого устройства — всё на месте.",
  },
  {
    q: "Где видно, кто выполнил общую задачу?",
    a: "В разделе «Сделано другими» — задачи, которые ты тоже мог сделать, но кто-то закрыл их раньше. Это не потеря — просто видно, что смена работает слаженно.",
  },
  {
    q: "Как получить бонусы?",
    a: "Бонусы начисляются автоматически за каждую закрытую задачу. Выплата 1 и 16 числа каждого месяца. По выплатам — к руководителю.",
  },
];

type StepGuide = {
  icon: React.ReactNode;
  title: string;
  steps: string[];
};

const GUIDES: StepGuide[] = [
  {
    icon: <CheckCircle2 className="w-7 h-7 text-emerald-600" />,
    title: "Закрыть задачу",
    steps: [
      "Найди задачу в списке.",
      "Нажми на круг слева от названия.",
      "Если просит фото — камера откроется сама.",
      "Подтверди — задача станет зелёной.",
    ],
  },
  {
    icon: <Camera className="w-7 h-7 text-blue-600" />,
    title: "Прикрепить фото",
    steps: [
      "Открой задачу — нажми на её название.",
      "Кнопка «Сделать фото» откроет камеру.",
      "Можно сразу несколько — до 10 штук.",
      "Нажми «Сохранить».",
    ],
  },
  {
    icon: <ListTodo className="w-7 h-7 text-violet-600" />,
    title: "Заполнить журнал",
    steps: [
      "Если задача с журналом, появится форма.",
      "Заполни поля — программа подскажет.",
      "Нажми «Сохранить» внизу.",
      "Запись попадёт в журнал автоматически.",
    ],
  },
  {
    icon: <RefreshCw className="w-7 h-7 text-amber-600" />,
    title: "Обновить список",
    steps: [
      "Потяни экран сверху вниз.",
      "Или нажми кнопку с круговой стрелкой.",
      "Список обновится за секунду.",
    ],
  },
];

const TIPS: { icon: React.ReactNode; text: string }[] = [
  {
    icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
    text: "Закрывай задачу сразу после выполнения — не накапливай.",
  },
  {
    icon: <Camera className="w-5 h-5 text-blue-600" />,
    text: "Фото снимай при хорошем свете, чтобы было всё видно.",
  },
  {
    icon: <Clock className="w-5 h-5 text-violet-600" />,
    text: "Если просрочил — закрой как можно скорее, премия начислится частично.",
  },
  {
    icon: <ThumbsUp className="w-5 h-5 text-amber-600" />,
    text: "Не уверен — спроси руководителя, лучше уточнить, чем переделать.",
  },
];

export default function Help() {
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="page-screen">
      <div className="page-container">
        <Button
          variant="ghost"
          onClick={() => setLocation("/dashboard")}
          className="page-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>

        <div className="page-header flex items-center gap-3">
          <div className="page-icon">
            <HelpCircle className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="page-title">Помощь</h1>
            <p className="page-subtitle">
              Простые ответы на частые вопросы и пошаговые инструкции
            </p>
          </div>
        </div>

        {/* Quick guides */}
        <div className="content-panel mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Как сделать…
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <div
                key={g.title}
                className="rounded-2xl border bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    {g.icon}
                  </div>
                  <h3 className="font-semibold text-base">{g.title}</h3>
                </div>
                <ol className="space-y-2 text-sm leading-relaxed">
                  {g.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-foreground/80 pt-0.5">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="content-panel mb-6">
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            Частые вопросы
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Не нашёл ответ — спроси руководителя или жми кнопку «Поддержка» внизу.
          </p>
          <div className="space-y-2">
            {FAQ.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="rounded-2xl border bg-card overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
                  >
                    <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
                      ?
                    </span>
                    <span className="flex-1 font-medium text-base text-foreground pt-0.5">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground shrink-0 mt-1 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isOpen ? (
                    <div className="px-4 pb-4 pl-[60px] text-sm leading-relaxed text-foreground/80">
                      {item.a}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tips */}
        <div className="content-panel mb-6">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            Советы
          </h2>
          <div className="space-y-2">
            {TIPS.map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-xl bg-muted/40"
              >
                <div className="shrink-0 mt-0.5">{t.icon}</div>
                <p className="text-sm leading-relaxed text-foreground/85">
                  {t.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Support CTA */}
        <div className="content-panel">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Не получается?
          </h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Позвони своему руководителю — он покажет на месте. Если совсем непонятно
            что нажимать, найди в офисе того, кто уже работал с программой, и попроси
            его помочь — это нормально.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLocation("/instructions")}
            >
              <Smartphone className="w-4 h-4 mr-2" />
              Подробная инструкция
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLocation("/dashboard")}
            >
              <Coins className="w-4 h-4 mr-2" />
              К моим задачам
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
