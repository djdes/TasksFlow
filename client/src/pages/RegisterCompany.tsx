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
import { registerCompanySchema } from "@shared/schema";
import { PhoneInput } from "@/components/PhoneInput";
import { AuthShell } from "@/components/AuthShell";
import { PinFlow, type PinSubmitError } from "@/components/PinFlow";
import { LegalConsent } from "@/components/LegalConsent";
import { postAuthJson, toPinSubmitError } from "@/lib/auth-api";

// PIN и согласие собираются отдельно: PIN — вторым шагом, согласие — галочкой.
const formSchema = registerCompanySchema.omit({ pin: true, consent: true });

type FormValues = z.infer<typeof formSchema>;

const fieldClass = "h-12 rounded-xl border-2 border-border bg-card px-4 text-base";

export default function RegisterCompany() {
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
      companyName: "",
      email: "",
      adminName: "",
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
    if (!details) return { message: "Заполните данные компании" };
    const { ok, data } = await postAuthJson("/api/companies/register", { ...details, pin, consent: true });
    if (!ok) return toPinSubmitError(data, "Не удалось зарегистрировать компанию");
    window.location.href = "/dashboard";
    return null;
  };

  if (details) {
    return (
      <AuthShell title="Регистрация компании" subtitle="Последний шаг — PIN для входа">
        <div className="login-form">
          <PinFlow mode="create" phone={details.phone} onSubmit={submitPin} onBack={() => setDetails(null)} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Регистрация компании" subtitle="Вы станете администратором. Это бесплатно.">
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
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-foreground">Название компании</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="ИП Иванов Иван" className={fieldClass} maxLength={255} autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage className="text-sm mt-1" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-foreground">Email для уведомлений</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="admin@company.ru" className={fieldClass} maxLength={255} autoComplete="email" inputMode="email" {...field} />
                </FormControl>
                <FormMessage className="text-sm mt-1" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="adminName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-foreground">
                  Ваше имя <span className="text-muted-foreground font-normal">(необязательно)</span>
                </FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Иван Иванов" className={fieldClass} maxLength={255} autoComplete="name" autoCapitalize="words" {...field} />
                </FormControl>
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
