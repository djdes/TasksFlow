import { PageSkeleton } from "@/components/PageSkeleton";
import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/PhoneInput";
import { AuthShell } from "@/components/AuthShell";
import { PinFlow, type PinSubmitError } from "@/components/PinFlow";
import { LegalConsent, TermsNote } from "@/components/LegalConsent";
import { postAuthJson, toPinSubmitError } from "@/lib/auth-api";

type Preview =
  | { valid: true; companyName: string; position: string | null }
  | { valid: false; reason: "not_found" | "used" | "revoked" };

const REASON_TEXT: Record<"not_found" | "used" | "revoked", string> = {
  not_found: "Ссылка не найдена. Уточните её у администратора.",
  used: "Эта ссылка уже использована.",
  revoked: "Администратор отозвал это приглашение.",
};

const fieldClass = "h-12 rounded-xl border-2 border-border bg-card px-4 text-base";

export default function JoinByInvite() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [detailsDone, setDetailsDone] = useState(false);
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);

  useEffect(() => {
    fetch(`/api/invitations/by-token/${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(30_000),
    })
      .then((r) => r.json())
      .then(setPreview)
      .catch(() => setPreview({ valid: false, reason: "not_found" }));
  }, [token]);

  if (!preview) return <PageSkeleton />;

  if (!preview.valid) {
    return (
      <AuthShell title="Ссылка недействительна" subtitle={REASON_TEXT[preview.reason]}>
        <a href="/login" className="login-link mt-4 inline-flex justify-center">Перейти ко входу</a>
      </AuthShell>
    );
  }

  const onDetails = (e: FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    if (!consent) {
      setConsentError("Отметьте согласие, чтобы продолжить");
      return;
    }
    setDetailsDone(true);
  };

  const submitPin = async (pin: string): Promise<PinSubmitError | null> => {
    const { ok, data } = await postAuthJson(`/api/invitations/by-token/${encodeURIComponent(token)}/accept`, {
      phone,
      name,
      pin,
      consent: true,
    });
    if (ok) {
      window.location.href = "/dashboard";
      return null;
    }
    const reason = data.reason;
    if (reason === "not_found" || reason === "used" || reason === "revoked") {
      setPreview({ valid: false, reason });
      return null;
    }
    // Ошибка в имени или телефоне — возвращаем к форме с подсказкой у поля.
    if (data.field === "phone" || data.field === "name") {
      setFieldError({ field: String(data.field), message: String(data.message ?? "Проверьте поле") });
      setDetailsDone(false);
      return null;
    }
    return toPinSubmitError(data);
  };

  const subtitle = (
    <>
      Компания «{preview.companyName}»{preview.position ? ` · ${preview.position}` : ""}
    </>
  );

  if (detailsDone) {
    return (
      <AuthShell title="Регистрация по приглашению" subtitle={subtitle}>
        <div className="login-form">
          <PinFlow mode="create" phone={phone} onSubmit={submitPin} onBack={() => setDetailsDone(false)} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Регистрация по приглашению" subtitle={subtitle}>
      <form onSubmit={onDetails} className="login-form !gap-4">
        <div className="space-y-2">
          <Label htmlFor="join-name" className="text-sm font-semibold">Ваше имя</Label>
          <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={255} autoComplete="name" className={fieldClass} />
          {fieldError?.field === "name" && <p className="text-sm text-destructive">{fieldError.message}</p>}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Телефон</Label>
          <PhoneInput value={phone} onChange={setPhone} className={`${fieldClass} text-lg font-medium tracking-wider`} />
          {fieldError?.field === "phone" && <p className="text-sm text-destructive">{fieldError.message}</p>}
        </div>

        <LegalConsent
          checked={consent}
          onChange={(value) => {
            setConsent(value);
            if (value) setConsentError(null);
          }}
          error={consentError}
        />

        <Button type="submit" className="login-submit w-full h-12 rounded-xl text-base font-semibold" disabled={!name.trim() || phone.length < 12}>
          Далее — придумать PIN
        </Button>
        <TermsNote />
      </form>
    </AuthShell>
  );
}
