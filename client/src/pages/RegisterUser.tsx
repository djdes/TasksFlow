import { useState } from "react";
import { Link, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { ArrowLeft, UserPlus } from "lucide-react";
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

const formSchema = z.object({
  phone: loginSchema.shape.phone,
  name: z.string().min(1, "Введите имя"),
  adminPhone: loginSchema.shape.phone,
});

type FormValues = z.infer<typeof formSchema>;

export default function RegisterUser() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Получаем номер телефона из URL параметра
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const phoneFromUrl = params.get("phone") || "+7";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: phoneFromUrl,
      name: "",
      adminPhone: "+7",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    try {
      // Blur input first to hide keyboard
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const response = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка регистрации");
      }

      toast({
        title: "Успешно",
        description: "Вы зарегистрированы",
      });

      // Redirect to dashboard with full page reload
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 100);
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Ошибка регистрации",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Phone input component for reuse
  const PhoneInput = ({ field, label }: { field: any; label: string }) => (
    <FormItem>
      <FormLabel className="text-sm font-semibold text-foreground">
        {label}
      </FormLabel>
      <FormControl>
        <Input
          type="tel"
          placeholder="xxx xxx xx xx"
          className="h-14 text-lg font-medium tracking-wider border-2 border-border rounded-xl px-4 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card"
          value={field.value}
          onChange={(e) => {
            let value = e.target.value;
            let cleaned = value.replace(/^\+?7?/, "");
            let digits = cleaned.replace(/\D/g, "");
            if (digits.startsWith("7") && digits.length > 1) {
              digits = digits.slice(1);
            }
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
      <FormMessage className="text-sm mt-1" />
    </FormItem>
  );

  return (
    <div className="auth-screen">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="auth-hero">
        <Link href="/register" className="auth-back">
          <ArrowLeft className="w-5 h-5" />
          <span>Назад</span>
        </Link>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Присоединиться к компании
            </h1>
            <p className="auth-subtitle !mt-1 text-sm">
              Зарегистрируйтесь как сотрудник
            </p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="auth-card">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-md mx-auto">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput field={field} label="Ваш телефон" />
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-foreground">
                    Ваше имя
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Иван Иванов"
                      className="h-14 text-lg border-2 border-border rounded-xl px-4 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-sm mt-1" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adminPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-foreground">
                    Телефон администратора компании
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="xxx xxx xx xx"
                      className="h-14 text-lg font-medium tracking-wider border-2 border-border rounded-xl px-4 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card"
                      value={field.value}
                      onChange={(e) => {
                        let value = e.target.value;
                        let cleaned = value.replace(/^\+?7?/, "");
                        let digits = cleaned.replace(/\D/g, "");
                        if (digits.startsWith("7") && digits.length > 1) {
                          digits = digits.slice(1);
                        }
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Введите номер телефона администратора вашей компании
                  </p>
                  <FormMessage className="text-sm mt-1" />
                </FormItem>
              )}
            />

            <div className="pt-4">
              <button
                type="submit"
                className="ozon-btn ozon-btn-primary w-full text-lg font-bold h-14 rounded-xl shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-200 active:scale-[0.98]"
                disabled={isLoading}
              >
                {isLoading ? "Регистрация..." : "Зарегистрироваться"}
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
