import { useMotionPreference } from "@/contexts/MotionContext";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Camera, Check, Coins, Smartphone } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
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

const formSchema = loginSchema;

const BENEFITS = [
  { icon: Smartphone, text: "Задачи на смену — в телефоне" },
  { icon: Camera, text: "Фото-отчёт вместо «сделал, честно»" },
  { icon: Coins, text: "Премия за выполненное" },
];

const LIVE_ROWS = ["Открыть смену", "Протереть витрину", "Проверить ценники"];

/** Маленькая карточка смены: третья задача отмечается один раз при входе. */
function LiveShiftCard() {
  return (
    <div className="login-live" aria-hidden="true">
      <div className="login-live-head">
        <span>Магазин на Ленина</span>
        <b>3 из 3</b>
      </div>
      <div className="login-live-track"><span /></div>
      {LIVE_ROWS.map((row, i) => (
        <div key={row} className={`login-live-row ${i === 2 ? "login-live-row--late" : ""}`}>
          <span className="login-live-check"><Check strokeWidth={3} /></span>
          {row}
          {i === 1 ? <span className="login-live-photo"><Camera />фото</span> : null}
        </div>
      ))}
      <div className="login-live-bonus"><Coins />+300 ₽ премия</div>
    </div>
  );
}

type FormValues = z.infer<typeof formSchema>;

export default function Login() {
  const { reduced } = useMotionPreference();
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

  if (authLoading) return <PageSkeleton />;

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
    <div className="login-screen">
      {/* Панель бренда: на desktop — левая половина с обещанием продукта
          и «живой» карточкой смены, на mobile — компактная цветная шапка. */}
      <motion.aside
        className="login-brand"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : .4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="login-brand-inner">
          <div className="login-logo">
            <span className="login-logo-mark" aria-hidden="true"><BrandMark onColor /></span>
            <span className="login-logo-word">Tasks<span>Flow</span></span>
          </div>
          <h1 className="login-title">Контроль производственных процессов</h1>
          <ul className="login-benefits">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text}><span aria-hidden="true"><Icon /></span>{text}</li>
            ))}
          </ul>
          <LiveShiftCard />
        </div>
      </motion.aside>

      {/* Form Card */}
      <main className="login-panel">
      <motion.div
        className="login-card"
        initial={reduced ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : .35, ease: [0.2, 0.8, 0.2, 1], delay: reduced ? 0 : .08 }}
      >
        <div className="login-card-head">
          <h2>Вход в кабинет</h2>
          <p>По номеру телефона, без пароля</p>
        </div>
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
            </div>
          </form>
        </Form>
      </motion.div>
      </main>
    </div>
  );
}
