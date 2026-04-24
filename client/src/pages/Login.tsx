import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Circle, Sparkles, Star } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { z } from "zod";
import { loginSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/queryClient";

const formSchema = loginSchema;

type FormValues = z.infer<typeof formSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Fix mobile keyboard viewport issue
  const resetMobileViewport = () => {
    // Blur active element to hide keyboard
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Force viewport recalculation
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Trigger resize to fix viewport height
    window.dispatchEvent(new Event('resize'));

    // Additional fix for iOS/Android viewport
    document.body.style.height = '100vh';
    requestAnimationFrame(() => {
      document.body.style.height = '';
    });
  };

  useEffect(() => {
    if (!authLoading && user) {
      resetMobileViewport();
      setLocation("/dashboard");
    }
  }, [user, authLoading, setLocation]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: "+7",
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          <span className="text-base text-white/80">Загрузка...</span>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    try {
      // Blur input first to hide keyboard
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      await login(values.phone);

      // Hard reload to ensure fresh JS bundle is loaded after deploy
      window.location.href = "/dashboard";
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        const phone = form.getValues("phone");
        setLocation(`/register?phone=${encodeURIComponent(phone)}`);
      } else {
        toast({
          title: "Ошибка",
          description: error instanceof Error ? error.message : "Ошибка входа",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <Star className="absolute top-20 right-8 w-4 h-4 text-yellow-300/60 animate-pulse" />
        <Star className="absolute top-32 left-12 w-3 h-3 text-white/40 animate-pulse" style={{ animationDelay: '0.5s' }} />
        <Star className="absolute top-48 right-16 w-2 h-2 text-yellow-200/50 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <div className="auth-hero text-center">
        {/* Premium Icon - larger */}
        <div className="relative w-28 h-28 mx-auto mb-6 md:w-32 md:h-32">
          {/* Outer glow */}
          <div className="absolute -inset-3 rounded-[28px] bg-white/15 blur-2xl" />
          {/* Inner glow */}
          <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-white/30 to-white/10 blur-xl" />
          {/* Main container */}
          <div className="relative w-full h-full rounded-[28px] bg-gradient-to-br from-white/25 to-white/5 backdrop-blur-md border border-white/40 shadow-2xl flex items-center justify-center overflow-hidden">
            {/* Animated shine effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
            {/* Task list visual - larger */}
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-white drop-shadow-lg" strokeWidth={2.5} />
                <div className="w-14 h-2.5 rounded-full bg-white/70" />
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-white drop-shadow-lg" strokeWidth={2.5} />
                <div className="w-10 h-2.5 rounded-full bg-white/60" />
              </div>
              <div className="flex items-center gap-3">
                <Circle className="w-8 h-8 text-white/60 drop-shadow-lg" strokeWidth={2} />
                <div className="w-16 h-2.5 rounded-full bg-white/40" />
              </div>
            </div>
            {/* Sparkles - multiple */}
            <Sparkles className="absolute top-3 right-3 w-6 h-6 text-yellow-300 drop-shadow-lg animate-pulse" />
            <Star className="absolute bottom-3 left-3 w-4 h-4 text-yellow-200/80 drop-shadow-lg" />
          </div>
        </div>
        <h1 className="auth-title font-black drop-shadow-sm">
          Контроль производственных процессов
        </h1>
      </div>

      {/* Form Card */}
      <div className="auth-card">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-md mx-auto">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg font-bold text-foreground mb-3 block">
                    Номер телефона
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="xxx xxx xx xx"
                      className="h-16 text-2xl font-semibold tracking-wider border-2 border-border rounded-2xl px-6 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card shadow-sm"
                      value={field.value}
                      onChange={(e) => {
                        let value = e.target.value;
                        // Убираем +7 в начале если есть
                        let cleaned = value.replace(/^\+?7?/, "");
                        // Оставляем только цифры
                        let digits = cleaned.replace(/\D/g, "");
                        // Если первая цифра 7 (ввод начали с 7 или вставили номер типа 79991234567)
                        if (digits.startsWith("7") && digits.length > 1) {
                          digits = digits.slice(1);
                        }
                        // Ограничиваем до 10 цифр
                        const limitedDigits = digits.slice(0, 10);
                        field.onChange("+7" + limitedDigits);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace") {
                          const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
                          if (cursorPos <= 2) {
                            e.preventDefault();
                            return;
                          }
                        }
                        if (e.key === "Delete") {
                          const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
                          if (cursorPos < 2) {
                            e.preventDefault();
                            return;
                          }
                        }
                      }}
                      onFocus={(e) => {
                        if (field.value === "+7" || field.value === "") {
                          setTimeout(() => {
                            e.target.setSelectionRange(2, 2);
                          }, 0);
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage className="text-sm mt-2" />
                </FormItem>
              )}
            />

            <button
              type="submit"
              className="ozon-btn ozon-btn-primary w-full text-xl font-bold h-16 rounded-2xl shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-200 active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? "Вход..." : "Войти"}
            </button>

            {/* Кнопки регистрации и инструкции */}
            <div className="text-center pt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setLocation("/register")}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                Зарегистрироваться
              </button>
              <button
                type="button"
                onClick={() => setLocation("/instructions")}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                Инструкция
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
