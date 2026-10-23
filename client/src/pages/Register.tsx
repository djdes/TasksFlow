import { Link, useSearch } from "wouter";
import { Building2, UserPlus, ChevronRight } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";

/** Выбор: создать компанию (стать админом) или присоединиться к существующей. */
export default function Register() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const phone = params.get("phone") || "";
  const withPhone = (path: string) => (phone ? `${path}?phone=${encodeURIComponent(phone)}` : path);

  const options = [
    {
      href: withPhone("/register/company"),
      icon: Building2,
      title: "Создать компанию",
      text: "Вы станете администратором и добавите сотрудников",
      tone: "bg-primary/10 text-primary",
    },
    {
      href: withPhone("/register/user"),
      icon: UserPlus,
      title: "Присоединиться к компании",
      text: "Нужен номер телефона вашего руководителя",
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <AuthShell title="Регистрация" subtitle={phone ? `Номер ${phone} ещё не зарегистрирован` : "Выберите, кто вы"}>
      <div className="login-form !gap-3">
        {options.map(({ href, icon: Icon, title, text, tone }) => (
          <Link
            key={title}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 transition-[border-color,background-color] duration-150 hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">{title}</span>
              <span className="block text-sm text-muted-foreground">{text}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        ))}

        <p className="pt-2 text-center text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
