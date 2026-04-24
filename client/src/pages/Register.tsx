import { Link, useSearch } from "wouter";
import { ArrowLeft, Building2, UserPlus, ChevronRight } from "lucide-react";

export default function Register() {
  // Получаем номер телефона из URL параметра
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const phone = params.get("phone") || "";

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
        <div className="max-w-md mx-auto">
          <Link href="/" className="auth-back">
            <ArrowLeft className="w-5 h-5" />
            <span>Назад</span>
          </Link>

          <h1 className="auth-title font-bold">
            Регистрация
          </h1>
          <p className="auth-subtitle">
            Выберите тип регистрации
          </p>
        </div>
      </div>

      {/* Options Card */}
      <div className="auth-card">
        <div className="max-w-md mx-auto flex flex-col gap-6">
          {/* Create Company */}
          <Link href={phone ? `/register/company?phone=${encodeURIComponent(phone)}` : "/register/company"}>
            <div className="choice-row group">
              <div className="flex items-center gap-4">
                <div className="choice-icon">
                  <Building2 className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-foreground mb-1">
                    Создание компании
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Зарегистрируйте новую компанию и станьте её администратором
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
              </div>
            </div>
          </Link>

          {/* Join Company */}
          <Link href={phone ? `/register/user?phone=${encodeURIComponent(phone)}` : "/register/user"}>
            <div className="choice-row group">
              <div className="flex items-center gap-4">
                <div className="choice-icon text-emerald-600 bg-emerald-500/10">
                  <UserPlus className="w-8 h-8 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-foreground mb-1">
                    Присоединиться к компании
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Зарегистрируйтесь как сотрудник существующей компании
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-emerald-600 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
              </div>
            </div>
          </Link>

          {/* Divider with text */}
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">или</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Back to login link */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Уже есть аккаунт?{" "}
              <Link href="/" className="text-primary font-medium hover:underline">
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
