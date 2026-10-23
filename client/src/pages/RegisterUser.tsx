import { useState } from "react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
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
import { PhoneInput } from "@/components/PhoneInput";
import { AuthShell } from "@/components/AuthShell";
import { PinFlow, type PinSubmitError } from "@/components/PinFlow";
import { LegalConsent } from "@/components/LegalConsent";
import { postAuthJson, toPinSubmitError } from "@/lib/auth-api";

const formSchema = z.object({
  phone: loginSchema.shape.phone,
  name: z
    .string()
    .min(1, "Введите имя")
    .max(255, "Имя не должно превышать 255 символов"),
  adminPhone: loginSchema.shape.phone,
});

type FormValues = z.infer<typeof formSchema>;

const fieldClass = "h-12 rounded-xl border-2 border-border bg-card px-4 text-base";

export default function RegisterUser() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const phoneFromUrl = params.get("phone") || "+7";

  const [details, setDetails] = useState<FormValues | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: phoneFromUrl,
      name: "",
      adminPhone: "+7",
    },
  });

  const onDetails = (values: FormValues) => {
    if (!consent) {
      setConsentError("Отметьте согласие, чтобы продолжить");
      return;
    }
    setDetails(values);
  };

  const submitPin = async (pin: string): Promise<PinSubmitError | null> => {
    if (!details) return { message: "Заполните данные" };
    const { ok, data } = await postAuthJson("/api/users/register", { ...details, pin, consent: true });
    if (!ok) return toPinSubmitError(data);
    window.location.href = "/dashboard";
    return null;
  };

  if (details) {
    return (
      <AuthShell title="Регистрация сотрудника" subtitle="Последний шаг — PIN для входа">
        <div className="login-form">
          <PinFlow mode="create" phone={details.phone} onSubmit={submitPin} onBack={() => setDetails(null)} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Регистрация сотрудника" subtitle="Присоединитесь к компании своего руководителя">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onDetails)} className="login-form !gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-foreground">Ваш телефон</FormLabel>
                <FormControl>
                  <PhoneInput value={field.value} onChange={field.onChange} className={`${fieldClass} text-lg font-medium tracking-wider`} />
                </FormControl>
                <FormMessage className="text-sm mt-1" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-foreground">Ваше имя</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Иван Иванов" className={fieldClass} maxLength={255} autoComplete="name" autoCapitalize="words" {...field} />
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
                <FormLabel className="text-sm font-semibold text-foreground">Телефон руководителя</FormLabel>
                <FormControl>
                  <PhoneInput value={field.value} onChange={field.onChange} className={`${fieldClass} text-lg font-medium tracking-wider`} />
                </FormControl>
                <p className="text-xs text-muted-foreground mt-1">Номер администратора вашей компании в TasksFlow</p>
                <FormMessage className="text-sm mt-1" />
              </FormItem>
            )}
          />

          <LegalConsent
            checked={consent}
            onChange={(value) => {
              setConsent(value);
              if (value) setConsentError(null);
            }}
            error={consentError}
          />

          <Button type="submit" className="login-submit w-full text-base font-semibold h-12 rounded-xl">
            Далее — придумать PIN
          </Button>

          <Link href="/register" className="login-link inline-flex items-center justify-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Назад
          </Link>
        </form>
      </Form>
    </AuthShell>
  );
}
