import { PageSkeleton } from "@/components/PageSkeleton";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
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
import { PhoneInput } from "@/components/PhoneInput";
import { AuthShell } from "@/components/AuthShell";
import { PinFlow, type PinSubmitError } from "@/components/PinFlow";

const formSchema = loginSchema.pick({ phone: true });

type FormValues = z.infer<typeof formSchema>;
type Step = "phone" | "pin" | "setup";

function toPinError(error: unknown): PinSubmitError {
  if (error instanceof ApiError) {
    const body = error.body ?? {};
    return {
      message: error.message,
      attemptsLeft: typeof body.attemptsLeft === "number" ? body.attemptsLeft : undefined,
      retryAfterSec: typeof body.retryAfterSec === "number" ? body.retryAfterSec : undefined,
      step: body.step === "pin" ? "pin" : undefined,
    };
  }
  return { message: error instanceof Error ? error.message : "Не удалось войти. Проверьте связь и попробуйте ещё раз." };
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [stepError, setStepError] = useState<PinSubmitError | null>(null);

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

  if (authLoading) return <PageSkeleton />;

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    try {
      // Blur input first to hide keyboard
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const result = await login(values.phone);
      setPhone(values.phone);
      setStepError(null);
      if (result.step === "done") {
        window.location.href = "/dashboard";
        return;
      }
      setStep(result.step);
      setIsLoading(false);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401 && error.body?.field !== "pin") {
        const phoneValue = form.getValues("phone");
        setLocation(`/register?phone=${encodeURIComponent(phoneValue)}`);
      } else if (error instanceof ApiError && error.status === 429) {
        // Вход заблокирован после неверных PIN — показываем это на шаге PIN.
        setPhone(values.phone);
        setStepError(toPinError(error));
        setStep("pin");
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

  const submitPin = async (pin: string): Promise<PinSubmitError | null> => {
    try {
      const result = await login(phone, pin);
      if (result.step !== "done") return { message: "Попробуйте ещё раз" };
      resetMobileViewport();
      // Hard reload to ensure fresh JS bundle is loaded after deploy
      window.location.href = "/dashboard";
      return null;
    } catch (error) {
      return toPinError(error);
    }
  };

  if (step !== "phone") {
    return (
      <AuthShell title={step === "pin" ? "Вход в кабинет" : "Первый вход"} subtitle={step === "pin" ? "PIN из 4 цифр" : "Придумайте PIN — он защитит ваш аккаунт"}>
        <div className="login-form">
          <PinFlow
            mode={step === "pin" ? "enter" : "create"}
            phone={phone}
            initialError={stepError}
            onSubmit={submitPin}
            onModeChange={() => setStep("pin")}
            onBack={() => {
              setStep("phone");
              setStepError(null);
            }}
          />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Вход в кабинет" subtitle="По номеру телефона и PIN">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="login-form">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-semibold text-foreground mb-2 block">
                  Телефон
                </FormLabel>
                <FormControl>
                  <PhoneInput value={field.value} onChange={field.onChange} className="login-phone h-14 rounded-2xl border-2 border-border bg-card px-5 text-xl font-semibold tracking-wide md:text-xl" />
                </FormControl>
                <FormMessage className="text-sm mt-2" />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="login-submit w-full text-lg font-semibold h-14 rounded-2xl"
            loading={isLoading}
            loadingLabel="Вход…"
          >
            Войти
          </Button>

          {/* Подсказка для тех, кто впервые. Бабушки часто пугаются
              «надо ли регистрироваться?» — здесь явно сказано: если
              руководитель уже добавил, просто введи телефон. */}
          <p className="login-hint">
            Если руководитель уже добавил вас — введите телефон и нажмите «Войти».
            Если впервые — кнопка «Зарегистрироваться» внизу.
          </p>

          {/* Кнопки регистрации и инструкции */}
          <div className="login-links">
            <button
              type="button"
              onClick={() => setLocation("/register")}
              className="login-link"
            >
              Зарегистрироваться
            </button>
            <button
              type="button"
              onClick={() => setLocation("/instructions")}
              className="login-link"
            >
              Инструкция
            </button>
            {/* Полная навигация: демо включается при старте приложения (main.tsx). */}
            <a href="/demo" className="login-link">
              Демо
            </a>
          </div>
        </form>
      </Form>
    </AuthShell>
  );
}
