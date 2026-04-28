import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/hooks/use-toast";

type Preview =
  | { valid: true; companyName: string; position: string | null }
  | { valid: false; reason: "not_found" | "used" | "revoked" };

const REASON_TEXT: Record<"not_found" | "used" | "revoked", string> = {
  not_found: "Ссылка не найдена. Уточните её у администратора.",
  used: "Эта ссылка уже использована.",
  revoked: "Администратор отозвал это приглашение.",
};

export default function JoinByInvite() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{
    message: string;
    field?: string;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/invitations/by-token/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setPreview)
      .catch(() => setPreview({ valid: false, reason: "not_found" }));
  }, [token]);

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!preview.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-2xl font-bold">Ссылка недействительна</h1>
          <p className="text-muted-foreground">{REASON_TEXT[preview.reason]}</p>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const r = await fetch(
        `/api/invitations/by-token/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone, name }),
        },
      );
      const body = await r.json();
      if (!r.ok) {
        setSubmitError(body);
        if (body.reason && ["not_found", "used", "revoked"].includes(body.reason)) {
          setPreview({ valid: false, reason: body.reason });
        }
        return;
      }
      toast({ title: `Добро пожаловать в ${body.company.name}` });
      window.location.href = "/dashboard";
    } catch (err) {
      setSubmitError({
        message: err instanceof Error ? err.message : "Ошибка регистрации",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Регистрация в компании</h1>
          <div className="text-2xl font-extrabold">{preview.companyName}</div>
          {preview.position && (
            <div className="text-sm text-muted-foreground">
              Должность: {preview.position}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Ваше имя</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
          />
          {submitError?.field === "name" && (
            <p className="text-sm text-destructive">{submitError.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Телефон</Label>
          <PhoneInput value={phone} onChange={setPhone} />
          {submitError?.field === "phone" && (
            <p className="text-sm text-destructive">{submitError.message}</p>
          )}
        </div>

        {submitError && !submitError.field && (
          <p className="text-sm text-destructive text-center">
            {submitError.message}
          </p>
        )}

        <Button
          type="submit"
          className="w-full h-14"
          disabled={submitting || !name.trim() || phone.length < 12}
        >
          {submitting ? "Регистрация..." : "Зарегистрироваться"}
        </Button>
      </form>
    </div>
  );
}
